import { getSheetId } from "../google-auth";
import type {
  EstadoTarea,
  Prioridad,
  Tarea,
  TareaNuevaInput,
  TareaUpdateInput,
} from "@/types";
import { isDemoMode } from "../demo-mode";
import {
  createDemoTarea,
  deleteDemoTarea,
  getDemoTareaById,
  getDemoTareas,
  updateDemoTarea,
} from "../demo-data";
import { filterTareas, type TareaFilters } from "../tareas-filter";
import { getSheets, readRange, SHEETS, TAREAS_RANGE, getSheetGid } from "./core";
import { buildHeaderMap, colLetter, type HeaderMap } from "./headers";
import { toBool, boolToCell, toDateOnly } from "./values";
import {
  getAllArchivos,
  mediaFromArchivos,
  setArchivosForTarea,
  deleteArchivosByTarea,
  type MediaTarea,
} from "./tarea-archivos";

// Re-exportado para compatibilidad: consumidores históricos importan TareaFilters de acá.
export type { TareaFilters };

// Alias de columnas: nombre canónico (snake_case nuevo) -> nombres viejos aceptados.
const ID_ALIASES = ["rowId"];
const DPTO_ALIASES = ["Dpto / Parte común", "Dpto"];

// Mapea una fila de la Sheet a Tarea (por header, tolerando headers viejos/nuevos).
// La media NO vive en Tareas: se puebla aparte desde TareaArchivos (ver getTareas).
export function rowToTarea(h: HeaderMap, row: string[], rowNumber: number): Tarea {
  const g = (name: string, aliases?: string[]) => h.get(row, name, aliases);
  const presupuestoRaw = g("presupuesto");
  return {
    rowId: g("id", ID_ALIASES),
    rowNumber,
    objetivo: g("objetivo"),
    fechaInicio: toDateOnly(g("fecha_inicio")),
    fechaEstimada: toDateOnly(g("fecha_estimada")),
    edificio: g("edificio"),
    parteComun: toBool(g("parte_comun")),
    dpto: g("dpto", DPTO_ALIASES),
    informe: g("informe"),
    comentarioEnProceso: g("comentario_en_proceso") || undefined,
    comentarioRealizado: g("comentario_realizado") || undefined,
    imagenes: [],
    videos: [],
    documentos: [],
    reporteUrl: g("reporte_url") || undefined,
    proveedor: g("proveedor") || undefined,
    estado: (g("estado") as EstadoTarea) || "Pendiente",
    presupuesto: presupuestoRaw ? Number(presupuestoRaw) || undefined : undefined,
    fechaRealizado: toDateOnly(g("fecha_realizado")) || undefined,
    prioridad: (g("prioridad") as Prioridad) || "Media",
    supervisor: g("supervisor"),
    creadoEn: g("creado_en") || undefined,
    actualizadoEn: g("actualizado_en") || undefined,
  };
}

// Construye la fila a escribir según las posiciones del header map. El array se
// dimensiona al ancho de las columnas conocidas; cada campo va a la columna de su
// nombre (o se omite si esa columna no existe). La media NO se escribe acá.
export function tareaToRow(
  h: HeaderMap,
  t: Partial<Tarea> & { rowId: string }
): (string | number)[] {
  const CAMPOS = [
    "id", "objetivo", "fecha_inicio", "fecha_estimada", "edificio", "edificio_cuit",
    "parte_comun", "dpto", "informe", "comentario_en_proceso", "comentario_realizado",
    "reporte_url", "proveedor", "estado", "presupuesto", "fecha_realizado", "prioridad",
    "supervisor", "creado_en", "actualizado_en",
  ];
  const width = Math.max(1, ...CAMPOS.map((n) => h.index(n) + 1));
  const row: (string | number)[] = new Array(width).fill("");
  const set = (name: string, value: string | number, aliases?: string[]) => {
    const i = h.index(name, aliases);
    if (i !== -1) row[i] = value;
  };
  set("id", t.rowId, ID_ALIASES);
  set("objetivo", t.objetivo ?? "");
  set("fecha_inicio", toDateOnly(t.fechaInicio ?? ""));
  set("fecha_estimada", toDateOnly(t.fechaEstimada ?? ""));
  set("edificio", t.edificio ?? "");
  set("parte_comun", boolToCell(!!t.parteComun));
  set("dpto", t.dpto ?? "", DPTO_ALIASES);
  set("informe", t.informe ?? "");
  set("comentario_en_proceso", t.comentarioEnProceso ?? "");
  set("comentario_realizado", t.comentarioRealizado ?? "");
  set("reporte_url", t.reporteUrl ?? "");
  set("proveedor", t.proveedor ?? "");
  set("estado", t.estado ?? "Pendiente");
  set("presupuesto", t.presupuesto ?? "");
  set("fecha_realizado", toDateOnly(t.fechaRealizado ?? ""));
  set("prioridad", t.prioridad ?? "Media");
  set("supervisor", t.supervisor ?? "");
  set("creado_en", t.creadoEn ?? "");
  set("actualizado_en", t.actualizadoEn ?? "");
  return row;
}

