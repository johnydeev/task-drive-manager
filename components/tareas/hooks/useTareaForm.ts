"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { nanoid } from "nanoid";
import { api } from "@/lib/api-client";
import { tareaFormSchema } from "@/lib/schemas";
import { nowBuenosAiresISO } from "@/lib/fecha-ar";
import { CONFIGURACION_DEFAULT, type Configuracion, type Tarea } from "@/types";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { enqueueTarea } from "@/lib/offline-db";
import { registerBackgroundSync } from "@/lib/background-sync";
import {
  useEdificios,
  useDptos,
  usePartesComunes,
  useConfig,
  useProveedores,
} from "@/hooks/queries";

export type TareaFormValues = z.infer<typeof tareaFormSchema>;

interface Options {
  mode: "create" | "edit";
  initial?: Tarea;
  onSubmitSuccess?: (tarea: Tarea) => void;
}

// Toda la lógica del form de tareas: react-hook-form, datos (hooks por entidad),
// estado de archivos, submit (create/edit/offline) y el modal de éxito. El componente
// TareaForm solo consume lo que este hook devuelve y se limita al JSX.
export function useTareaForm({ mode, initial, onSubmitSuccess }: Options) {
  const router = useRouter();
  const online = useOnlineStatus();
  const [imagenes, setImagenes] = useState<string[]>(initial?.imagenes ?? []);
  const [videos, setVideos] = useState<string[]>(initial?.videos ?? []);
  const [documentos, setDocumentos] = useState<string[]>(initial?.documentos ?? []);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Modal de éxito tras crear/editar. Guarda la tarea resultante para navegar al cerrarlo.
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<Tarea | null>(null);
  // ID estable de la tarea (timestamp ISO): agrupa los archivos en una sola carpeta de Drive
  // y se usa como rowId al guardar. En edición se reutiliza el de la tarea existente.
  const [taskRowId] = useState<string>(() => initial?.rowId ?? nowBuenosAiresISO());

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<TareaFormValues>({
    resolver: zodResolver(tareaFormSchema),
    defaultValues: {
      objetivo: initial?.objetivo ?? "",
      fechaInicio: initial?.fechaInicio?.slice(0, 10) ?? nowBuenosAiresISO().slice(0, 10),
      fechaEstimada: initial?.fechaEstimada?.slice(0, 10) ?? "",
      edificio: initial?.edificio ?? "",
      parteComun: initial?.parteComun ?? false,
      dpto: initial?.parteComun ? "" : initial?.dpto ?? "",
      informe: initial?.informe ?? "",
      comentarioEnProceso: initial?.comentarioEnProceso ?? "",
      comentarioRealizado: initial?.comentarioRealizado ?? "",
      proveedor: initial?.proveedor ?? "",
      estado: initial?.estado ?? "Sin asignar",
      presupuesto: initial?.presupuesto,
      prioridad: initial?.prioridad ?? "Media",
    },
  });

  const edificio = watch("edificio");
  const objetivo = watch("objetivo");
  const parteComun = watch("parteComun");
  const dptoActual = watch("dpto");

  const edificiosQ = useEdificios();
  const dptosQ = useDptos(edificio, parteComun);
  const partesComunesQ = usePartesComunes(parteComun);
  const configQ = useConfig();
  const proveedoresQ = useProveedores();
  const config: Configuracion = configQ.data ?? CONFIGURACION_DEFAULT;

  // Al cambiar de edificio o al alternar Parte Común, limpiar la selección previa
  // de dpto/parte común. Se saltea el primer render para no pisar el valor inicial
  // en modo edición.
  const firstDptoReset = useRef(true);
  useEffect(() => {
    if (firstDptoReset.current) {
      firstDptoReset.current = false;
      return;
    }
    setValue("dpto", "");
  }, [edificio, parteComun, setValue]);

  const dptoOptions = useMemo(() => dptosQ.data ?? [], [dptosQ.data]);
  const partesComunesOptions = useMemo(() => partesComunesQ.data ?? [], [partesComunesQ.data]);

  const setFiles = (next: { imagenes: string[]; videos: string[]; documentos: string[] }) => {
    setImagenes(next.imagenes);
    setVideos(next.videos);
    setDocumentos(next.documentos);
  };

  const onSubmit = async (values: TareaFormValues) => {
    setSubmitError(null);
    try {
      const payload = {
        rowId: taskRowId,
        objetivo: values.objetivo,
        fechaInicio: values.fechaInicio,
        fechaEstimada: values.fechaEstimada,
        edificio: values.edificio,
        parteComun: values.parteComun,
        // dpto es obligatorio (validado por el schema): la parte común específica
        // (ej. "Terraza") si parteComun=true, o el dpto elegido si es false.
        dpto: values.dpto?.trim() ?? "",
        informe: values.informe,
        proveedor: values.proveedor,
        estado: values.estado,
        presupuesto: values.presupuesto,
        prioridad: values.prioridad,
        imagenes,
        videos,
        documentos,
      };

      let result: Tarea;
      if (mode === "create") {
        if (!online) {
          // Sin red: encolar localmente. Los archivos no se pueden subir offline,
          // así que solo guardamos lo que ya esté en URLs persistentes (vacío en este caso).
          const localId = nanoid();
          await enqueueTarea({
            ...payload,
            localId,
            pendingSync: true,
            createdAt: new Date().toISOString(),
            retries: 0,
          });
          // Registrar Background Sync para que el SW vacíe la cola al volver la red,
          // aunque la app esté cerrada (Chrome/Android). Safari/iOS hace fallback al reabrir.
          await registerBackgroundSync("sync-tareas");
          router.push("/tareas");
          router.refresh();
          return;
        }
        result = await api.tareas.create(payload);
        setSuccessResult(result);
        setSuccessMsg("Tarea creada exitosamente");
        return;
      } else if (initial) {
        result = await api.tareas.update(initial.rowId, {
          ...payload,
          comentarioEnProceso: values.comentarioEnProceso,
          comentarioRealizado: values.comentarioRealizado,
        });
        setSuccessResult(result);
        setSuccessMsg("Tarea editada exitosamente");
        return;
      } else {
        throw new Error("Falta tarea inicial para modo edit");
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Error al guardar");
    }
  };

  // Al cerrar el modal de éxito: navegar (create) o cerrar la edición (edit).
  const handleSuccessClose = () => {
    const r = successResult;
    setSuccessMsg(null);
    setSuccessResult(null);
    if (!r) return;
    onSubmitSuccess?.(r);
    if (mode === "create") {
      router.push(`/tareas/${encodeURIComponent(r.rowId)}`);
      router.refresh();
    }
  };

  return {
    // react-hook-form
    register,
    control,
    errors,
    isSubmitting,
    submitForm: handleSubmit(onSubmit),
    // valores observados
    edificio,
    objetivo,
    parteComun,
    dptoActual,
    // datos
    edificiosQ,
    dptosQ,
    partesComunesQ,
    proveedoresQ,
    config,
    dptoOptions,
    partesComunesOptions,
    // archivos
    imagenes,
    videos,
    documentos,
    setFiles,
    taskRowId,
    // estado / ui
    online,
    submitError,
    successMsg,
    handleSuccessClose,
    cancel: () => router.back(),
  };
}
