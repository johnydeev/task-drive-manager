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
import { clasificarStatus } from "@/lib/sync-clasificacion";
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
  // Timeout amplio (10s): GET /api/tareas lee toda la hoja Tareas + TareaArchivos
  // (dos llamadas a Sheets) y con 3s caía al cache por lentitud normal, sirviendo
  // datos viejos aun estando online.
  {
    matcher: ({ url }) => url.pathname.startsWith("/api/tareas"),
    handler: new NetworkFirst({
      cacheName: "api-tareas",
      networkTimeoutSeconds: 10,
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

// =====================================================
// Web Push — muestra el aviso y, al tocarlo, abre/enfoca la app en la URL del aviso.
// El payload lo arma lib/push.ts (tipo Aviso).
// =====================================================
interface AvisoPush {
  titulo: string;
  cuerpo: string;
  url: string;
  tag?: string;
}

self.addEventListener("push", (event: PushEvent) => {
  let aviso: AvisoPush | null = null;
  try {
    aviso = event.data?.json() as AvisoPush;
  } catch {
    return;
  }
  if (!aviso?.titulo) return;
  event.waitUntil(
    self.registration.showNotification(aviso.titulo, {
      body: aviso.cuerpo,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: aviso.tag,
      data: { url: aviso.url },
    })
  );
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? "/tareas";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clientes) => {
      const abierta = clientes.find((c): c is WindowClient => "focus" in c);
      if (abierta) {
        await abierta.focus();
        if ("navigate" in abierta) await abierta.navigate(url);
        return;
      }
      await self.clients.openWindow(url);
    })
  );
});

// Implementación de sync dentro del SW. No puede importar offline-sync.ts (asume `window`
// y Dexie); replica la lógica con IndexedDB nativo y la misma regla red/rechazo
// (lib/sync-clasificacion). Ninguna transacción abarca un `await fetch`: IndexedDB cierra
// la transacción apenas no quedan requests pendientes, y un put posterior tira
// TransactionInactiveError.
async function syncPendingFromSW(): Promise<void> {
  const db = await openDb("task-drive-manager");
  // Si el SW despertó antes de que la app creara la base, no hay store ni cola.
  if (!db.objectStoreNames.contains("tareasPendientes")) {
    db.close();
    return;
  }

  const todas = await leerPendientes(db);
  const pendientes = todas.filter((r) => r.pendingSync === true && !r.errorMsg);

  for (const p of pendientes) {
    let cambio: Partial<PendienteRow>;
    try {
      const res = await fetch("/api/tareas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rowId: p.rowId,
          objetivo: p.objetivo,
          fechaInicio: p.fechaInicio,
          fechaEstimada: p.fechaEstimada,
          edificio: p.edificio,
          parteComun: p.parteComun,
          dpto: p.dpto,
          informe: p.informe,
          imagenes: p.imagenes ?? [],
          videos: p.videos ?? [],
          documentos: p.documentos ?? [],
          proveedor: p.proveedor,
          estado: p.estado,
          presupuesto: p.presupuesto,
          prioridad: p.prioridad,
        }),
      });
      if (res.ok) {
        const created = (await res.json()) as { rowId: string };
        cambio = { pendingSync: false, sheetRowId: created.rowId };
      } else if (clasificarStatus(res.status) === "rechazo") {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        cambio = { errorMsg: body?.error ?? `Rechazada por el servidor (${res.status})` };
      } else {
        cambio = { retries: (p.retries ?? 0) + 1 };
      }
    } catch {
      cambio = { retries: (p.retries ?? 0) + 1 };
    }
    await guardarPendiente(db, { ...p, ...cambio });
  }

  db.close();

  // Notificar a las pestañas abiertas para que invaliden TanStack Query.
  const clientsList = await self.clients.matchAll({ type: "window" });
  for (const c of clientsList) c.postMessage({ type: "TAREAS_SYNCED" });
}

interface PendienteRow {
  localId: string;
  rowId?: string;
  pendingSync: boolean;
  retries?: number;
  sheetRowId?: string;
  errorMsg?: string;
  objetivo: string;
  fechaInicio: string;
  fechaEstimada: string;
  edificio: string;
  parteComun: boolean;
  dpto: string;
  informe: string;
  imagenes?: string[];
  videos?: string[];
  documentos?: string[];
  proveedor?: string;
  estado: string;
  presupuesto?: number;
  prioridad: string;
}

// Helpers IndexedDB nativos. Sin versión: abre la vigente (la que creó Dexie desde la app).
function openDb(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function leerPendientes(db: IDBDatabase): Promise<PendienteRow[]> {
  const tx = db.transaction("tareasPendientes", "readonly");
  const rows = await reqToPromise<unknown[]>(tx.objectStore("tareasPendientes").getAll());
  await txDone(tx);
  return rows as PendienteRow[];
}

async function guardarPendiente(db: IDBDatabase, row: PendienteRow): Promise<void> {
  const tx = db.transaction("tareasPendientes", "readwrite");
  await reqToPromise(tx.objectStore("tareasPendientes").put(row));
  await txDone(tx);
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

