"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import type { EstadoTarea, Tarea } from "@/types";

// Lógica del detalle de tarea: query + mutations (eliminar/patchEstado/generarReporte),
// permiso de borrado y estado de UI. El componente TareaDetalle consume esto y arma el JSX.
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

  const patchEstado = useMutation({
    mutationFn: (estado: EstadoTarea) => api.tareas.patchEstado(rowId, { estado }),
    onSuccess: (updated) => {
      qc.setQueryData(["tarea", rowId], updated);
      qc.invalidateQueries({ queryKey: ["tareas"] });
    },
  });

  const generarReporte = useMutation({
    mutationFn: () => api.tareas.generarReporte(rowId),
    onSuccess: ({ reporteUrl }) => {
      qc.setQueryData(["tarea", rowId], (prev: Tarea | undefined) =>
        prev ? { ...prev, reporteUrl } : prev
      );
      // Abrir el reporte recién generado en una pestaña nueva.
      if (typeof window !== "undefined") window.open(reporteUrl, "_blank");
    },
  });

  const t = tareaQ.data;

  // Puede MODIFICAR (editar / cambiar estado / borrar / generar reporte) el admin o quien
  // creó la tarea. El resto solo la ve. Sin sesión (demo/carga) es permisivo; el servidor
  // igual valida el permiso en cada endpoint de escritura.
  const canModify =
    !session?.user ||
    session.user.rol === "admin" ||
    session.user.email?.toLowerCase() === t?.supervisor?.toLowerCase();

  // Al guardar una edición: refrescar caches y salir del modo edición.
  const onEditSuccess = (updated: Tarea) => {
    qc.setQueryData(["tarea", rowId], updated);
    qc.invalidateQueries({ queryKey: ["tareas"] });
    setEditing(false);
  };

  // Al cerrar el modal de "eliminada": limpiar cache y volver al listado.
  const onDeleteDoneClose = () => {
    qc.removeQueries({ queryKey: ["tarea", rowId] });
    router.push("/tareas");
    router.refresh();
  };

  return {
    tareaQ,
    t,
    eliminar,
    patchEstado,
    generarReporte,
    canModify,
    editing,
    setEditing,
    confirmDelete,
    setConfirmDelete,
    deleteDone,
    onEditSuccess,
    onDeleteDoneClose,
  };
}
