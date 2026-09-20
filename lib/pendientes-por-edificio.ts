// Cuántas tareas ABIERTAS tiene cada consorcio. Lógica PURA (sin IO).
//
// "Pendiente" acá = todo lo que no llegó a `Realizada` (6 de los 7 estados). Es una
// lectura distinta de las otras dos que ya viven en el repo, a propósito:
//   - lib/informes.ts   → "Pendientes" excluye En Proceso / En Revisión / Objetada.
//   - lib/dashboard.ts  → `pendiente` excluye En Proceso / En Revisión (Objetada sí suma).
// Ninguna de las dos se toca: este contador responde "cuánto trabajo abierto tiene el
// edificio", que es lo que se muestra en el pill de /edificios.
//
// El `estado` es el persistido en la hoja: no hay cierre automático (una tarea En Revisión
// cuenta como pendiente hasta que el admin la cierre).
//
// IMPORTANTE: este módulo lo importa un componente de cliente. NO puede depender de
// lib/sheets/*, que arrastra `googleapis` y rompe el build con
// "Can't resolve 'child_process' / 'fs'" (los tests no lo ven: vitest corre en Node).

import { normalizeEdificio } from "./edificio-match";
import type { Tarea } from "@/types";

// Clave del mapa: el nombre normalizado. Las tareas viejas referencian el consorcio con
// otra capitalización/acentuación que _Consorcios, y comparar crudo daría todo en cero.
export function contarPendientesPorEdificio(tareas: Tarea[]): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const t of tareas) {
    if (t.estado === "Realizada") continue;
    const clave = normalizeEdificio(t.edificio ?? "");
    if (!clave) continue;
    mapa.set(clave, (mapa.get(clave) ?? 0) + 1);
  }
  return mapa;
}

// Un edificio sin ninguna tarea abierta devuelve 0, no undefined: el badge siempre dibuja
// un número.
export function pendientesDe(mapa: Map<string, number>, edificio: string): number {
  return mapa.get(normalizeEdificio(edificio)) ?? 0;
}
