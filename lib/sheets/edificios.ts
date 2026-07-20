import type { Dpto, Edificio } from "@/types";
import { isDemoMode } from "../demo-mode";
import { getDemoDptos, getDemoEdificios } from "../demo-data";
import { readRange, SHEETS } from "./core";
import { buildHeaderMap } from "./headers";

// =====================================================
// Edificios
// =====================================================

export async function getEdificios(): Promise<Edificio[]> {
  if (isDemoMode()) return getDemoEdificios();
  const rows = await readRange(`${SHEETS.edificios}!A2:A`);
  return rows
    .map((r) => (r[0] ?? "").trim())
    .filter(Boolean)
    .map((nombre) => ({ nombre }));
}

// =====================================================
// Dptos
// =====================================================

// Normaliza un nombre de edificio para comparar entre hojas distintas:
// minúsculas, sin acentos, sin espacios extra. Necesario porque los edificios
// vienen de _Consorcios (nombre canónico, ej. "BELGRANO 1429") pero los Dptos
// referencian con el nombre de la app vieja (ej. "Belgrano 1429").
function normalizeEdificio(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
}

export function edificioMatches(a: string, b: string): boolean {
  const na = normalizeEdificio(a);
  const nb = normalizeEdificio(b);
  return na !== "" && na === nb;
}

// Headers: id_dpto · dpto · edificio_ref · edificio_cuit (edificio_cuit se puebla en Fase 2).
export function rowsToDptos(rows: string[][]): Dpto[] {
  if (rows.length === 0) return [];
  const h = buildHeaderMap(rows[0] ?? []);
  return rows
    .slice(1)
    .map<Dpto>((r) => ({
      idDpto: h.get(r, "id_dpto").trim(),
      dpto: h.get(r, "dpto").trim(),
      edificioRef: h.get(r, "edificio_ref").trim(),
    }))
    .filter((d) => d.idDpto && d.dpto);
}

export async function getDptos(edificio?: string): Promise<Dpto[]> {
  if (isDemoMode()) return getDemoDptos(edificio);
  const rows = await readRange(`${SHEETS.dptos}!A:C`);
  const all = rowsToDptos(rows);
  if (!edificio) return all;
  return all.filter((d) => edificioMatches(d.edificioRef, edificio));
}
