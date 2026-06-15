/// <reference lib="webworker" />
// Service Worker compilado por serwist. Esta es la "fuente" — el archivo final servido
// será /sw.js (lo genera el build de Next con la precache list inyectada).
//
// Estrategias por endpoint:
// - /api/auth/*       → NetworkOnly  (nunca cachear sesiones)
// - /api/upload       → NetworkOnly  (multipart, no tiene sentido cachear)
// - /api/tareas*      → NetworkFirst con timeout 3s (offline fallback a último response)
// - /api/edificios    → NetworkFirst (cambia poco)
// - /api/dptos*       → NetworkFirst
// - /api/configuracion→ StaleWhileRevalidate (cambia raramente, ok servir cacheado)
// - drive.google.com  → CacheFirst (thumbnails)
// - assets de Next    → defaultCache (CacheFirst con versionado de hash)

import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from "serwist";
import {
  CacheFirst,
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
  Serwist,
  StaleWhileRevalidate,
} from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const customRuntimeCaching: RuntimeCaching[] = [
  // Auth: nunca cachear, nunca servir vía SW. Pasa derecho a la red.
  {
    matcher: ({ url }) => url.pathname.startsWith("/api/auth"),
    handler: new NetworkOnly(),
  },
  // Upload: multipart hacia Drive, no cachear.
  {
    matcher: ({ url }) => url.pathname.startsWith("/api/upload"),
    handler: new NetworkOnly(),
  },
  // Tareas: NetworkFirst. Si hay red, traer fresco; si no, último cacheado.
  {
    matcher: ({ url }) => url.pathname.startsWith("/api/tareas"),
    handler: new NetworkFirst({
      cacheName: "api-tareas",
      networkTimeoutSeconds: 3,
      plugins: [
        new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 24 * 60 * 60 }),
      ],
    }),
  },
  // Edificios y dptos: NetworkFirst (cambian raramente).
  {
    matcher: ({ url }) =>
      url.pathname === "/api/edificios" || url.pathname.startsWith("/api/dptos"),
    handler: new NetworkFirst({
      cacheName: "api-listas",
      networkTimeoutSeconds: 3,
      plugins: [
        new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 7 * 24 * 60 * 60 }),
      ],
    }),
  },
  // Configuración: SWR. Servir cacheado ya mismo, revalidar en background.
  {
    matcher: ({ url }) => url.pathname === "/api/configuracion",
    handler: new StaleWhileRevalidate({
      cacheName: "api-config",
      plugins: [
        new ExpirationPlugin({ maxEntries: 5, maxAgeSeconds: 60 * 60 }),
      ],
    }),
  },
  // Respuestas (admin): NetworkFirst.
  {
    matcher: ({ url }) => url.pathname.startsWith("/api/respuestas"),
    handler: new NetworkFirst({
      cacheName: "api-respuestas",
      networkTimeoutSeconds: 3,
      plugins: [
        new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 24 * 60 * 60 }),
      ],
    }),
  },
  // Thumbnails de Drive: CacheFirst (las URLs incluyen el file id, así que son inmutables).
  {
    matcher: ({ url }) =>
      url.hostname === "drive.google.com" && url.pathname === "/thumbnail",
    handler: new CacheFirst({
      cacheName: "drive-thumbs",
      plugins: [
        new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 }),
      ],
    }),
  },
  // Resto: las defaults de serwist (incluye HTML pages, RSC, JS, CSS, imágenes Next, etc.).
  ...defaultCache,
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: false, // ← lo controla el banner "Nueva versión" desde la UI
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: customRuntimeCaching,
});

serwist.addEventListeners();

// =====================================================
// Background Sync — vacía la cola de tareas pendientes cuando vuelve la red.
// Solo Chrome/Edge/Android. Safari/iOS hacen sync al reabrir la app.
// =====================================================

self.addEventListener("sync", ((event: ExtendableEvent & { tag: string }) => {
  if (event.tag === "sync-tareas") {
    event.waitUntil(syncPendingFromSW());
  }
}) as EventListener);

// Mensajes desde la app para forzar acciones del SW.
self.addEventListener("message", (event: ExtendableMessageEvent) => {
  if ((event.data as { type?: string } | undefined)?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// Implementación de sync dentro del SW. No puede importar offline-sync.ts
// (ese módulo asume `window`); replica la lógica leyendo IndexedDB con la
// API nativa del SW y posteando a /api/tareas.
async function syncPendingFromSW(): Promise<void> {
  // Abrir Dexie DB con la API estándar de IndexedDB.
  const db = await openDb("task-drive-manager", 1);
  const tx = db.transaction("tareasPendientes", "readwrite");
  const store = tx.objectStore("tareasPendientes");

  // Obtener todas las pendientes con pendingSync === true.
  const all = await reqToPromise<unknown[]>(store.getAll());
  const pendientes = (all as PendienteRow[]).filter(
    (r) => r.pendingSync === true && (r.retries ?? 0) < 3
  );

  for (const p of pendientes) {
    try {
      const res = await fetch("/api/tareas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objetivo: p.objetivo,
          fechaInicio: p.fechaInicio,
          fechaEstimada: p.fechaEstimada,
          edificio: p.edificio,
          parteComun: p.parteComun,
          dpto: p.dpto,
          informe: p.informe,
          imagenes: p.imagenes ?? [],
          videos: p.videos ?? [],
          proveedor: p.proveedor,
          estado: p.estado,
          presupuesto: p.presupuesto,
          prioridad: p.prioridad,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const created = (await res.json()) as { rowId: string };
      p.pendingSync = false;
      p.sheetRowId = created.rowId;
    } catch {
      p.retries = (p.retries ?? 0) + 1;
    }
    await reqToPromise(store.put(p));
  }

  await txDone(tx);
  db.close();

  // Notificar a las pestañas abiertas para que invaliden TanStack Query.
  const clientsList = await self.clients.matchAll({ type: "window" });
  for (const c of clientsList) c.postMessage({ type: "TAREAS_SYNCED" });
}

interface PendienteRow {
  localId: string;
  pendingSync: boolean;
  retries?: number;
  sheetRowId?: string;
  objetivo: string;
  fechaInicio: string;
  fechaEstimada: string;
  edificio: string;
  parteComun: boolean;
  dpto: string;
  informe: string;
  imagenes?: string[];
  videos?: string[];
  proveedor?: string;
  estado: string;
  presupuesto?: number;
  prioridad: string;
}

// Helpers IndexedDB nativos.
function openDb(name: string, version: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, version);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

