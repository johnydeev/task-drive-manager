"use client";

import { useQuery, type QueryKey } from "@tanstack/react-query";

// staleTime por defecto: 5 min. Coincide con el valor que usaban las queries
// inline en los formularios antes de extraer este hook.
const DEFAULT_STALE_TIME = 5 * 60_000;

export interface CachedQueryConfig<T> {
  queryKey: QueryKey;
  // Trae el dato fresco desde la red (típicamente una función de `lib/api-client`).
  fetcher: () => Promise<T>;
  // Persiste el dato fresco en el cache offline. Fire-and-forget: si falla,
  // no rompe el camino feliz. Opcional para queries sin soporte offline.
  cache?: (data: T) => Promise<void> | void;
  // Lee el dato del cache offline cuando la red falla. Devuelve null si no hay
  // nada usable (o está vencido). Opcional.
  readCache?: () => Promise<T | null>;
  enabled?: boolean;
  staleTime?: number;
}

// Query con fallback offline: intenta la red, cachea el resultado, y si la red
// falla recae en el cache local. Centraliza el patrón que estaba duplicado en
// cada formulario (edificios, dptos, config, proveedores, partes comunes).
export function useCachedQuery<T>({
  queryKey,
  fetcher,
  cache,
  readCache,
  enabled,
  staleTime = DEFAULT_STALE_TIME,
}: CachedQueryConfig<T>) {
  return useQuery<T>({
    queryKey,
    queryFn: async () => {
      try {
        const data = await fetcher();
        // No await: cachear no debe demorar ni romper la respuesta.
        if (cache) Promise.resolve(cache(data)).catch(() => {});
        return data;
      } catch (err) {
        if (readCache) {
          const cached = await readCache();
          if (cached != null) return cached;
        }
        throw err;
      }
    },
    enabled,
    staleTime,
  });
}
