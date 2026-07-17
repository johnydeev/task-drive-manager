import { getSheetId } from "../google-auth";
import { isDemoMode } from "../demo-mode";
import type { Asignacion } from "@/types";
import { getSheets, readRange, SHEETS, getSheetGid } from "./core";

function parse(rows: string[][]): (Asignacion & { rowNumber: number })[] {
  return rows
    .map((r, i) => ({
      email: (r[0] ?? "").trim().toLowerCase(),
      edificio: (r[1] ?? "").trim(),
      rowNumber: i + 2,
    }))
    .filter((a) => a.email && a.edificio);
}

export async function getAsignaciones(email?: string): Promise<Asignacion[]> {
  if (isDemoMode()) return [];
  const rows = await readRange(`${SHEETS.asignaciones}!A2:B`);
  const all = parse(rows).map(({ email, edificio }) => ({ email, edificio }));
  if (!email) return all;
  const target = email.trim().toLowerCase();
  return all.filter((a) => a.email === target);
}

export async function addAsignacion(email: string, edificio: string): Promise<Asignacion> {
  const e = email.trim().toLowerCase();
  const ed = edificio.trim();
  const asignacion: Asignacion = { email: e, edificio: ed };
  if (isDemoMode()) return asignacion;
  const existing = await getAsignaciones(e);
  if (existing.some((a) => a.edificio === ed)) return asignacion; // idempotente
  await getSheets().spreadsheets.values.append({
    spreadsheetId: getSheetId(),
    range: `${SHEETS.asignaciones}!A:B`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [[e, ed]] },
  });
  return asignacion;
}

export async function removeAsignacion(email: string, edificio: string): Promise<void> {
  if (isDemoMode()) return;
  const e = email.trim().toLowerCase();
  const ed = edificio.trim();
  const rows = await readRange(`${SHEETS.asignaciones}!A2:B`);
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