// Detecta si la celda de una fila parece un rowId válido (timestamp ISO).
function looksLikeRowId(value: string | undefined): boolean {
  if (!value) return false;
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value.trim());
}

// Convierte las filas crudas de la Sheet a Tareas (sin media). La fila 1 es el
// header; se filtra por la columna id (alias rowId), tolerando header ausente y
// filas vacías intercaladas. rowNumber refleja la fila real (1-indexed).
export function parseTareasRows(rows: string[][]): Tarea[] {
  if (rows.length === 0) return [];
  const h = buildHeaderMap(rows[0] ?? []);
  const idIdx = h.index("id", ID_ALIASES);
  const col = idIdx === -1 ? 0 : idIdx;
  return rows
    .slice(1)
    .map((r, i) => ({ r, rowNumber: i + 2 }))
    .filter(({ r }) => looksLikeRowId(r[col]))
    .map(({ r, rowNumber }) => rowToTarea(h, r, rowNumber));
}

export async function getTareas(filters: TareaFilters = {}): Promise<Tarea[]> {
  if (isDemoMode()) {
    return getDemoTareas(filters).filter((t) => {
      if (filters.desde && t.fechaInicio < filters.desde) return false;
      if (filters.hasta && t.fechaInicio > filters.hasta) return false;
      return true;
    });
  }
  const rows = await readRange(TAREAS_RANGE);
  const tareas = parseTareasRows(rows);
  const archivos = await getAllArchivos();
  const conMedia = tareas.map((t) => ({ ...t, ...mediaFromArchivos(archivos, t.rowId) }));
  return filterTareas(conMedia, filters);
}

export async function getTareaByRowId(rowId: string): Promise<Tarea | null> {
  if (isDemoMode()) return getDemoTareaById(rowId);
  const tareas = await getTareas();
  return tareas.find((t) => t.rowId === rowId) ?? null;
}

// Lee el header row de Tareas y devuelve el HeaderMap.
async function getTareasHeaderMap(): Promise<HeaderMap> {
  const headerRow = (await readRange(`${SHEETS.tareas}!A1:Z1`))[0] ?? [];
  return buildHeaderMap(headerRow);
}

