import { readRangeFromSpreadsheet } from "./sheets-client";
import { getMasterSheetId } from "./google-auth";
import { isDemoMode } from "./demo-mode";
import { getDemoEdificios } from "./demo-data";

export interface Consorcio {
  nombre: string;
  cuit: string | null;
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
    return getDemoEdificios().map((e) => ({ nombre: e.nombre, cuit: null }));
  }

  if (cache && cache.expires > Date.now()) {
    return cache.data;
  }

  try {
    const rows = await readRangeFromSpreadsheet(getMasterSheetId(), "_Consorcios!A2:E");
    const data: Consorcio[] = rows
      .filter((r) => r[0] && r[0].trim() !== "" && isActive(r))
      .map((r) => ({
        nombre: r[0]!.trim(),
        cuit: r[1]?.trim() || null,
      }));

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
