// Procesa la cola de tareas pendientes contra /api/tareas.
// Estrategia: simple loop con incremento de retries. Sin SW; corre en el cliente.

import { api } from "./api-client";
import {
  getDb,
  incrementRetries,
  listPendientes,
  markSynced,
} from "./offline-db";
import type { TareaPendiente } from "@/types";

const MAX_RETRIES = 3;

export interface SyncResult {
  ok: number;
  failed: number;
  skipped: number;
}

let syncing = false;

export async function syncPendingTareas(): Promise<SyncResult> {
  if (typeof window === "undefined") return { ok: 0, failed: 0, skipped: 0 };
  if (!navigator.onLine) return { ok: 0, failed: 0, skipped: 0 };
  if (syncing) return { ok: 0, failed: 0, skipped: 0 };

  syncing = true;
  const result: SyncResult = { ok: 0, failed: 0, skipped: 0 };

  try {
    const pendientes = await listPendientes();
    for (const p of pendientes) {
      if ((p.retries ?? 0) >= MAX_RETRIES) {
        result.skipped++;
        continue;
      }
      try {
        const created = await api.tareas.create({
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
        });
        await markSynced(p.localId, created.rowId);
        result.ok++;
      } catch (err) {
        console.warn("[offline-sync] no se pudo subir", p.localId, err);
        await incrementRetries(p.localId);
        result.failed++;
      }
    }
  } finally {
    syncing = false;
  }

  return result;
}

// Borra las tareas que ya fueron sincronizadas (pendingSync=false) y son viejas (> 7 días).
export async function cleanupSyncedTareas(): Promise<number> {
  const db = getDb();
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const toDelete: string[] = [];
  await db.tareasPendientes.each((t: TareaPendiente) => {
    if (!t.pendingSync && Date.parse(t.createdAt) < cutoff) toDelete.push(t.localId);
  });
  if (toDelete.length > 0) await db.tareasPendientes.bulkDelete(toDelete);
  return toDelete.length;
}
