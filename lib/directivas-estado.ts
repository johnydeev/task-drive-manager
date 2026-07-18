import type { Directiva, DirectivaEstado } from "@/types";

export const HORAS_72_MS = 72 * 60 * 60 * 1000;

// Estado efectivo (derivado). Una directiva Realizada que superó las 72h desde su
// cierre se considera Cerrada. No hay persistencia: es puro cómputo on-read.
export function estadoEfectivo(d: Directiva, now: number = Date.now()): DirectivaEstado {
  if (d.estado === "Realizada" && d.realizadaEn) {
    const t = new Date(d.realizadaEn).getTime();
    if (!Number.isNaN(t) && now - t > HORAS_72_MS) return "Cerrada";
  }
  return d.estado;
}
