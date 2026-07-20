import { readRangeFromSpreadsheet } from "./sheets-client";
import { getConsorciosSheetId } from "./google-auth";
import { isDemoMode } from "./demo-mode";
import { getDemoEdificios } from "./demo-data";

export interface Consorcio {
  nombre: string; // NOMBRE CANÓNICO (col A)
  cuit: string | null; // CUIT (col B)
  nombresAlternativos: string[]; // NOMBRES ALTERNATIVOS (C) + ALIAS (D), separados por "|"
}

// Parte un campo con nombres separados por "|" en una lista limpia.
function splitAlternativos(...campos: (string | undefined)[]): string[] {
  return campos
    .flatMap((c) => (c ?? "").split("|"))
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

// Mapea filas crudas de _Consorcios (rango A2:E, sin header) a Consorcios activos.
export function rowsToConsorcios(rows: string[][]): Consorcio[] {
  return rows
    .filter((r) => r[0] && r[0].trim() !== "" && isActive(r))
    .map((r) => ({
      nombre: r[0]!.trim(),
      cuit: r[1]?.trim() || null,
      nombresAlternativos: splitAlternativos(r[2], r[3]),
    }));
}

interface CacheEntry {
  data: Consorcio[];
  expires: number;
  stale: Consorcio[];
}

const TTL_MS = 5 * 60 * 1000;
let cache: CacheEntry | null = null;

export function _resetCache(opts?: { keepStale?: boolean }) {
  if (opts?.keepStale && cache) {
    cache = { ...cache, expires: 0 };
  } else {
    cache = null;
  }
}

function isActive(row: string[]): boolean {
  const col = row[4];
  if (col === undefined || col === "") return true;
  return col.toString().toUpperCase() !== "FALSE";
}

export async function getConsorciosActivos(): Promise<Consorcio[]> {
  if (isDemoMode()) {
    return getDemoEdificios().map((e) => ({ nombre: e.nombre, cuit: null, nombresAlternativos: [] }));
  }

  if (cache && cache.expires > Date.now()) {
    return cache.data;
  }

  try {
    const rows = await readRangeFromSpreadsheet(getConsorciosSheetId(), "_Consorcios!A2:E");
    const data = rowsToConsorcios(rows);

    cache = { data, expires: Date.now() + TTL_MS, stale: data };
    return data;
  } catch (err) {
    if (cache?.stale && cache.stale.length > 0) {
      console.warn("[consorcios] usando stale cache, red caída:", err);
      return cache.stale;
    }
    throw err;
  }
}
