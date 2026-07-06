import { readRangeFromSpreadsheet } from "./sheets-client";
import { getConsorciosSheetId } from "./google-auth";
import { isDemoMode } from "./demo-mode";
import { getDemoProveedores } from "./demo-data";

// Lee la lista de proveedores desde la hoja `_Proveedores` (columna A) del archivo
// externo de consorcios (owned by ia-drive-doc-processor / boletas). Solo lectura.
// Mismo patrón de cache SWR que lib/consorcios.ts.

interface CacheEntry {
  data: string[];
  expires: number;
  stale: string[];
}

const TTL_MS = 5 * 60 * 1000;
let cache: CacheEntry | null = null;

export function _resetProveedoresCache(opts?: { keepStale?: boolean }) {
  if (opts?.keepStale && cache) {
    cache = { ...cache, expires: 0 };
  } else {
    cache = null;
  }
}

export async function getProveedores(): Promise<string[]> {
  if (isDemoMode()) {
    return getDemoProveedores();
  }

  if (cache && cache.expires > Date.now()) {
    return cache.data;
  }

  try {
    const rows = await readRangeFromSpreadsheet(getConsorciosSheetId(), "_Proveedores!A2:A");
    const seen = new Set<string>();
    const data: string[] = [];
    for (const r of rows) {
      const nombre = (r[0] ?? "").trim();
      if (!nombre) continue;
      const key = nombre.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      data.push(nombre);
    }
    data.sort((a, b) => a.localeCompare(b, "es"));

    cache = { data, expires: Date.now() + TTL_MS, stale: data };
    return data;
  } catch (err) {
    if (cache?.stale && cache.stale.length > 0) {
      console.warn("[proveedores] usando stale cache, red caída:", err);
      return cache.stale;
    }
    throw err;
  }
}
