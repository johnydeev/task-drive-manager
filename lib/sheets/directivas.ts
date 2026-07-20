import { getSheetId } from "../google-auth";
import { isDemoMode } from "../demo-mode";
import type { Directiva, DirectivaNuevaInput } from "@/types";
import { getSheets, readRange, SHEETS, getSheetGid } from "./core";
import { buildHeaderMap, type HeaderMap } from "./headers";
import { toDateOnly } from "./values";
import { estadoEfectivo } from "../directivas-estado";

// Headers: id · descripcion · fecha · asignado_a · creado_por · creado_en · estado
//        · aceptada_en · realizada_en · nota_cierre · objetada_en · nota_objecion · actualizado_en
const RANGE = `${SHEETS.directivas}!A:M`;

// Mapea una fila a Directiva (estado BASE, sin derivar). El estado efectivo lo
// aplica rowsToDirectivas / los getters.
function rowToDirectiva(h: HeaderMap, r: string[]): Directiva {
  return {
    id: h.get(r, "id"),
    descripcion: h.get(r, "descripcion"),
    fecha: toDateOnly(h.get(r, "fecha")),
    asignadoA: h.get(r, "asignado_a").trim().toLowerCase(),
    creadoPor: h.get(r, "creado_por").trim().toLowerCase(),
    creadoEn: h.get(r, "creado_en"),
    estado: (h.get(r, "estado") as Directiva["estado"]) || "Asignada",
    aceptadaEn: h.get(r, "aceptada_en") || undefined,
    realizadaEn: h.get(r, "realizada_en") || undefined,
    notaCierre: h.get(r, "nota_cierre") || undefined,
    objetadaEn: h.get(r, "objetada_en") || undefined,
    notaObjecion: h.get(r, "nota_objecion") || undefined,
    actualizadoEn: h.get(r, "actualizado_en") || undefined,
  };
}

export function rowsToDirectivas(rows: string[][], now: number): Directiva[] {
  if (rows.length === 0) return [];
  const h = buildHeaderMap(rows[0] ?? []);
  return rows
    .slice(1)
    .filter((r) => h.get(r, "id"))
    .map((r) => {
      const d = rowToDirectiva(h, r);
      return { ...d, estado: estadoEfectivo(d, now) };
    });
}

function directivaToRow(d: Directiva): string[] {
  return [
    d.id,
    d.descripcion,
    toDateOnly(d.fecha),
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
    d.actualizadoEn ?? "",
  ];
}

export async function getDirectivas(email?: string): Promise<Directiva[]> {
  if (isDemoMode()) return [];
  const rows = await readRange(RANGE);
  const all = rowsToDirectivas(rows, Date.now());
  if (!email) return all;
  const target = email.trim().toLowerCase();
  return all.filter((d) => d.asignadoA === target);
}

export async function getDirectivaById(id: string): Promise<Directiva | null> {
  if (isDemoMode()) return null;
  const rows = await readRange(RANGE);
  const all = rowsToDirectivas(rows, Date.now());
  return all.find((d) => d.id === id) ?? null;
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
    actualizadoEn: now,
  };
  if (isDemoMode()) return directiva;
  await getSheets().spreadsheets.values.append({
    spreadsheetId: getSheetId(),
    range: RANGE,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [directivaToRow(directiva)] },
  });
  return directiva;
}

async function findDirectivaRow(id: string): Promise<{ d: Directiva; rowNumber: number } | null> {
  const rows = await readRange(RANGE);
  if (rows.length === 0) return null;
  const h = buildHeaderMap(rows[0] ?? []);
  const idx = rows.slice(1).findIndex((r) => h.get(r, "id") === id);
  if (idx === -1) return null;
  return { d: rowToDirectiva(h, rows[idx + 1]), rowNumber: idx + 2 };
}

export async function updateDirectiva(id: string, patch: Partial<Directiva>): Promise<Directiva | null> {
  if (isDemoMode()) return null;
  const found = await findDirectivaRow(id);
  if (!found) return null;
  const merged: Directiva = {
    ...found.d,
    ...patch,
    id: found.d.id,
    actualizadoEn: new Date().toISOString(),
  };
  await getSheets().spreadsheets.values.update({
    spreadsheetId: getSheetId(),
    range: `${SHEETS.directivas}!A${found.rowNumber}:M${found.rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [directivaToRow(merged)] },
  });
  return merged;
}

export async function deleteDirectiva(id: string): Promise<void> {
  if (isDemoMode()) return;
  const rows = await readRange(RANGE);
  if (rows.length === 0) return;
  const h = buildHeaderMap(rows[0] ?? []);
  const idx = rows.slice(1).findIndex((r) => h.get(r, "id") === id);
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
