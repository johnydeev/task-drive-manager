import { getSheetId } from "../google-auth";
import { isDemoMode } from "../demo-mode";
import type { Directiva, DirectivaNuevaInput } from "@/types";
import { getSheets, readRange, SHEETS, getSheetGid } from "./core";

function rowToDirectiva(r: string[]): Directiva {
  return {
    id: r[0] ?? "",
    descripcion: r[1] ?? "",
    fecha: r[2] ?? "",
    asignadoA: (r[3] ?? "").trim().toLowerCase(),
    creadoPor: (r[4] ?? "").trim().toLowerCase(),
    creadoEn: r[5] ?? "",
    estado: "Asignada",
  };
}

export async function getDirectivas(email?: string): Promise<Directiva[]> {
  if (isDemoMode()) return [];
  const rows = await readRange(`${SHEETS.directivas}!A2:G`);
  const all = rows.filter((r) => r[0]).map(rowToDirectiva);
  if (!email) return all;
  const target = email.trim().toLowerCase();
  return all.filter((d) => d.asignadoA === target);
}

export async function appendDirectiva(input: DirectivaNuevaInput, creadoPor: string): Promise<Directiva> {
  const now = new Date().toISOString();
  const directiva: Directiva = {
    id: now,
    descripcion: input.descripcion,
    fecha: input.fecha,
    asignadoA: input.asignadoA.trim().toLowerCase(),
    creadoPor: creadoPor.trim().toLowerCase(),
    creadoEn: now,
    estado: "Asignada",
  };
  if (isDemoMode()) return directiva;
  await getSheets().spreadsheets.values.append({
    spreadsheetId: getSheetId(),
    range: `${SHEETS.directivas}!A:G`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [
        [
          directiva.id,
          directiva.descripcion,
          directiva.fecha,
          directiva.asignadoA,
          directiva.creadoPor,
          directiva.creadoEn,
          directiva.estado,
        ],
      ],
    },
  });
  return directiva;
}

export async function deleteDirectiva(id: string): Promise<void> {
  if (isDemoMode()) return;
  const rows = await readRange(`${SHEETS.directivas}!A2:G`);
  const idx = rows.findIndex((r) => (r[0] ?? "") === id);
  if (idx === -1) return;
  const rowNumber = idx + 2;
  const gid = await getSheetGid(SHEETS.directivas);
  await getSheets().spreadsheets.batchUpdate({
    spreadsheetId: getSheetId(),
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: gid,
              dimension: "ROWS",
              startIndex: rowNumber - 1,
              endIndex: rowNumber,
            },
          },
        },
      ],
    },
  });
}
