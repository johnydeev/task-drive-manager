import { nanoid } from "nanoid";
import { isDemoMode } from "../demo-mode";
import { nowBuenosAiresISO } from "../fecha-ar";
import { conLockDeHoja, deleteRows, readRange, SHEETS, writeRange, writeRanges } from "./core";
import { buildHeaderMap } from "./headers";
import type { AvisoGuardado } from "@/types";

// Hoja Avisos: id · email · titulo · cuerpo · url · tipo · creado_en · leido_en.
// Una fila por destinatario; es lo que muestra la campana.
const RANGE = `${SHEETS.avisos}!A:H`;
export const AVISOS_COLUMNAS = [
  "id",
  "email",
  "titulo",
  "cuerpo",
  "url",
  "tipo",
  "creado_en",
  "leido_en",
];

export type AvisoNuevo = Pick<AvisoGuardado, "email" | "titulo" | "cuerpo" | "url" | "tipo">;

interface Parseado {
  items: AvisoGuardado[];
  rowNumbers: Map<string, number>; // id → fila 1-based
}

function parse(rows: string[][]): Parseado {
  const items: AvisoGuardado[] = [];
  const rowNumbers = new Map<string, number>();
  if (rows.length === 0) return { items, rowNumbers };
  const h = buildHeaderMap(rows[0] ?? []);
  rows.slice(1).forEach((r, i) => {
    const email = h.get(r, "email").trim().toLowerCase();
    const titulo = h.get(r, "titulo").trim();
    if (!email || !titulo) return;
    const id = h.get(r, "id") || `fila-${i + 2}`;
    items.push({
      id,
      email,
      titulo,
      cuerpo: h.get(r, "cuerpo"),
      url: h.get(r, "url") || "/tareas",
      tipo: h.get(r, "tipo") as AvisoGuardado["tipo"],
      creadoEn: h.get(r, "creado_en"),
      leidoEn: h.get(r, "leido_en").trim() || null,
    });
    rowNumbers.set(id, i + 2);
  });
  return { items, rowNumbers };
}

function toRow(a: AvisoGuardado): string[] {
  return [a.id, a.email, a.titulo, a.cuerpo, a.url, a.tipo, a.creadoEn, a.leidoEn ?? ""];
}

const ts = (iso: string) => Date.parse(iso);

// Avisos de un email desde `desde` (epoch ms), más nuevos primero.
export async function getAvisos(email: string, opts: { desde: number }): Promise<AvisoGuardado[]> {
  if (isDemoMode()) return [];
  const e = email.trim().toLowerCase();
  const { items } = parse(await readRange(RANGE));
  return items
    .filter((a) => a.email === e && ts(a.creadoEn) >= opts.desde)
    .sort((a, b) => ts(b.creadoEn) - ts(a.creadoEn));
}

// Alta de varias filas en UNA escritura, a partir de la fila libre. Sin lock: lo toman los
// públicos de abajo.
async function append(rows: string[][], filas: AvisoNuevo[]): Promise<void> {
  if (filas.length === 0) return;
  const creadoEn = nowBuenosAiresISO();
  const nuevas = filas.map((f) =>
    toRow({ ...f, email: f.email.trim().toLowerCase(), id: nanoid(10), creadoEn, leidoEn: null })
  );
  const desde = rows.length + 1;
  await writeRange(`${SHEETS.avisos}!A${desde}:H${desde + nuevas.length - 1}`, nuevas);
}

export async function appendAvisos(filas: AvisoNuevo[]): Promise<void> {
  if (isDemoMode() || filas.length === 0) return;
  await conLockDeHoja(SHEETS.avisos, async () => {
    await append(await readRange(RANGE), filas);
  });
}

// Recordatorios diarios: el de hoy reemplaza al anterior del mismo email + tipo, así la
// campana no acumula uno por día.
export async function reemplazarRecordatorios(filas: AvisoNuevo[]): Promise<void> {
  if (isDemoMode() || filas.length === 0) return;
  await conLockDeHoja(SHEETS.avisos, async () => {
    const rows = await readRange(RANGE);
    const { items, rowNumbers } = parse(rows);
    const claves = new Set(filas.map((f) => `${f.email.trim().toLowerCase()}|${f.tipo}`));
    const aBorrar = items
      .filter((a) => claves.has(`${a.email}|${a.tipo}`))
      .map((a) => rowNumbers.get(a.id) as number);
    if (aBorrar.length > 0) {
      await deleteRows(SHEETS.avisos, aBorrar);
      await append(await readRange(RANGE), filas);
    } else {
      await append(rows, filas);
    }
  });
}

// Marca leídos todos los no leídos del email creados hasta `hasta`, en una sola llamada.
// Bajo lock: escribe por número de fila, y un borrado concurrente (purga / reemplazo de
// recordatorios) correría las filas entre la lectura y la escritura.
export async function marcarLeidos(email: string, hasta = Date.now()): Promise<number> {
  if (isDemoMode()) return 0;
  const e = email.trim().toLowerCase();
  return conLockDeHoja(SHEETS.avisos, async () => {
    const { items, rowNumbers } = parse(await readRange(RANGE));
    const iso = nowBuenosAiresISO();
    const entradas = items
      .filter((a) => a.email === e && !a.leidoEn && ts(a.creadoEn) <= hasta)
      .map((a) => ({ range: `${SHEETS.avisos}!H${rowNumbers.get(a.id)}`, values: [[iso]] }));
    await writeRanges(entradas);
    return entradas.length;
  });
}

// Borra los avisos anteriores a `antesDe` (o con fecha inválida). Devuelve cuántos.
export async function purgarAvisos(antesDe: number): Promise<number> {
  if (isDemoMode()) return 0;
  return conLockDeHoja(SHEETS.avisos, async () => {
    const { items, rowNumbers } = parse(await readRange(RANGE));
    const viejos = items
      .filter((a) => {
        const t = ts(a.creadoEn);
        return Number.isNaN(t) || t < antesDe;
      })
      .map((a) => rowNumbers.get(a.id) as number);
    await deleteRows(SHEETS.avisos, viejos);
    return viejos.length;
  });
}
