import { nanoid } from "nanoid";
import { getSheetId } from "../google-auth";
import { getSheets, readRange, SHEETS, getSheetGid } from "./core";
import { buildHeaderMap } from "./headers";
import { nowBuenosAiresISO } from "../fecha-ar";

// Hoja hija de media de una Tarea: 1 fila por archivo.
// Headers: id · tarea_id · tipo · url · orden · creado_en

export type TipoArchivo = "imagen" | "video" | "documento";

export interface TareaArchivo {
  id: string;
  tareaId: string;
  tipo: TipoArchivo;
  url: string;
  orden: number;
  creadoEn: string;
}

// Media agrupada como la consume la Tarea.
export interface MediaTarea {
  imagenes: string[];
  videos: string[];
  documentos: string[];
}

export const EMPTY_MEDIA: MediaTarea = { imagenes: [], videos: [], documentos: [] };

const RANGE = `${SHEETS.tareaArchivos}!A:F`;

// ---- Funciones puras (testeables sin red) ----

export function rowsToArchivos(rows: string[][]): TareaArchivo[] {
  if (rows.length === 0) return [];
  const h = buildHeaderMap(rows[0] ?? []);
  return rows
    .slice(1)
    .filter((r) => h.get(r, "url"))
    .map((r) => ({
      id: h.get(r, "id"),
      tareaId: h.get(r, "tarea_id"),
      tipo: (h.get(r, "tipo") as TipoArchivo) || "documento",
      url: h.get(r, "url"),
      orden: Number(h.get(r, "orden")) || 0,
      creadoEn: h.get(r, "creado_en"),
    }));
}

// Agrupa la media de una tarea por tipo, respetando el `orden`.
export function mediaFromArchivos(archivos: TareaArchivo[], tareaId: string): MediaTarea {
  const mios = archivos
    .filter((a) => a.tareaId === tareaId)
    .sort((a, b) => a.orden - b.orden);
  return {
    imagenes: mios.filter((a) => a.tipo === "imagen").map((a) => a.url),
    videos: mios.filter((a) => a.tipo === "video").map((a) => a.url),
    documentos: mios.filter((a) => a.tipo === "documento").map((a) => a.url),
  };
}

// Arma las filas (para escribir) a partir de la media de una tarea.
// El `orden` reinicia por tipo (imagen-1, imagen-2, video-1, …).
export function archivosToRows(
  tareaId: string,
  media: MediaTarea
): (string | number)[][] {
  const now = nowBuenosAiresISO();
  const rows: (string | number)[][] = [];
  const push = (tipo: TipoArchivo, urls: string[]) => {
    urls.forEach((url, i) => {
      if (!url) return;
      rows.push([nanoid(10), tareaId, tipo, url, i + 1, now]);
    });
  };
  push("imagen", media.imagenes ?? []);
  push("video", media.videos ?? []);
  push("documento", media.documentos ?? []);
  return rows;
}

// ---- Operaciones sobre la Sheet ----

// Trae TODOS los archivos (una sola llamada). getTareas lo usa para poblar la
// media de todas las tareas sin hacer una lectura por tarea.
export async function getAllArchivos(): Promise<TareaArchivo[]> {
  const rows = await readRange(RANGE);
  return rowsToArchivos(rows);
}

export async function getArchivosByTarea(tareaId: string): Promise<TareaArchivo[]> {
  const all = await getAllArchivos();
  return all.filter((a) => a.tareaId === tareaId);
}

// Devuelve los números de fila (1-based) de las filas de una tarea.
async function findRowNumbers(tareaId: string): Promise<number[]> {
  const rows = await readRange(RANGE);
  if (rows.length === 0) return [];
  const h = buildHeaderMap(rows[0] ?? []);
  const nums: number[] = [];
  rows.slice(1).forEach((r, i) => {
    if (h.get(r, "tarea_id") === tareaId) nums.push(i + 2); // +2: fila 1 = header
  });
  return nums;
}

// Borra todas las filas de archivos de una tarea (de abajo hacia arriba para no
// correr los índices).
export async function deleteArchivosByTarea(tareaId: string): Promise<void> {
  const nums = await findRowNumbers(tareaId);
  if (nums.length === 0) return;
  const gid = await getSheetGid(SHEETS.tareaArchivos);
  const requests = nums
    .sort((a, b) => b - a) // descendente
    .map((rowNumber) => ({
      deleteDimension: {
        range: {
          sheetId: gid,
          dimension: "ROWS" as const,
          startIndex: rowNumber - 1,
          endIndex: rowNumber,
        },
      },
    }));
  await getSheets().spreadsheets.batchUpdate({
    spreadsheetId: getSheetId(),
    requestBody: { requests },
  });
}

// Reemplazo total: borra las filas actuales de la tarea y reinserta el set nuevo.
export async function setArchivosForTarea(
  tareaId: string,
  media: MediaTarea
): Promise<void> {
  await deleteArchivosByTarea(tareaId);
  const rows = archivosToRows(tareaId, media);
  if (rows.length === 0) return;
  // NO usar values.append: en hojas con grid grande dispersa las filas al fondo.
  // Calculamos la fila libre por la columna A y escribimos con update el bloque
  // completo (dimensionando el rango a la cantidad de archivos).
  const colA = await readRange(`${SHEETS.tareaArchivos}!A:A`);
  const nextRow = colA.length + 1;
  const lastRow = nextRow + rows.length - 1;
  await getSheets().spreadsheets.values.update({
    spreadsheetId: getSheetId(),
    range: `${SHEETS.tareaArchivos}!A${nextRow}:F${lastRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: rows },
  });
}
