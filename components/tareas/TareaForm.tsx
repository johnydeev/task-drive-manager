"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { nanoid } from "nanoid";
import { api } from "@/lib/api-client";
import { CONFIGURACION_DEFAULT, type Configuracion, type Tarea } from "@/types";
import { FileUploader } from "./FileUploader";
import { Loader2, CloudOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import {
  cacheConfig,
  cacheDptos,
  cacheEdificios,
  enqueueTarea,
  readCachedConfig,
  readCachedDptos,
  readCachedEdificios,
} from "@/lib/offline-db";
import { registerBackgroundSync } from "@/lib/background-sync";

// Schema cliente — coincide con tareaNuevaSchema del servidor pero adaptado a form values.
const formSchema = z
  .object({
    objetivo: z.string().min(1, "Requerido"),
    fechaInicio: z.string().min(1, "Requerida"),
    fechaEstimada: z.string().min(1, "Requerida"),
    edificio: z.string().min(1, "Requerido"),
    parteComun: z.boolean(),
    dpto: z.string().optional(),
    informe: z.string().min(1, "Requerido"),
    comentarioEnProceso: z.string().optional(),
    comentarioRealizado: z.string().optional(),
    proveedor: z.string().optional(),
    estado: z.enum(["Pendiente", "En Proceso", "Realizado"]),
    presupuesto: z.number().nonnegative().optional(),
    prioridad: z.enum(["Alta", "Media", "Baja"]),
  })
  .refine((d) => d.parteComun || (d.dpto && d.dpto.trim().length > 0), {
    message: "Dpto es obligatorio cuando Parte Común está desactivado",
    path: ["dpto"],
  });

type FormValues = z.infer<typeof formSchema>;

interface Props {
  mode: "create" | "edit";
  initial?: Tarea;
  onSubmitSuccess?: (tarea: Tarea) => void;
}

export function TareaForm({ mode, initial, onSubmitSuccess }: Props) {
  const router = useRouter();
  const online = useOnlineStatus();
  const [imagenes, setImagenes] = useState<string[]>(initial?.imagenes ?? []);
  const [videos, setVideos] = useState<string[]>(initial?.videos ?? []);
  const [documentos, setDocumentos] = useState<string[]>(initial?.documentos ?? []);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      objetivo: initial?.objetivo ?? "",
      fechaInicio: initial?.fechaInicio?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
      fechaEstimada: initial?.fechaEstimada?.slice(0, 10) ?? "",
      edificio: initial?.edificio ?? "",
      parteComun: initial?.parteComun ?? false,
      dpto: initial?.parteComun ? "" : initial?.dpto ?? "",
      informe: initial?.informe ?? "",
      comentarioEnProceso: initial?.comentarioEnProceso ?? "",
      comentarioRealizado: initial?.comentarioRealizado ?? "",
      proveedor: initial?.proveedor ?? "",
      estado: initial?.estado ?? "Pendiente",
      presupuesto: initial?.presupuesto,
      prioridad: initial?.prioridad ?? "Media",
    },
  });

  const edificio = watch("edificio");
  const objetivo = watch("objetivo");
  const parteComun = watch("parteComun");

  const edificiosQ = useQuery({
    queryKey: ["edificios"],
    queryFn: async () => {
      try {
        const data = await api.edificios.list();
        cacheEdificios(data).catch(() => {});
        return data;
      } catch (err) {
        const cached = await readCachedEdificios();
        if (cached) return cached;
        throw err;
      }
    },
    staleTime: 5 * 60_000,
  });
  const dptosQ = useQuery({
    queryKey: ["dptos", edificio],
    queryFn: async () => {
      try {
        const data = await api.dptos.list(edificio);
        cacheDptos(edificio, data).catch(() => {});
        return data;
      } catch (err) {
        const cached = await readCachedDptos(edificio);
        if (cached) return cached;
        throw err;
      }
    },
    enabled: !!edificio && !parteComun,
    staleTime: 5 * 60_000,
  });
  const configQ = useQuery({
    queryKey: ["configuracion"],
    queryFn: async () => {
      try {
        const data = await api.configuracion.get();
        cacheConfig(data).catch(() => {});
        return data;
      } catch (err) {
        const cached = await readCachedConfig();
        if (cached) return cached;
        throw err;
      }
    },
    staleTime: 5 * 60_000,
  });
  const config: Configuracion = configQ.data ?? CONFIGURACION_DEFAULT;

  // Si el usuario cambia de edificio, limpiar el dpto seleccionado.
  useEffect(() => {
    if (edificio && !parteComun) setValue("dpto", "");
  }, [edificio, parteComun, setValue]);

  const dptoOptions = useMemo(() => dptosQ.data ?? [], [dptosQ.data]);

  const onSubmit = async (values: FormValues) => {
    setSubmitError(null);
    try {
      const payload = {
        objetivo: values.objetivo,
        fechaInicio: values.fechaInicio,
        fechaEstimada: values.fechaEstimada,
        edificio: values.edificio,
        parteComun: values.parteComun,
        dpto: values.parteComun ? "Parte Común" : (values.dpto ?? ""),
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
      } else if (initial) {
        result = await api.tareas.update(initial.rowId, {
          ...payload,
          comentarioEnProceso: values.comentarioEnProceso,
          comentarioRealizado: values.comentarioRealizado,
        });
      } else {
        throw new Error("Falta tarea inicial para modo edit");
      }

      onSubmitSuccess?.(result);
      router.push(`/tareas/${encodeURIComponent(result.rowId)}`);
      router.refresh();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Error al guardar");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {!online && mode === "create" && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <CloudOff size={16} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Estás sin conexión.</p>
            <p className="text-xs">
              La tarea se guardará localmente y se sincronizará automáticamente al recuperar la red. Los archivos
              adjuntos requieren conexión.
            </p>
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Objetivo" error={errors.objetivo?.message}>
          <input
            {...register("objetivo")}
            placeholder="Ej: Pintura exterior"
            className="input"
          />
        </Field>
        <Field label="Edificio" error={errors.edificio?.message}>
          <select {...register("edificio")} className="input">
            <option value="">Seleccionar…</option>
            {edificiosQ.data?.map((e) => (
              <option key={e.nombre} value={e.nombre}>
                {e.nombre}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
        <Controller
          control={control}
          name="parteComun"
          render={({ field }) => (
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={field.value}
                onChange={(e) => field.onChange(e.target.checked)}
                className="h-4 w-4"
              />
              <span className="text-sm">Parte común del edificio</span>
            </label>
          )}
        />
      </div>

      {!parteComun && (
        <Field label="Dpto" error={errors.dpto?.message}>
          <select {...register("dpto")} className="input" disabled={!edificio || dptosQ.isLoading}>
            <option value="">
              {dptosQ.isLoading ? "Cargando…" : edificio ? "Seleccionar dpto" : "Elegí un edificio primero"}
            </option>
            {dptoOptions.map((d) => (
              <option key={d.idDpto} value={d.dpto}>
                {d.dpto}
              </option>
            ))}
          </select>
        </Field>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Fecha de inicio" error={errors.fechaInicio?.message}>
          <input type="date" {...register("fechaInicio")} className="input" />
        </Field>
        <Field label="Fecha estimada" error={errors.fechaEstimada?.message}>
          <input type="date" {...register("fechaEstimada")} className="input" />
        </Field>
      </div>

      <Field label="Informe / Descripción del trabajo" error={errors.informe?.message}>
        <textarea {...register("informe")} rows={3} className="input" />
      </Field>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Field label="Prioridad">
          <select {...register("prioridad")} className="input">
            <option>Alta</option>
            <option>Media</option>
            <option>Baja</option>
          </select>
        </Field>
        <Field label="Estado">
          <select {...register("estado")} className="input">
            <option>Pendiente</option>
            <option>En Proceso</option>
            <option>Realizado</option>
          </select>
        </Field>
        <Field label="Presupuesto (ARS)">
          <input
            type="number"
            min={0}
            step="0.01"
            {...register("presupuesto", {
              setValueAs: (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
            })}
            className="input"
          />
        </Field>
      </div>

      <Field label="Proveedor">
        <input {...register("proveedor")} className="input" />
      </Field>

      {mode === "edit" && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Comentario en proceso">
            <textarea {...register("comentarioEnProceso")} rows={2} className="input" />
          </Field>
          <Field label="Comentario realizado">
            <textarea {...register("comentarioRealizado")} rows={2} className="input" />
          </Field>
        </div>
      )}

      <div>
        <p className="mb-2 text-sm font-medium text-slate-700">Archivos adjuntos</p>
        <FileUploader
          edificio={edificio}
          objetivo={objetivo}
          config={config}
          imagenes={imagenes}
          videos={videos}
          documentos={documentos}
          disabled={!online}
          onChange={({ imagenes: imgs, videos: vids, documentos: docs }) => {
            setImagenes(imgs);
            setVideos(vids);
            setDocumentos(docs);
          }}
        />
      </div>

      {submitError && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{submitError}</div>
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {isSubmitting && <Loader2 size={16} className="animate-spin" />}
          {mode === "create" ? "Crear tarea" : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-slate-600">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}
