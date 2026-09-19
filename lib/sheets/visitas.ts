import { isDemoMode } from "../demo-mode";
import type { Visita } from "@/types";
import { readRange, SHEETS, writeRange, deleteRows } from "./core";
import { buildHeaderMap, type HeaderMap } from "./headers";
import { toDateOnly } from "./values";
import { edificioMatches } from "../edificio-match";
import { nowBuenosAiresISO } from "../fecha-ar";

// Headers: id · edificio · fecha · pdf_url · supervisor · creado_en
// Esta hoja es el ÍNDICE del historial: los datos del formulario viven dentro del PDF.
const RANGE = `${SHEETS.visitas}!A:F`;

function rowToVisita(h: HeaderMap, r: string[]): Visita {
  return {
    id: h.get(r, "id"),
    edificio: h.get(r, "edificio"),
    fecha: toDateOnly(h.get(r, "fecha")),
    pdfUrl: h.get(r, "pdf_url"),
    supervisor: h.get(r, "supervisor").trim().toLowerCase(),
    creadoEn: h.get(r, "creado_en"),
  };
}

function visitaToRow(v: Visita): string[] {
  return [v.id, v.edificio, toDateOnly(v.fecha), v.pdfUrl, v.supervisor, v.creadoEn];
}

// Lee la hoja tolerando que todavía no exista (antes del setup manual en la planilla).
async function leerFilas(): Promise<string[][]> {
  try {
    return await readRange(RANGE);
  } catch {
    return [];
  }
}

export function rowsToVisitas(rows: string[][]): Visita[] {
  if (rows.length === 0) return [];
  const h = buildHeaderMap(rows[0] ?? []);
  return rows
    .slice(1)
    .filter((r) => h.get(r, "id"))
    .map((r) => rowToVisita(h, r));
}

export async function getVisitas(edificio?: string): Promise<Visita[]> {
  if (isDemoMode()) return [];
  const all = rowsToVisitas(await leerFilas());
  if (!edificio) return all;
  return all.filter((v) => edificioMatches(v.edificio, edificio));
}

export async function getVisitaById(id: string): Promise<Visita | null> {
  if (isDemoMode()) return null;
  const all = rowsToVisitas(await leerFilas());
  return all.find((v) => v.id === id) ?? null;
}

// La fecha NO viene del cliente: es el día de emisión en hora de Buenos Aires.
export async function appendVisita(input: {
  edificio: string;
  pdfUrl: string;
  supervisor: string;
}): Promise<Visita> {
  const now = nowBuenosAiresISO();
  const visita: Visita = {
    id: now,
    edificio: input.edificio,
    fecha: now.slice(0, 10),
    pdfUrl: input.pdfUrl,
    supervisor: input.supervisor.trim().toLowerCase(),
    creadoEn: now,
  };
  if (isDemoMode()) return visita;

  // Fila libre por la columna A: values.append dispersa filas al fondo del grid.
  const colA = await readRange(`${SHEETS.visitas}!A:A`);
  const nextRow = colA.length + 1;
  await writeRange(`${SHEETS.visitas}!A${nextRow}:F${nextRow}`, [visitaToRow(visita)]);
  return visita;
}

export async function deleteVisita(id: string): Promise<void> {
  if (isDemoMode()) return;
  const rows = await leerFilas();
  if (rows.length === 0) return;
  const h = buildHeaderMap(rows[0] ?? []);
  const idx = rows.slice(1).findIndex((r) => h.get(r, "id") === id);
  if (idx === -1) return;
  const rowNumber = idx + 2;
  await deleteRows(SHEETS.visitas, [rowNumber]);
}
