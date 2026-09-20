"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { useToast } from "@/components/ui/Toaster";
import type { Tarea } from "@/types";

// Lógica del detalle de tarea: query + mutations (eliminar / asignar / transicionar /
// generar reporte), permisos por rol y estado de UI. El componente arma el JSX.
const MAX_INTENTOS_REPORTE = 20; // 20 × 3 s = 1 min
// Solo se espera el reporte de un cierre RECIENTE (realizadaEn = now al cerrar): una tarea
// cuyo reporte falló hace días no debe disparar 20 GETs cada vez que alguien la abre.
const VENTANA_CIERRE_RECIENTE_MS = 10 * 60 * 1000;

function cierreReciente(realizadaEn: string | undefined, now: number): boolean {
  if (!realizadaEn) return false;
  const ms = Date.parse(realizadaEn);
  return !Number.isNaN(ms) && now - ms < VENTANA_CIERRE_RECIENTE_MS;
}

export function useTareaDetalle(rowId: string) {
  const qc = useQueryClient();
  const router = useRouter();
  const { data: session } = useSession();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const toast = useToast();
  // Tras cerrar, el reporte se genera en el server: se repolla el detalle cada 3 s hasta que
  // llegue reporteUrl, con tope (si la generación falló, el admin ve "Generar reporte").
  // El contador de intentos se ajusta durante el render (no en un efecto) cada vez que llega
  // un dato nuevo (dataUpdatedAt); TanStack recomputa refetchInterval en cada cambio de
  // estado, no una vez por tick, por eso no se cuenta adentro de esa función.
  const [seguimiento, setSeguimiento] = useState({ rowId, updatedAt: 0, intentos: 0 });
  const intentosReporte = seguimiento.intentos;
  // "Ahora" fijado al montar: Date.now() durante el render es impuro para el compilador de
  // React, y para decidir si el cierre es reciente alcanza el momento en que se abrió la tarea.
  const [abiertoEn] = useState(() => Date.now());

  const tareaQ = useQuery({
    queryKey: ["tarea", rowId],
    queryFn: () => api.tareas.get(rowId),
    // Render inmediato desde la lista ya cargada (si está); initialDataUpdatedAt hace que
    // TanStack respete el staleTime y refetchee en segundo plano si el dato es viejo.
    initialData: () => qc.getQueryData<Tarea[]>(["tareas", "all"])?.find((t) => t.rowId === rowId),
    initialDataUpdatedAt: () => qc.getQueryState(["tareas", "all"])?.dataUpdatedAt,
    staleTime: 30_000,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data?.estado !== "Realizada" || data.reporteUrl) return false;
      if (!cierreReciente(data.realizadaEn, Date.now())) return false;
      return intentosReporte < MAX_INTENTOS_REPORTE ? 3000 : false;
    },
  });

  const esperando =
    tareaQ.data?.estado === "Realizada" &&
    !tareaQ.data.reporteUrl &&
    cierreReciente(tareaQ.data.realizadaEn, abiertoEn);
  if (seguimiento.rowId !== rowId) {
    setSeguimiento({ rowId, updatedAt: tareaQ.dataUpdatedAt, intentos: 0 });
  } else if (seguimiento.updatedAt !== tareaQ.dataUpdatedAt) {
    setSeguimiento({
      rowId,
      updatedAt: tareaQ.dataUpdatedAt,
      intentos: esperando ? seguimiento.intentos + 1 : 0,
    });
  }
  const esperandoReporte = esperando && intentosReporte < MAX_INTENTOS_REPORTE;

  const eliminar = useMutation({
    mutationFn: () => api.tareas.remove(rowId),
    onSuccess: () => {
      setConfirmDelete(false);
      toast.success("Tarea eliminada");
      qc.invalidateQueries({ queryKey: ["tareas"] });
      qc.removeQueries({ queryKey: ["tarea", rowId] });
      router.push("/tareas");
      router.refresh();
    },
  });

  // Refresca las caches tras una asignación/transición.
  const refresh = (updated: Tarea) => {
    qc.setQueryData(["tarea", rowId], updated);
    qc.invalidateQueries({ queryKey: ["tareas"] });
  };

  const asignar = useMutation({
    mutationFn: (asignadoA: string) => api.tareas.asignar(rowId, asignadoA),
    onSuccess: refresh,
  });

  const transicionar = useMutation({
    mutationFn: (input: {
      accion:
        | "aceptar"
        | "empezar"
        | "revisar"
        | "cerrar"
        | "comentar"
        | "objetar"
        | "editarComentarioProceso"
        | "editarComentarioRevision";
      comentario?: string;
      nota?: string;
    }) => api.tareas.transicionar(rowId, input),
    onSuccess: refresh,
  });

  const agregarArchivos = useMutation({
    mutationFn: (media: { imagenes?: string[]; videos?: string[]; documentos?: string[] }) =>
      api.tareas.agregarArchivos(rowId, media),
    onSuccess: refresh,
  });

  const generarReporte = useMutation({
    mutationFn: () => api.tareas.generarReporte(rowId),
    onSuccess: ({ reporteUrl }) => {
      qc.setQueryData(["tarea", rowId], (prev: Tarea | undefined) =>
        prev ? { ...prev, reporteUrl } : prev
      );
      if (typeof window !== "undefined") window.open(reporteUrl, "_blank");
    },
  });

  const t = tareaQ.data;
  const email = session?.user?.email?.toLowerCase();
  // Sin sesión (demo/carga) es permisivo; el server valida igual en cada endpoint.
  const isAdmin = !session?.user || session.user.rol === "admin";
  const esAsignado = !!email && email === t?.asignadoA?.toLowerCase();
  // Editar campos / borrar / regenerar reporte: SOLO admin.
  const canEditFields = isAdmin;

  const onEditSuccess = (updated: Tarea) => {
    qc.setQueryData(["tarea", rowId], updated);
    qc.invalidateQueries({ queryKey: ["tareas"] });
    setEditing(false);
  };

  return {
    tareaQ,
    t,
    eliminar,
    asignar,
    transicionar,
    agregarArchivos,
    generarReporte,
    isAdmin,
    esAsignado,
    canEditFields,
    editing,
    setEditing,
    confirmDelete,
    setConfirmDelete,
    esperandoReporte,
    onEditSuccess,
  };
}