export async function appendTarea(
  input: TareaNuevaInput,
  supervisor: string
): Promise<Tarea> {
  if (isDemoMode()) {
    return createDemoTarea(
      {
        objetivo: input.objetivo,
        fechaInicio: input.fechaInicio,
        fechaEstimada: input.fechaEstimada,
        edificio: input.edificio,
        parteComun: input.parteComun,
        dpto: input.dpto,
        informe: input.informe,
        imagenes: input.imagenes ?? [],
        videos: input.videos ?? [],
        documentos: input.documentos ?? [],
        proveedor: input.proveedor,
        estado: input.estado ?? "Pendiente",
        presupuesto: input.presupuesto,
        prioridad: input.prioridad,
      },
      supervisor
    );
  }
  const now = new Date().toISOString();
  const rowId = input.rowId?.trim() || now;
  const media: MediaTarea = {
    imagenes: input.imagenes ?? [],
    videos: input.videos ?? [],
    documentos: input.documentos ?? [],
  };
  const tarea: Tarea = {
    rowId,
    objetivo: input.objetivo,
    fechaInicio: input.fechaInicio,
    fechaEstimada: input.fechaEstimada,
    edificio: input.edificio,
    parteComun: input.parteComun,
    dpto: input.dpto,
    informe: input.informe,
    imagenes: media.imagenes,
    videos: media.videos,
    documentos: media.documentos,
    proveedor: input.proveedor,
    estado: input.estado ?? "Pendiente",
    presupuesto: input.presupuesto,
    prioridad: input.prioridad,
    supervisor,
    creadoEn: now,
    actualizadoEn: now,
  };

  // La columna A tiene los rowId (timestamps). Calculamos la fila libre por A
  // (evita el "table detection" de append, que se confunde con tablas auxiliares).
  const h = await getTareasHeaderMap();
  const colA = await readRange(`${SHEETS.tareas}!A:A`);
  const nextRow = colA.length + 1;
  const values = tareaToRow(h, tarea);
  await getSheets().spreadsheets.values.update({
    spreadsheetId: getSheetId(),
    range: `${SHEETS.tareas}!A${nextRow}:${colLetter(values.length)}${nextRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [values] },
  });
  tarea.rowNumber = nextRow;

  // Media -> hoja hija TareaArchivos.
  if (media.imagenes.length || media.videos.length || media.documentos.length) {
    await setArchivosForTarea(rowId, media);
  }

  return tarea;
}

export async function deleteTarea(rowId: string): Promise<void> {
  if (isDemoMode()) {
    if (!deleteDemoTarea(rowId)) throw new Error(`Tarea con rowId ${rowId} no encontrada`);
    return;
  }
  const current = await getTareaByRowId(rowId);
  if (!current) throw new Error(`Tarea con rowId ${rowId} no encontrada`);
  if (!current.rowNumber) throw new Error("rowNumber no disponible para eliminar");

  const gid = await getSheetGid(SHEETS.tareas);
  await getSheets().spreadsheets.batchUpdate({
    spreadsheetId: getSheetId(),
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: gid,
              dimension: "ROWS",
              startIndex: current.rowNumber - 1,
              endIndex: current.rowNumber,
            },
          },
        },
      ],
    },
  });

  // Borrar también sus archivos en la hoja hija.
  await deleteArchivosByTarea(rowId);
}

export async function updateTarea(input: TareaUpdateInput): Promise<Tarea> {
  if (isDemoMode()) {
    const updated = updateDemoTarea(input.rowId, input);
    if (!updated) throw new Error(`Tarea con rowId ${input.rowId} no encontrada`);
    return updated;
  }
  const current = await getTareaByRowId(input.rowId);
  if (!current) throw new Error(`Tarea con rowId ${input.rowId} no encontrada`);
  if (!current.rowNumber) throw new Error("rowNumber no disponible para update");

  const merged: Tarea = {
    ...current,
    ...input,
    rowId: current.rowId,
    actualizadoEn: new Date().toISOString(),
  };
  // Parte común: solo cae al marcador genérico si no hay una parte común específica.
  if (merged.parteComun && !merged.dpto?.trim()) merged.dpto = "Parte Común";

  const h = await getTareasHeaderMap();
  const values = tareaToRow(h, merged);
  await getSheets().spreadsheets.values.update({
    spreadsheetId: getSheetId(),
    range: `${SHEETS.tareas}!A${current.rowNumber}:${colLetter(values.length)}${current.rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [values] },
  });

  // Media -> sincronizar la hoja hija SOLO si el input trajo campos de media
  // (reemplazo total: borra las filas actuales de la tarea y reinserta el set).
  if (
    input.imagenes !== undefined ||
    input.videos !== undefined ||
    input.documentos !== undefined
  ) {
    await setArchivosForTarea(current.rowId, {
      imagenes: merged.imagenes ?? [],
      videos: merged.videos ?? [],
      documentos: merged.documentos ?? [],
    });
  }

  return merged;
}
