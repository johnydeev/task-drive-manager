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
import { getSheets, readRange, SHEETS, TAREAS_RANGE } from "./core";

// Re-exportado para compatibilidad: consumidores históricos importan TareaFilters de acá.
export type { TareaFilters };

// Mapea una fila plana del Sheet a Tarea tipada.
// Las posiciones son 0-indexed (A=0).
export function rowToTarea(row: string[], rowNumber: number): Tarea {
  const safeJsonArr = (v?: string): string[] => {
    if (!v) return [];
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
    } catch {
      return [];
    }
  };

  return {
    rowId: row[0] ?? "",
    rowNumber,
    objetivo: row[1] ?? "",
    fechaInicio: row[2] ?? "",
    fechaEstimada: row[3] ?? "",
    edificio: row[4] ?? "",
    parteComun: (row[5] ?? "").toString().toLowerCase() === "true" || row[5] === "Sí",
    dpto: row[6] ?? "",
    informe: row[7] ?? "",
    comentarioEnProceso: row[8] || undefined,
    comentarioRealizado: row[9] || undefined,
    imagenes: safeJsonArr(row[10]),
    videos: safeJsonArr(row[11]),
    documentos: safeJsonArr(row[12]),
    reporteUrl: row[13] || undefined,
    proveedor: row[16] || undefined,
    estado: ((row[17] as EstadoTarea) || "Pendiente") as EstadoTarea,
    presupuesto: row[18] ? Number(row[18]) || undefined : undefined,
    fechaRealizado: row[19] || undefined,
    prioridad: ((row[20] as Prioridad) || "Media") as Prioridad,
    supervisor: row[21] ?? "",
  };
}

export function tareaToRow(t: Partial<Tarea> & { rowId: string }): (string | number | boolean)[] {
  // Devuelve un array de 22 columnas (A:V). Las reservadas (23-26) quedan fuera.
  const row: (string | number | boolean)[] = new Array(22).fill("");
  row[0] = t.rowId;
  row[1] = t.objetivo ?? "";
  row[2] = t.fechaInicio ?? "";
  row[3] = t.fechaEstimada ?? "";
  row[4] = t.edificio ?? "";
  row[5] = t.parteComun ? "TRUE" : "FALSE";
  row[6] = t.dpto ?? "";
  row[7] = t.informe ?? "";
  row[8] = t.comentarioEnProceso ?? "";
  row[9] = t.comentarioRealizado ?? "";
  row[10] = JSON.stringify(t.imagenes ?? []);
  row[11] = JSON.stringify(t.videos ?? []);
  row[12] = JSON.stringify(t.documentos ?? []);
  row[13] = t.reporteUrl ?? "";
  // 14-15 reservadas, quedan ""
  row[16] = t.proveedor ?? "";
  row[17] = t.estado ?? "Pendiente";
  row[18] = t.presupuesto ?? "";
  row[19] = t.fechaRealizado ?? "";
  row[20] = t.prioridad ?? "Media";
  row[21] = t.supervisor ?? "";
  return row;
}

// Detecta si la celda A de una fila parece un rowId válido (timestamp ISO).
// Permite distinguir filas de datos de: header, filas vacías o basura.
function looksLikeRowId(value: string | undefined): boolean {
  if (!value) return false;
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value.trim());
}

// Convierte las filas crudas de la Sheet a Tareas, filtrando por contenido
// (no por posición): solo incluye filas cuya columna A es un rowId válido.
// Esto tolera: hoja sin header, hoja con header, y filas vacías intercaladas.
// El rowNumber refleja la fila real de la Sheet (1-indexed).
export function parseTareasRows(rows: string[][]): Tarea[] {
  return rows
    .map((r, i) => ({ r, rowNumber: i + 1 }))
    .filter(({ r }) => looksLikeRowId(r[0]))
    .map(({ r, rowNumber }) => rowToTarea(r, rowNumber));
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
  return filterTareas(tareas, filters);
}

export async function getTareaByRowId(rowId: string): Promise<Tarea | null> {
  if (isDemoMode()) return getDemoTareaById(rowId);
  const tareas = await getTareas();
  return tareas.find((t) => t.rowId === rowId) ?? null;
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
        // El dpto ya viene resuelto por el caller (parte común específica o "Parte Común").
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
  // El cliente manda el rowId (para que coincida con la carpeta de Drive donde ya subió
  // los archivos). Si no viene, lo generamos acá.
  const rowId = input.rowId?.trim() || new Date().toISOString();
  const tarea: Tarea = {
    rowId,
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
    supervisor,
  };

  // NO usar spreadsheets.values.append: la pestaña "Tareas" tiene contenido en
  // columnas altas (tablas auxiliares) y el "table detection" de append termina
  // escribiendo la fila en la columna equivocada (ej. U en vez de A). En su lugar,
  // calculamos la próxima fila libre por la columna A (los rowId son timestamps ISO)
  // y escribimos con update en el rango exacto A:V.
  const colA = await readRange(`${SHEETS.tareas}!A:A`);
  const nextRow = colA.length + 1;
  await getSheets().spreadsheets.values.update({
    spreadsheetId: getSheetId(),
    range: `${SHEETS.tareas}!A${nextRow}:V${nextRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [tareaToRow(tarea)] },
  });
  tarea.rowNumber = nextRow;

  return tarea;
}

// gid (sheetId interno) de la pestaña Tareas — necesario para borrar filas.
let tareasGidCache: number | null = null;
async function getTareasGid(): Promise<number> {
  if (tareasGidCache != null) return tareasGidCache;
  const meta = await getSheets().spreadsheets.get({
    spreadsheetId: getSheetId(),
    fields: "sheets(properties(sheetId,title))",
  });
  const sheet = meta.data.sheets?.find((s) => s.properties?.title === SHEETS.tareas);
  const gid = sheet?.properties?.sheetId;
  if (gid == null) throw new Error(`No se encontró la hoja "${SHEETS.tareas}"`);
  tareasGidCache = gid;
  return gid;
}

export async function deleteTarea(rowId: string): Promise<void> {
  if (isDemoMode()) {
    if (!deleteDemoTarea(rowId)) throw new Error(`Tarea con rowId ${rowId} no encontrada`);
    return;
  }
  const current = await getTareaByRowId(rowId);
  if (!current) throw new Error(`Tarea con rowId ${rowId} no encontrada`);
  if (!current.rowNumber) throw new Error("rowNumber no disponible para eliminar");

  const gid = await getTareasGid();
  await getSheets().spreadsheets.batchUpdate({
    spreadsheetId: getSheetId(),
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: gid,
              dimension: "ROWS",
              startIndex: current.rowNumber - 1, // 0-based
              endIndex: current.rowNumber, // exclusivo
            },
          },
        },
      ],
    },
  });
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

  const merged: Tarea = { ...current, ...input, rowId: current.rowId };
  // Parte común: solo cae al marcador genérico si no hay una parte común específica.
  if (merged.parteComun && !merged.dpto?.trim()) merged.dpto = "Parte Común";

  await getSheets().spreadsheets.values.update({
    spreadsheetId: getSheetId(),
    range: `${SHEETS.tareas}!A${current.rowNumber}:V${current.rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [tareaToRow(merged)] },
  });

  return merged;
}
