// Armado del informe por edificio. Lógica PURA (sin IO): la comparten la vista web
// (components/informes/*) y el generador de PDF (lib/informe-pdf.tsx), para que lo que
// se ve en pantalla y lo que sale impreso no puedan divergir.

import type { EstadoTarea, Prioridad, Tarea } from "@/types";

export type GrupoInforme = "Pendientes" | "En Proceso" | "Realizadas";

// Orden fijo de los grupos en el informe.
export const GRUPOS_INFORME: GrupoInforme[] = ["Pendientes", "En Proceso", "Realizadas"];

// Los 7 estados del ciclo de vida se consolidan en 3 bloques legibles para quien recibe
// el informe. La columna Estado de cada fila igual muestra el estado exacto.
const GRUPO_POR_ESTADO: Record<EstadoTarea, GrupoInforme> = {
  "Sin asignar": "Pendientes",
  Asignada: "Pendientes",
  Aceptada: "Pendientes",
  "En Proceso": "En Proceso",
  "En Revisión": "En Proceso",
  Objetada: "En Proceso",
  Realizada: "Realizadas",
};

const PESO_PRIORIDAD: Record<Prioridad, number> = { Alta: 0, Media: 1, Baja: 2 };

export interface GrupoTareas {
  grupo: GrupoInforme;
  tareas: Tarea[];
}

// Los tres grupos se devuelven SIEMPRE, aun vacíos; quien renderiza decide si oculta
// los que no tienen filas.
export function agruparParaInforme(tareas: Tarea[]): GrupoTareas[] {
  const porGrupo = new Map<GrupoInforme, Tarea[]>(GRUPOS_INFORME.map((g) => [g, []]));
  for (const t of tareas) {
    const grupo = GRUPO_POR_ESTADO[t.estado] ?? "Pendientes";
    porGrupo.get(grupo)!.push(t);
  }
  return GRUPOS_INFORME.map((grupo) => ({
    grupo,
    tareas: [...porGrupo.get(grupo)!].sort(compararTareas),
  }));
}

function compararTareas(a: Tarea, b: Tarea): number {
  const porPrioridad = PESO_PRIORIDAD[a.prioridad] - PESO_PRIORIDAD[b.prioridad];
  if (porPrioridad !== 0) return porPrioridad;
  return a.fechaInicio.localeCompare(b.fechaInicio);
}

export type OrigenComentario = "objecion" | "revision" | "proceso" | null;

export interface ComentarioInforme {
  texto: string;
  origen: OrigenComentario;
}

// Comentario a mostrar en la columna: el más reciente del ciclo, en cascada.
// Objeción del admin > comentario de revisión > comentario en proceso.
export function comentarioMasReciente(t: Tarea): ComentarioInforme {
  const objecion = t.notaObjecion?.trim();
  if (objecion) return { texto: objecion, origen: "objecion" };
  const revision = t.comentarioRevision?.trim();
  if (revision) return { texto: revision, origen: "revision" };
  const proceso = t.comentarioEnProceso?.trim();
  if (proceso) return { texto: proceso, origen: "proceso" };
  return { texto: "", origen: null };
}

export const ETIQUETA_COMENTARIO: Record<Exclude<OrigenComentario, null>, string> = {
  objecion: "Objeción",
  revision: "Revisión",
  proceso: "En proceso",
};

// Nombre del PDF descargado. Se normaliza a ASCII: los acentos y espacios en un
// Content-Disposition traen problemas de encoding entre navegadores.
export function nombreArchivoInforme(edificio: string, desde?: string, hasta?: string): string {
  const slug = edificio
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // marcas de acento sueltas que deja el NFD
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  const rango = [desde, hasta].filter(Boolean).join("_");
  return rango ? `informe-${slug}-${rango}.pdf` : `informe-${slug}.pdf`;
}
