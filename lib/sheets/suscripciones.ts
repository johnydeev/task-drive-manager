import { nanoid } from "nanoid";
import { isDemoMode } from "../demo-mode";
import { nowBuenosAiresISO } from "../fecha-ar";
import { conLockDeHoja, deleteRows, readRange, SHEETS, writeRange } from "./core";
import { buildHeaderMap } from "./headers";
import type { Suscripcion } from "@/types";

// Hoja de suscripciones push: id · email · endpoint · p256dh · auth · user_agent · creado_en.
const RANGE = `${SHEETS.suscripciones}!A:G`;
export const SUSCRIPCIONES_COLUMNAS = [
  "id",
  "email",
  "endpoint",
  "p256dh",
  "auth",
  "user_agent",
  "creado_en",
];

function parse(rows: string[][]): { items: Suscripcion[]; rowNumbers: Map<string, number> } {
  const items: Suscripcion[] = [];
  const rowNumbers = new Map<string, number>();
  if (rows.length === 0) return { items, rowNumbers };
  const h = buildHeaderMap(rows[0] ?? []);
  rows.slice(1).forEach((r, i) => {
    const endpoint = h.get(r, "endpoint").trim();
    if (!endpoint) return;
    items.push({
      id: h.get(r, "id"),
      email: h.get(r, "email").trim().toLowerCase(),
      endpoint,
      p256dh: h.get(r, "p256dh"),
      auth: h.get(r, "auth"),
      userAgent: h.get(r, "user_agent"),
      creadoEn: h.get(r, "creado_en"),
    });
    rowNumbers.set(endpoint, i + 2);
  });
  return { items, rowNumbers };
}

function toRow(s: Suscripcion): string[] {
  return [s.id, s.email, s.endpoint, s.p256dh, s.auth, s.userAgent, s.creadoEn];
}

// Todas, o solo las de esos emails (minúsculas).
export async function getSuscripciones(emails?: string[]): Promise<Suscripcion[]> {
  if (isDemoMode()) return [];
  const { items } = parse(await readRange(RANGE));
  if (!emails) return items;
  const set = new Set(emails.map((e) => e.toLowerCase()));
  return items.filter((s) => set.has(s.email));
}

export type SuscripcionInput = Pick<
  Suscripcion,
  "email" | "endpoint" | "p256dh" | "auth" | "userAgent"
>;

// Por endpoint: igual → no escribe (la UI re-sincroniza en cada carga); distinta → actualiza
// esa fila; nueva → agrega. Bajo lock: el "fila libre" no puede pisarse con otro alta.
export async function upsertSuscripcion(
  input: SuscripcionInput
): Promise<"sin-cambios" | "actualizada" | "creada"> {
  if (isDemoMode()) return "sin-cambios";
  return conLockDeHoja(SHEETS.suscripciones, async () => {
    const rows = await readRange(RANGE);
    const { items, rowNumbers } = parse(rows);
    const email = input.email.toLowerCase();
    const existente = items.find((s) => s.endpoint === input.endpoint);
    if (existente) {
      const igual =
        existente.email === email &&
        existente.p256dh === input.p256dh &&
        existente.auth === input.auth;
      if (igual) return "sin-cambios";
      const fila = rowNumbers.get(input.endpoint) as number;
      await writeRange(`${SHEETS.suscripciones}!A${fila}:G${fila}`, [
        toRow({
          ...existente,
          email,
          p256dh: input.p256dh,
          auth: input.auth,
          userAgent: input.userAgent,
        }),
      ]);
      return "actualizada";
    }
    const nueva: Suscripcion = {
      id: nanoid(10),
      ...input,
      email,
      creadoEn: nowBuenosAiresISO(),
    };
    const nextRow = rows.length + 1;
    await writeRange(`${SHEETS.suscripciones}!A${nextRow}:G${nextRow}`, [toRow(nueva)]);
    return "creada";
  });
}

export async function deleteSuscripcion(endpoint: string): Promise<void> {
  if (isDemoMode()) return;
  const { rowNumbers } = parse(await readRange(RANGE));
  const fila = rowNumbers.get(endpoint);
  if (fila) await deleteRows(SHEETS.suscripciones, [fila]);
}
