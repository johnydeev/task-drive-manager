import { getSheetId } from "../google-auth";
import { isDemoMode } from "../demo-mode";
import type { Asignacion, Edificio } from "@/types";
import { getConsorciosActivos } from "../consorcios";
import { getSheets, readRange, SHEETS, getSheetGid } from "./core";
import { buildHeaderMap } from "./headers";
import { edificioMatches } from "./edificios";

// Headers: edificio · edificio_cuit · email · creado_en
// (edificio_cuit se puebla en Fase 2; acá se deja vacío).
const RANGE = `${SHEETS.asignaciones}!A:D`;

function parse(rows: string[][]): (Asignacion & { rowNumber: number })[] {
  if (rows.length === 0) return [];
  const h = buildHeaderMap(rows[0] ?? []);
  return rows
    .slice(1)
    .map((r, i) => ({
      email: h.get(r, "email").trim().toLowerCase(),
      edificio: h.get(r, "edificio").trim(),
      rowNumber: i + 2, // fila 1 = header, datos desde la 2
    }))
    .filter((a) => a.email && a.edificio);
}

// Activos de _Consorcios que no aparecen en ninguna asignación (match normalizado).
export function computeSinAsignar(activos: Edificio[], asignaciones: Asignacion[]): string[] {
  return activos
    .map((e) => e.nombre)
    .filter((nombre) => !asignaciones.some((a) => edificioMatches(a.edificio, nombre)));
}

export async function getEdificiosSinAsignar(): Promise<string[]> {
  const [activos, asignaciones] = await Promise.all([
    getConsorciosActivos(),
    getAsignaciones(),
  ]);
  return computeSinAsignar(activos, asignaciones);
}

export async function getAsignaciones(email?: string): Promise<Asignacion[]> {
  if (isDemoMode()) return [];
  const rows = await readRange(RANGE);
  const all = parse(rows).map(({ email, edificio }) => ({ email, edificio }));
  if (!email) return all;
  const target = email.trim().toLowerCase();
  return all.filter((a) => a.email === target);
}

// Arma la fila colocando cada campo en la columna de su header.
function buildRow(
  header: string[],
  fields: { edificio: string; edificioCuit: string; email: string; creadoEn: string }
): string[] {
  const h = buildHeaderMap(header);
  const width = Math.max(
    1,
    h.index("edificio") + 1,
    h.index("edificio_cuit") + 1,
    h.index("email") + 1,
    h.index("creado_en") + 1
  );
  const row = new Array(width).fill("");
  const set = (name: string, val: string) => {
    const i = h.index(name);
    if (i !== -1) row[i] = val;
  };
  set("edificio", fields.edificio);
  set("edificio_cuit", fields.edificioCuit);
  set("email", fields.email);
  set("creado_en", fields.creadoEn);
  return row;
}

export async function addAsignacion(
  email: string,
  edificio: string,
  edificioCuit = ""
): Promise<Asignacion> {
  const e = email.trim().toLowerCase();
  const ed = edificio.trim();
  const asignacion: Asignacion = { email: e, edificio: ed };
  if (isDemoMode()) return asignacion;
  const rows = await readRange(RANGE);
  const existing = parse(rows);
  // R2: un edificio se asigna a un solo integrante (único global).
  const conflicto = existing.find((a) => edificioMatches(a.edificio, ed));
  if (conflicto) {
    throw new Error(`El edificio "${ed}" ya está asignado a ${conflicto.email}`);
  }
  const row = buildRow(rows[0] ?? [], {
    edificio: ed,
    edificioCuit: edificioCuit.trim(),
    email: e,
    creadoEn: new Date().toISOString(),
  });
  await getSheets().spreadsheets.values.append({
    spreadsheetId: getSheetId(),
    range: RANGE,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  });
  return asignacion;
}

export async function removeAsignacion(email: string, edificio: string): Promise<void> {
  if (isDemoMode()) return;
  const e = email.trim().toLowerCase();
  const ed = edificio.trim();
  const rows = await readRange(RANGE);
  const match = parse(rows).find((a) => a.email === e && a.edificio === ed);
  if (!match) return;
  const gid = await getSheetGid(SHEETS.asignaciones);
  await getSheets().spreadsheets.batchUpdate({
    spreadsheetId: getSheetId(),
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: gid,
              dimension: "ROWS",
              startIndex: match.rowNumber - 1,
              endIndex: match.rowNumber,
            },
          },
        },
      ],
    },
  });
}
