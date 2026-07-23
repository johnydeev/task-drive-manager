import type { EstadoTarea, Tarea } from "@/types";

export const HORAS_72_MS = 72 * 60 * 60 * 1000;

// Estado efectivo (derivado). Una tarea En Revisión que superó las 72h desde revisionEn
// se considera Realizada. Puro cómputo on-read: nunca se persiste. Espejo de
// lib/directivas-estado.ts (cierre automático de la Directiva).
export function estadoEfectivoTarea(t: Tarea, now: number = Date.now()): EstadoTarea {
  if (t.estado === "En Revisión" && t.revisionEn) {
    const ts = new Date(t.revisionEn).getTime();
    if (!Number.isNaN(ts) && now - ts > HORAS_72_MS) return "Realizada";
  }
  return t.estado;
}
