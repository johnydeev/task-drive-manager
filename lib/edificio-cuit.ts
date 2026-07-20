import type { Consorcio } from "./consorcios";
import { edificioMatches } from "./sheets/edificios";

// Resuelve el CUIT de un edificio a partir de su nombre, contra el listado de
// _Consorcios. Matchea por nombre canónico o por cualquiera de sus nombres
// alternativos (comparación normalizada: mayúsculas/acentos/espacios).
// Devuelve el CUIT, o null si no matchea o el consorcio no tiene CUIT cargado.
export function resolveCuit(nombre: string, consorcios: Consorcio[]): string | null {
  const target = (nombre ?? "").trim();
  if (!target) return null;
  const match = consorcios.find(
    (c) =>
      edificioMatches(c.nombre, target) ||
      c.nombresAlternativos.some((alt) => edificioMatches(alt, target))
  );
  return match?.cuit ?? null;
}

// --- Backfill (usado por el script scripts/backfill-cuit.mjs) ---

export interface BackfillItem {
  rowNumber: number;
  edificio: string;
  cuitActual: string;
}

export interface BackfillPlan {
  // Filas sin CUIT cuyo edificio SÍ resuelve: hay que escribirlas.
  aEscribir: { rowNumber: number; edificio: string; cuit: string }[];
  // Filas sin CUIT cuyo edificio NO matchea ningún consorcio: se reportan.
  sinMatch: { rowNumber: number; edificio: string }[];
  // Filas que ya tenían un CUIT: se dejan como están (idempotente).
  yaOk: number;
}

// Calcula qué haría el backfill sobre un set de filas, sin tocar nada.
// No sobrescribe filas que ya tienen CUIT.
export function planBackfill(items: BackfillItem[], consorcios: Consorcio[]): BackfillPlan {
  const plan: BackfillPlan = { aEscribir: [], sinMatch: [], yaOk: 0 };
  for (const it of items) {
    if (it.cuitActual.trim() !== "") {
      plan.yaOk++;
      continue;
    }
    const cuit = resolveCuit(it.edificio, consorcios);
    if (cuit) {
      plan.aEscribir.push({ rowNumber: it.rowNumber, edificio: it.edificio, cuit });
    } else {
      plan.sinMatch.push({ rowNumber: it.rowNumber, edificio: it.edificio });
    }
  }
  return plan;
}
