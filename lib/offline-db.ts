// IndexedDB local con Dexie. Solo se inicializa en el cliente.
//
// Esquema mínimo para soportar:
// - tareasPendientes: cola de tareas creadas sin conexión, esperando sync
// - cache: KV de listas (edificios, dptos, configuracion) para mostrar el form sin red

import Dexie, { Table } from "dexie";
import type { Configuracion, Dpto, Edificio, TareaPendiente } from "@/types";

interface CacheEntry<T> {
  key: string;
  value: T;
  updatedAt: string;
}

class AppDB extends Dexie {
  tareasPendientes!: Table<TareaPendiente, string>;
  cacheEdificios!: Table<CacheEntry<Edificio[]>, string>;
  cacheDptos!: Table<CacheEntry<Dpto[]>, string>;
  cacheConfig!: Table<CacheEntry<Configuracion>, string>;

  constructor() {
    super("task-drive-manager");
    this.version(1).stores({
      // Dexie no indexa booleans nativos, así que pendingSync se filtra en JS.
      tareasPendientes: "localId, createdAt",
      cacheEdificios: "key",
      cacheDptos: "key",
      cacheConfig: "key",
    });
  }
}

let dbInstance: AppDB | null = null;

export function getDb(): AppDB {
  if (typeof window === "undefined") {
    throw new Error("offline-db solo puede usarse en el cliente");
  }
  if (!dbInstance) dbInstance = new AppDB();
  return dbInstance;
}

// =====================================================
// Cache helpers (TTL en cliente)
// =====================================================

const TTL_MS = 30 * 60 * 1000; // 30 min — la red es la fuente, esto es para offline

function isFresh(updatedAt: string): boolean {
  const t = Date.parse(updatedAt);
  return Number.isFinite(t) && Date.now() - t < TTL_MS;
}

export async function cacheEdificios(value: Edificio[]) {
  const db = getDb();
  await db.cacheEdificios.put({ key: "all", value, updatedAt: new Date().toISOString() });
}

export async function readCachedEdificios(): Promise<Edificio[] | null> {
  const db = getDb();
  const entry = await db.cacheEdificios.get("all");
  if (!entry || !isFresh(entry.updatedAt)) return null;
  return entry.value;
}

export async function cacheDptos(edificio: string, value: Dpto[]) {
  const db = getDb();
  await db.cacheDptos.put({ key: edificio, value, updatedAt: new Date().toISOString() });
}

export async function readCachedDptos(edificio: string): Promise<Dpto[] | null> {
  const db = getDb();
  const entry = await db.cacheDptos.get(edificio);
  if (!entry || !isFresh(entry.updatedAt)) return null;
  return entry.value;
}

export async function cacheConfig(value: Configuracion) {
  const db = getDb();
  await db.cacheConfig.put({ key: "current", value, updatedAt: new Date().toISOString() });
}

export async function readCachedConfig(): Promise<Configuracion | null> {
  const db = getDb();
  const entry = await db.cacheConfig.get("current");
  if (!entry || !isFresh(entry.updatedAt)) return null;
  return entry.value;
}

// =====================================================
// Tareas pendientes de sync
// =====================================================

export async function enqueueTarea(t: TareaPendiente) {
  const db = getDb();
  await db.tareasPendientes.put(t);
}

export async function listPendientes(): Promise<TareaPendiente[]> {
  const db = getDb();
  return db.tareasPendientes.filter((t) => t.pendingSync === true).toArray();
}

export async function markSynced(localId: string, sheetRowId: string) {
  const db = getDb();
  await db.tareasPendientes.update(localId, { pendingSync: false, sheetRowId });
}

export async function incrementRetries(localId: string) {
  const db = getDb();
  const item = await db.tareasPendientes.get(localId);
  if (!item) return;
  await db.tareasPendientes.update(localId, { retries: (item.retries ?? 0) + 1 });
}

export async function countPendientes(): Promise<number> {
  const db = getDb();
  // Dexie no indexa booleans; usamos filter.
  return db.tareasPendientes.filter((t) => t.pendingSync === true).count();
}
