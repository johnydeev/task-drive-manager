// Procesa la cola de tareas pendientes contra /api/tareas.
// Estrategia: loop secuencial. Fallo de red → se reintenta en el próximo disparo, sin tope.
// Rechazo del server (4xx) → queda marcada (errorMsg) hasta que el usuario reintente o descarte.
// Corre en el cliente; el Service Worker (app/sw.ts) tiene su propia versión con la misma regla.

import { api } from "./api-client";
import { getDb, incrementRetries, listPendientes, markSynced, marcarRechazada } from "./offline-db";
import { clasificarFalloSync } from "./sync-clasificacion";
import type { TareaPendiente } from "@/types";

export interface SyncResult {
  ok: number;
  failed: number; // red: se reintentan solas
  rechazadas: number; // 4xx: esperan al usuario
}

let syncing = false;

export async function syncPendingTareas(): Promise<SyncResult> {
  const vacio: SyncResult = { ok: 0, failed: 0, rechazadas: 0 };
  if (typeof window === "undefined") return vacio;
  if (!navigator.onLine) return vacio;
  if (syncing) return vacio;

  syncing = true;
  const result: SyncResult = { ok: 0, failed: 0, rechazadas: 0 };

  try {
    const pendientes = await listPendientes();
    for (const p of pendientes) {
      try {
        // rowId: el server es idempotente por id (un reintento o el SW en paralelo no duplican).
        const created = await api.tareas.create({
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
        });
        await markSynced(p.localId, created.rowId);
        result.ok++;
      } catch (err) {
        if (clasificarFalloSync(err) === "rechazo") {
          console.warn("[offline-sync] rechazada por el server", p.localId, err);
          await marcarRechazada(
            p.localId,
            err instanceof Error ? err.message : "Rechazada por el servidor"
          );
          result.rechazadas++;
        } else {
          console.warn("[offline-sync] no se pudo subir (red)", p.localId, err);
          await incrementRetries(p.localId);
          result.failed++;
        }
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
