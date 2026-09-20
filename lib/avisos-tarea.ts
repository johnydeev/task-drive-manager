import type { Aviso, Tarea } from "@/types";

export type AccionAvisada = "asignar" | "revisar" | "objetar";

function donde(t: Tarea): string {
  return [t.edificio, t.dpto].filter((x) => x && x.trim()).join(" · ");
}

function recortar(s: string, max: number): string {
  const limpio = s.trim().replace(/\s+/g, " ");
  return limpio.length > max ? `${limpio.slice(0, max - 1)}…` : limpio;
}

// Arma el aviso push de una acción del ciclo de vida. Puro: no decide destinatarios.
export function avisoDeTarea(
  accion: AccionAvisada,
  t: Tarea,
  opts: { asignadoNombre?: string } = {}
): Aviso {
  const url = `/tareas/${encodeURIComponent(t.rowId)}`;
  const objetivo = t.objetivo || "(sin objetivo)";
  switch (accion) {
    case "asignar":
      return {
        titulo: "Te asignaron una tarea",
        cuerpo: recortar(`${objetivo} · ${donde(t)}`, 160),
        url,
      };
    case "revisar": {
      const quien = opts.asignadoNombre ? ` — ${opts.asignadoNombre}` : "";
      return {
        titulo: "Tarea lista para revisar",
        cuerpo: recortar(`${objetivo} · ${donde(t)}${quien}`, 160),
        url,
      };
    }
    case "objetar":
      return {
        titulo: "Tu tarea fue objetada",
        cuerpo: recortar(`${objetivo}: ${t.notaObjecion ?? ""}`, 120),
        url,
      };
  }
}
