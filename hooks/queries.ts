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
} from "@/lib/offline-db";

// "Edificio" virtual en la hoja Dptos que agrupa las partes comunes posibles.
// El listado de partes comunes se pide como si fuera un edificio más.
export const PARTE_COMUN_EDIFICIO = "Parte Común";

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

// Partes comunes: dptos del edificio virtual "Parte Común". Se cachean offline
// bajo la misma tabla que los dptos, con la key del edificio virtual.
export const usePartesComunes = (parteComun: boolean) =>
  useCachedQuery({
    queryKey: ["dptos", PARTE_COMUN_EDIFICIO],
    fetcher: () => api.dptos.list(PARTE_COMUN_EDIFICIO),
    cache: (d) => cacheDptos(PARTE_COMUN_EDIFICIO, d),
    readCache: () => readCachedDptos(PARTE_COMUN_EDIFICIO),
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
