import { google, sheets_v4 } from "googleapis";
import { getGoogleAuth, getSheetId } from "../google-auth";

// Nombres de hojas — coinciden exactamente con los tabs de la spreadsheet.
export const SHEETS = {
  edificios: "Edificios",
  dptos: "Dptos",
  tareas: "Tareas",
  usuarios: "Usuarios",
  // La pestaña real en la Sheet es "Configuracion" (sin tilde). Con tilde, Google
  // devuelve 400 "Unable to parse range" y la config nunca se lee ni se puede guardar.
  configuracion: "Configuracion",
  asignaciones: "Asignaciones",
  directivas: "Directivas",
} as const;

export const TAREAS_RANGE = `${SHEETS.tareas}!A:Z`;

let sheetsClient: sheets_v4.Sheets | null = null;

// Cliente de Sheets memoizado. Compartido por todos los módulos de la capa de datos.
export function getSheets() {
  if (!sheetsClient) {
    sheetsClient = google.sheets({ version: "v4", auth: getGoogleAuth() });
  }
  return sheetsClient;
}

export async function readRange(range: string): Promise<string[][]> {
  const res = await getSheets().spreadsheets.values.get({
    spreadsheetId: getSheetId(),
    range,
  });
  return (res.data.values ?? []) as string[][];
}

// gid (sheetId interno) por título de pestaña, cacheado. Necesario para borrar filas
// con batchUpdate/deleteDimension.
const gidCache: Record<string, number> = {};
export async function getSheetGid(title: string): Promise<number> {
  if (gidCache[title] != null) return gidCache[title];
  const meta = await getSheets().spreadsheets.get({
    spreadsheetId: getSheetId(),
    fields: "sheets(properties(sheetId,title))",
  });
  const sheet = meta.data.sheets?.find((s) => s.properties?.title === title);
  const gid = sheet?.properties?.sheetId;
  if (gid == null) throw new Error(`No se encontró la hoja "${title}"`);
  gidCache[title] = gid;
  return gid;
}
