import type { Prioridad, Tarea } from "@/types";
import { normalizar } from "./texto";

export type OrdenTareas = "prioridad" | "recientes" | "antiguas" | "estimada";
export const ORDENES: { value: OrdenTareas; label: string }[] = [
  { value: "prioridad", label: "Prioridad" },
  { value: "recientes", label: "Más recientes" },
  { value: "antiguas", label: "Más antiguas" },
  { value: "estimada", label: "Fecha estimada" },
];

// Búsqueda en memoria, sin acentos ni mayúsculas, sobre los campos de texto que el
// encargado recuerda: qué, dónde y quién.
export function buscarTareas(tareas: Tarea[], q: string): Tarea[] {
  const needle = normalizar(q.trim());
  if (!needle) return tareas;
  return tareas.filter((t) =>
    normalizar([t.objetivo, t.edificio, t.dpto, t.proveedor ?? "", t.informe].join(" ")).includes(
      needle
    )
  );
}

const PESO_PRIORIDAD: Record<Prioridad, number> = { Alta: 0, Media: 1, Baja: 2 };

// Creación a partir del rowId (timestamp ISO). No parseable → -Infinity (al final en desc).
function creacion(t: Tarea): number {
  const ms = Date.parse(t.rowId);
  return Number.isNaN(ms) ? -Infinity : ms;
}

// Devuelve copia ordenada. Estable.
export function ordenarTareas(tareas: Tarea[], orden: OrdenTareas): Tarea[] {
  const copia = [...tareas];
  switch (orden) {
    case "recientes":
      return copia.sort((a, b) => creacion(b) - creacion(a));
    case "antiguas":
      return copia.sort((a, b) => creacion(a) - creacion(b));
    case "estimada":
      return copia.sort((a, b) => {
        if (a.fechaEstimada && b.fechaEstimada) return a.fechaEstimada.localeCompare(b.fechaEstimada);
        if (a.fechaEstimada) return -1;
        if (b.fechaEstimada) return 1;
        return creacion(b) - creacion(a);
      });
    case "prioridad":
    default:
      // Abiertas antes que cerradas → Alta → Media → Baja → más reciente primero.
      return copia.sort((a, b) => {
        const cerradaA = a.estado === "Realizada" ? 1 : 0;
        const cerradaB = b.estado === "Realizada" ? 1 : 0;
        if (cerradaA !== cerradaB) return cerradaA - cerradaB;
        const pa = PESO_PRIORIDAD[a.prioridad] ?? 1;
        const pb = PESO_PRIORIDAD[b.prioridad] ?? 1;
        if (pa !== pb) return pa - pb;
        return creacion(b) - creacion(a);
      });
  }
}
