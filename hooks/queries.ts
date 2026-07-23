"use client";

import { useCachedQuery } from "./useCachedQuery";
import { api } from "@/lib/api-client";
import {
  cacheEdificios,
  readCachedEdificios,
  cacheDptos,
  readCachedDptos,
  cacheConfig,
  readCachedConfig,
  cacheProveedores,
  readCachedProveedores,
  cachePartesComunes,
  readCachedPartesComunes,
} from "@/lib/offline-db";

export const useEdificios = () =>
  useCachedQuery({
    queryKey: ["edificios"],
    fetcher: api.edificios.list,
    cache: cacheEdificios,
    readCache: readCachedEdificios,
  });

// Dptos reales de un edificio. Se salta si no hay edificio elegido o si la tarea
// es sobre una parte común (en ese caso los datos los trae usePartesComunes).
export const useDptos = (edificio: string, parteComun: boolean) =>
  useCachedQuery({
    queryKey: ["dptos", edificio],
    fetcher: () => api.dptos.list(edificio),
    cache: (d) => cacheDptos(edificio, d),
    readCache: () => readCachedDptos(edificio),
    enabled: !!edificio && !parteComun,
  });

// Partes comunes: ahora viven en su propia hoja "Partes Comunes" (no en Dptos).
export const usePartesComunes = (parteComun: boolean) =>
  useCachedQuery({
    queryKey: ["partes-comunes"],
    fetcher: api.partesComunes.list,
    cache: cachePartesComunes,
    readCache: readCachedPartesComunes,
    enabled: parteComun,
  });

export const useConfig = () =>
  useCachedQuery({
    queryKey: ["configuracion"],
    fetcher: api.configuracion.get,
    cache: cacheConfig,
    readCache: readCachedConfig,
  });

export const useProveedores = () =>
  useCachedQuery({
    queryKey: ["proveedores"],
    fetcher: api.proveedores.list,
    cache: cacheProveedores,
    readCache: readCachedProveedores,
  });
