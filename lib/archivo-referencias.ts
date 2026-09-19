import type { Tarea, Usuario, Visita } from "@/types";
import { extractFileId } from "./google-drive";
import { getTareas, getUsuarios, getVisitas } from "./google-sheets";

// Todo lugar de la Sheet que apunta a un archivo de Drive. Un archivo referenciado acá
// NO es staging y no se puede mandar a papelera desde DELETE /api/upload.
export interface ReferenciasArchivos {
  tareas: Tarea[]; // imagenes, videos, documentos (ya mergeados desde TareaArchivos) + reporteUrl
  visitas: Visita[]; // pdfUrl
  usuarios: Usuario[]; // firmaUrl
}

// Compara por fileId extraído de cada URL, no por string: un "?usp=sharing" pegado a mano
// en firma_url sigue matcheando. URLs sin id de Drive se ignoran.
export function estaReferenciado(fileId: string, refs: ReferenciasArchivos): boolean {
  const urls: (string | undefined)[] = [];
  for (const t of refs.tareas) {
    urls.push(...t.imagenes, ...t.videos, ...t.documentos, t.reporteUrl);
  }
  for (const v of refs.visitas) urls.push(v.pdfUrl);
  for (const u of refs.usuarios) urls.push(u.firmaUrl);
  return urls.some((url) => !!url && extractFileId(url) === fileId);
}

// getTareas() ya trae la media por tarea (lee TareaArchivos adentro) y reporteUrl: no se
// llama a getAllArchivos() aparte, sería leer la misma hoja dos veces.
export async function cargarReferencias(): Promise<ReferenciasArchivos> {
  const [tareas, visitas, usuarios] = await Promise.all([getTareas(), getVisitas(), getUsuarios()]);
  return { tareas, visitas, usuarios };
}
