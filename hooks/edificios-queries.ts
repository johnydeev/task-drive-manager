"use client";

import { useCachedQuery } from "./useCachedQuery";
import { api } from "@/lib/api-client";

// Datos de la vista Edificios. Requiere conexión: sin cache offline
// (cache/readCache de useCachedQuery son opcionales).
export const useUsuarios = () => useCachedQuery({ queryKey: ["usuarios"], fetcher: api.usuarios.list });
export const useAsignaciones = () =>
  useCachedQuery({ queryKey: ["asignaciones"], fetcher: api.asignaciones.list });
export const useDirectivas = () =>
  useCachedQuery({ queryKey: ["directivas"], fetcher: api.directivas.list });
