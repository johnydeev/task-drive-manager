import { nanoid } from "nanoid";
import { getSheetId } from "../google-auth";
import { isDemoMode } from "../demo-mode";
import { getDemoDptos } from "../demo-data";
import { getSheets, readRange, SHEETS } from "./core";
import { buildHeaderMap } from "./headers";

// Hoja de partes comunes: headers id · nombre.
const RANGE = `${SHEETS.partesComunes}!A:B`;

// Convención: MAYÚSCULAS, sin espacios al inicio/fin, colapsando espacios múltiples.
export function normalizeParteComun(nombre: string): string {
  return nombre.trim().replace(/\s+/g, " ").toUpperCase();
}

function parse(rows: string[][]): string[] {
  if (rows.length === 0) return [];
  const h = buildHeaderMap(rows[0] ?? []);
  return rows
    .slice(1)
    .map((r) => h.get(r, "nombre").trim())
    .filter(Boolean);
}

export async function getPartesComunes(): Promise<string[]> {
  if (isDemoMode()) return getDemoDptos("Parte Común").map((d) => d.dpto);
  const rows = await readRange(RANGE);
  return parse(rows).sort((a, b) => a.localeCompare(b, "es"));
}

export async function appendParteComun(nombre: string): Promise<string> {
  const limpio = normalizeParteComun(nombre);
  if (!limpio) throw new Error("El nombre no puede estar vacío");
  if (isDemoMode()) return limpio;
  const rows = await readRange(RANGE);
  const existentes = parse(rows).map(normalizeParteComun);
  if (existentes.includes(limpio)) throw new Error(`La parte común "${limpio}" ya existe`);
  const h = buildHeaderMap(rows[0] ?? []);
  const width = Math.max(1, h.index("id") + 1, h.index("nombre") + 1);
  const row = new Array(width).fill("");
  const set = (name: string, val: string) => {
    const i = h.index(name);
    if (i !== -1) row[i] = val;
  };
  set("id", nanoid(10));
  set("nombre", limpio);
  // Fila libre por cantidad de filas leídas (evita append/table-detection).
  const nextRow = rows.length + 1;
  await getSheets().spreadsheets.values.update({
    spreadsheetId: getSheetId(),
    range: `${SHEETS.partesComunes}!A${nextRow}:B${nextRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] },
  });
  return limpio;
}
