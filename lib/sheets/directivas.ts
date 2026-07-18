import { getSheetId } from "../google-auth";
import { isDemoMode } from "../demo-mode";
import type { Directiva, DirectivaNuevaInput } from "@/types";
import { getSheets, readRange, SHEETS, getSheetGid } from "./core";
import { estadoEfectivo } from "../directivas-estado";

function rowToDirectiva(r: string[]): Directiva {
  return {
    id: r[0] ?? "",
    descripcion: r[1] ?? "",
    fecha: r[2] ?? "",
    asignadoA: (r[3] ?? "").trim().toLowerCase(),
    creadoPor: (r[4] ?? "").trim().toLowerCase(),
    creadoEn: r[5] ?? "",
    estado: (r[6] as Directiva["estado"]) || "Asignada",
    aceptadaEn: r[7] || undefined,
    realizadaEn: r[8] || undefined,
    notaCierre: r[9] || undefined,
    objetadaEn: r[10] || undefined,
    notaObjecion: r[11] || undefined,
  };
}

function directivaToRow(d: Directiva): string[] {
  return [
    d.id,
    d.descripcion,
    d.fecha,
    d.asignadoA,
    d.creadoPor,
    d.creadoEn,
    // "Cerrada" es derivado: nunca se persiste, se baja al estado base "Realizada".
    d.estado === "Cerrada" ? "Realizada" : d.estado,
    d.aceptadaEn ?? "",
    d.realizadaEn ?? "",
    d.notaCierre ?? "",
    d.objetadaEn ?? "",
    d.notaObjecion ?? "",
  ];
}

export async function getDirectivas(email?: string): Promise<Directiva[]> {
  if (isDemoMode()) return [];
  const rows = await readRange(`${SHEETS.directivas}!A2:L`);
  const now = Date.now();
  const all = rows
    .filter((r) => r[0])
    .map((r) => {
      const d = rowToDirectiva(r);
      return { ...d, estado: estadoEfectivo(d, now) };
    });
  if (!email) return all;
  const target = email.trim().toLowerCase();
  return all.filter((d) => d.asignadoA === target);
}

export async function getDirectivaById(id: string): Promise<Directiva | null> {
  if (isDemoMode()) return null;
  const rows = await readRange(`${SHEETS.directivas}!A2:L`);
  const r = rows.find((row) => (row[0] ?? "") === id);
  if (!r) return null;
  const d = rowToDirectiva(r);
  return { ...d, estado: estadoEfectivo(d, Date.now()) };
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
    range: `${SHEETS.directivas}!A:L`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [directivaToRow(directiva)] },
  });
  return directiva;
}

async function findDirectivaRow(id: string): Promise<{ d: Directiva; rowNumber: number } | null> {
  const rows = await readRange(`${SHEETS.directivas}!A2:L`);
  const idx = rows.findIndex((r) => (r[0] ?? "") === id);
  if (idx === -1) return null;
  return { d: rowToDirectiva(rows[idx]), rowNumber: idx + 2 };
}

export async function updateDirectiva(id: string, patch: Partial<Directiva>): Promise<Directiva | null> {
  if (isDemoMode()) return null;
  const found = await findDirectivaRow(id);
  if (!found) return null;
  const merged: Directiva = { ...found.d, ...patch, id: found.d.id };
  await getSheets().spreadsheets.values.update({
    spreadsheetId: getSheetId(),
    range: `${SHEETS.directivas}!A${found.rowNumber}:L${found.rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [directivaToRow(merged)] },
  });
  return merged;
}

export async function deleteDirectiva(id: string): Promise<void> {
  if (isDemoMode()) return;
  const rows = await readRange(`${SHEETS.directivas}!A2:L`);
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
