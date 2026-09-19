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
  tareaArchivos: "TareaArchivos",
  partesComunes: "Partes Comunes",
  visitas: "Visitas",
  edificioFicha: "EdificioFicha",
} as const;

export const TAREAS_RANGE = `${SHEETS.tareas}!A:AD`;

let sheetsClient: sheets_v4.Sheets | null = null;

// Cliente de Sheets memoizado. Privado a propósito: toda lectura/escritura pasa por los
// helpers de abajo, que son los que mantienen el cache coherente.
function getSheets() {
  if (!sheetsClient) {
    sheetsClient = google.sheets({ version: "v4", auth: getGoogleAuth() });
  }
  return sheetsClient;
}

// =====================================================
// Reintentos
// =====================================================

// La cuota de la API es 60 lecturas/min por usuario y la service account es un solo
// usuario: ante 429 (cuota) o 503 (Google inestable) se espera y se reintenta. Google no
// ejecutó nada en esos casos, así que reintentar escrituras también es seguro.
const ESPERAS_MS = [500, 1500, 4000];

// gaxios expone el status como `code` (string) y como `response.status` (number).
function statusDe(err: unknown): number {
  const e = err as { code?: unknown; response?: { status?: unknown } } | null;
  return Number(e?.code) || Number(e?.response?.status) || 0;
}

async function conReintentos<T>(fn: () => Promise<T>): Promise<T> {
  for (let intento = 0; ; intento++) {
    try {
      return await fn();
    } catch (err) {
      const status = statusDe(err);
      const reintentable = status === 429 || status === 503;
      if (!reintentable || intento >= ESPERAS_MS.length) throw err;
      console.warn(
        `[sheets] ${status} — reintento ${intento + 1}/${ESPERAS_MS.length} en ${ESPERAS_MS[intento]} ms`
      );
      await new Promise((r) => setTimeout(r, ESPERAS_MS[intento]));
    }
  }
}

// =====================================================
// Cache de lecturas
// =====================================================

// Cache en memoria por rango, por proceso. Prod corre en un solo contenedor; si algún día
// hay varias instancias, cada una ve las escrituras de las otras con hasta TTL de atraso.
// El TTL solo importa para cambios que la app NO hace (ediciones a mano en la planilla):
// lo que escribe la app invalida la hoja al instante vía writeRange/deleteRows.
// SHEETS_CACHE_TTL_MS=0 apaga el cache (vitest.setup.ts lo hace para los tests).
interface Entrada {
  rows: string[][];
  expira: number;
}
const cache = new Map<string, Entrada>();
const enVuelo = new Map<string, Promise<string[][]>>();

function ttlMs(): number {
  const raw = process.env.SHEETS_CACHE_TTL_MS;
  return raw === undefined ? 30_000 : Number(raw);
}

// "Tareas!A:AD" → "Tareas"; "'Partes Comunes'!A:B" → "Partes Comunes".
export function hojaDeRango(range: string): string {
  const hoja = range.split("!")[0] ?? range;
  return hoja.replace(/^'(.*)'$/, "$1");
}

// Lee un rango. Con cache caliente no llama a Google; dos lecturas concurrentes del mismo
// rango comparten una sola llamada. Las filas se devuelven POR REFERENCIA: no mutar el
// array (todos los consumidores hacen slice/map/find).
export async function readRange(range: string): Promise<string[][]> {
  const ttl = ttlMs();
  if (ttl > 0) {
    const hit = cache.get(range);
    if (hit && hit.expira > Date.now()) return hit.rows;
    const pendiente = enVuelo.get(range);
    if (pendiente) return pendiente;
  }
  const p = conReintentos(() =>
    getSheets().spreadsheets.values.get({ spreadsheetId: getSheetId(), range })
  )
    .then((res) => {
      const rows = (res.data.values ?? []) as string[][];
      if (ttl > 0) cache.set(range, { rows, expira: Date.now() + ttl });
      return rows;
    })
    .finally(() => enVuelo.delete(range));
  if (ttl > 0) enVuelo.set(range, p);
  return p;
}

export function invalidarHoja(sheetTitle: string): void {
  for (const key of cache.keys()) {
    if (hojaDeRango(key) === sheetTitle) cache.delete(key);
  }
}

// Solo para tests.
export function resetSheetsCache(): void {
  cache.clear();
  enVuelo.clear();
}

// =====================================================
// Escrituras (invalidan la hoja al confirmar)
// =====================================================

export async function writeRange(range: string, values: (string | number)[][]): Promise<void> {
  await conReintentos(() =>
    getSheets().spreadsheets.values.update({
      spreadsheetId: getSheetId(),
      range,
      valueInputOption: "USER_ENTERED",
      requestBody: { values },
    })
  );
  invalidarHoja(hojaDeRango(range));
}

// Borra filas (1-based) de una hoja en un solo batchUpdate, de abajo hacia arriba para que
// los índices no se corran. Lista vacía → no llama a Google.
export async function deleteRows(sheetTitle: string, rowNumbers: number[]): Promise<void> {
  if (rowNumbers.length === 0) return;
  const gid = await getSheetGid(sheetTitle);
  const requests = [...rowNumbers]
    .sort((a, b) => b - a)
    .map((n) => ({
      deleteDimension: {
        range: { sheetId: gid, dimension: "ROWS" as const, startIndex: n - 1, endIndex: n },
      },
    }));
  await conReintentos(() =>
    getSheets().spreadsheets.batchUpdate({
      spreadsheetId: getSheetId(),
      requestBody: { requests },
    })
  );
  invalidarHoja(sheetTitle);
}

// gid (sheetId interno) por título de pestaña, cacheado. Necesario para borrar filas
// con batchUpdate/deleteDimension.
const gidCache: Record<string, number> = {};
export async function getSheetGid(title: string): Promise<number> {
  if (gidCache[title] != null) return gidCache[title];
  const meta = await conReintentos(() =>
    getSheets().spreadsheets.get({
      spreadsheetId: getSheetId(),
      fields: "sheets(properties(sheetId,title))",
    })
  );
  const sheet = meta.data.sheets?.find((s) => s.properties?.title === title);
  const gid = sheet?.properties?.sheetId;
  if (gid == null) throw new Error(`No se encontró la hoja "${title}"`);
  gidCache[title] = gid;
  return gid;
}
