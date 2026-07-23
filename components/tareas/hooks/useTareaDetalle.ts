"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import type { Tarea } from "@/types";

// Lógica del detalle de tarea: query + mutations (eliminar / asignar / transicionar /
// generar reporte), permisos por rol y estado de UI. El componente arma el JSX.
export function useTareaDetalle(rowId: string) {
  const qc = useQueryClient();
  const router = useRouter();
  const { data: session } = useSession();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteDone, setDeleteDone] = useState(false);

  const tareaQ = useQuery({
    queryKey: ["tarea", rowId],
    queryFn: () => api.tareas.get(rowId),
  });

  const eliminar = useMutation({
    mutationFn: () => api.tareas.remove(rowId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tareas"] });
      setConfirmDelete(false);
      setDeleteDone(true);
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
      accion: "aceptar" | "empezar" | "revisar" | "cerrar" | "comentar";
      comentario?: string;
      nota?: string;
    }) => api.tareas.transicionar(rowId, input),
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

  const onDeleteDoneClose = () => {
    qc.removeQueries({ queryKey: ["tarea", rowId] });
    router.push("/tareas");
    router.refresh();
  };

  return {
    tareaQ,
    t,
    eliminar,
    asignar,
    transicionar,
    generarReporte,
    isAdmin,
    esAsignado,
    canEditFields,
    editing,
    setEditing,
    confirmDelete,
    setConfirmDelete,
    deleteDone,
    onEditSuccess,
    onDeleteDoneClose,
  };
}
