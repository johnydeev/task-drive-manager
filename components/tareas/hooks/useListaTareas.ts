"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEdificios, useTareas } from "@/hooks/queries";
import { filterTareas } from "@/lib/tareas-filter";
import { buscarTareas, ordenarTareas, ORDENES, type OrdenTareas } from "@/lib/tareas-orden";
import { estadoEnum, prioridadEnum } from "@/lib/schemas";
import type { EstadoTarea, Prioridad } from "@/types";

export interface FiltrosLista {
  edificio: string; // "" = todos
  estado: EstadoTarea | ""; // "" = todos
  prioridad: Prioridad | ""; // "" = todas
  mias: boolean;
  sinAsignar: boolean;
  q: string;
  orden: OrdenTareas;
}

const ORDEN_DEFAULT: OrdenTareas = "prioridad";

// URL → filtros. Valores inválidos (enum, orden) cuentan como default.
export function leerFiltros(params: URLSearchParams): FiltrosLista {
  const estado = estadoEnum.safeParse(params.get("estado"));
  const prioridad = prioridadEnum.safeParse(params.get("prioridad"));
  const orden = params.get("orden");
  return {
    edificio: params.get("edificio") ?? "",
    estado: estado.success ? estado.data : "",
    prioridad: prioridad.success ? prioridad.data : "",
    mias: params.get("mias") === "1",
    sinAsignar: params.get("sinAsignar") === "1",
    q: params.get("q") ?? "",
    orden: ORDENES.some((o) => o.value === orden) ? (orden as OrdenTareas) : ORDEN_DEFAULT,
  };
}

// Filtros → query string. Omite defaults: la URL limpia es /tareas.
export function escribirFiltros(f: FiltrosLista): string {
  const p = new URLSearchParams();
  if (f.edificio) p.set("edificio", f.edificio);
  if (f.estado) p.set("estado", f.estado);
  if (f.prioridad) p.set("prioridad", f.prioridad);
  if (f.mias) p.set("mias", "1");
  if (f.sinAsignar) p.set("sinAsignar", "1");
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.orden !== ORDEN_DEFAULT) p.set("orden", f.orden);
  return p.toString();
}

// Lógica de /tareas: filtros con la URL como persistencia (estado local sembrado al montar,
// router.replace en cada cambio; volver del detalle remonta y relee), búsqueda y orden en
// memoria sobre la query única de tareas.
export function useListaTareas() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const myEmail = session?.user?.email?.toLowerCase() ?? "";
  const isAdmin = !session?.user || session.user.rol === "admin";

  const [filtros, setFiltros] = useState<FiltrosLista>(() => leerFiltros(searchParams));
  const [hayFiltrosAvanzados] = useState(
    () => !!(filtros.edificio || filtros.estado || filtros.prioridad)
  );

  const setFiltro = <K extends keyof FiltrosLista>(k: K, v: FiltrosLista[K]) => {
    setFiltros((prev) => {
      const next = { ...prev, [k]: v };
      // "Mis tareas" y "Sin asignar" se excluyen: activar uno apaga el otro.
      if (k === "mias" && v) next.sinAsignar = false;
      if (k === "sinAsignar" && v) next.mias = false;
      const qs = escribirFiltros(next);
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      return next;
    });
  };

  const tareasQ = useTareas();
  const edificiosQ = useEdificios();

  const tareas = useMemo(() => {
    const filtradas = filterTareas(tareasQ.data ?? [], {
      edificio: filtros.edificio || undefined,
      estado: filtros.estado || undefined,
      prioridad: filtros.prioridad || undefined,
      asignado: filtros.mias && myEmail ? myEmail : undefined,
      sinAsignar: filtros.sinAsignar || undefined,
    });
    return ordenarTareas(buscarTareas(filtradas, filtros.q), filtros.orden);
  }, [tareasQ.data, filtros, myEmail]);

  return { filtros, setFiltro, tareas, tareasQ, edificiosQ, hayFiltrosAvanzados, isAdmin, myEmail };
}
