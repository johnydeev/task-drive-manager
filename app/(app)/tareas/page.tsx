"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { ORDENES, type OrdenTareas } from "@/lib/tareas-orden";
import { cn, formatFecha } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Combobox } from "@/components/ui/Combobox";
import { useToast } from "@/components/ui/Toaster";
import { PendientesDeSubir } from "@/components/tareas/PendientesDeSubir";
import { BannerAvisos } from "@/components/tareas/BannerAvisos";
import { useListaTareas } from "@/components/tareas/hooks/useListaTareas";
import type { EstadoTarea, Prioridad, Tarea } from "@/types";
import { Plus, Filter, Trash2, Check, Search } from "lucide-react";

const ESTADOS: (EstadoTarea | "Todos")[] = [
  "Todos", "Sin asignar", "Asignada", "Aceptada", "En Proceso", "En Revisión", "Objetada", "Realizada",
];
const PRIORIDADES: (Prioridad | "Todas")[] = ["Todas", "Alta", "Media", "Baja"];

const estadoBadge: Record<EstadoTarea, string> = {
  "Sin asignar": "bg-slate-100 text-slate-700 border-slate-200",
  Asignada: "bg-amber-100 text-amber-800 border-amber-200",
  Aceptada: "bg-indigo-100 text-indigo-800 border-indigo-200",
  "En Proceso": "bg-blue-100 text-blue-800 border-blue-200",
  "En Revisión": "bg-purple-100 text-purple-800 border-purple-200",
  Objetada: "bg-red-100 text-red-800 border-red-200",
  Realizada: "bg-green-100 text-green-800 border-green-200",
};

const prioridadBadge: Record<Prioridad, string> = {
  Alta: "bg-red-100 text-red-800 border-red-200",
  Media: "bg-amber-100 text-amber-800 border-amber-200",
  Baja: "bg-slate-100 text-slate-700 border-slate-200",
};

export default function TareasPage() {
  // Filtros (persistidos en la URL), búsqueda y orden: todo en el hook; acá solo JSX.
  const { filtros, setFiltro, tareas, tareasQ, edificiosQ, hayFiltrosAvanzados, isAdmin } =
    useListaTareas();
  const [showFilters, setShowFilters] = useState(hayFiltrosAvanzados);

  const qc = useQueryClient();
  const toast = useToast();
  const [toDelete, setToDelete] = useState<Tarea | null>(null);

  const eliminar = useMutation({
    mutationFn: (rowId: string) => api.tareas.remove(rowId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tareas"] });
      setToDelete(null);
      toast.success("Tarea eliminada");
    },
  });

  // Borrar es solo del admin (el server lo valida igual). Sin sesión (demo) es permisivo.

  return (
    <div className="px-4 py-4 md:px-8 md:py-6 max-w-5xl mx-auto w-full">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Tareas</h2>
          <p className="text-sm text-slate-600">
            {tareasQ.data ? `${tareas.length} resultado${tareas.length !== 1 ? "s" : ""}` : "Cargando…"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters((s) => !s)}
            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            <Filter size={16} /> Filtros
          </button>
          <Link
            href="/tareas/nueva"
            className="hidden md:flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            <Plus size={16} /> Nueva
          </Link>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2 md:flex-row">
        <div className="relative flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="search"
            aria-label="Buscar tareas"
            placeholder="Buscar por objetivo, edificio, dpto…"
            value={filtros.q}
            onChange={(e) => setFiltro("q", e.target.value)}
            className="input pl-9"
          />
        </div>
        <select
          aria-label="Ordenar por"
          value={filtros.orden}
          onChange={(e) => setFiltro("orden", e.target.value as OrdenTareas)}
          className="input md:w-48"
        >
          {ORDENES.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={() => setFiltro("mias", !filtros.mias)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition",
            filtros.mias
              ? "border-slate-900 bg-slate-900 text-white"
              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          )}
        >
          Mis tareas asignadas
        </button>
        {isAdmin && (
          <button
            onClick={() => setFiltro("sinAsignar", !filtros.sinAsignar)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition",
              filtros.sinAsignar
                ? "border-red-500 bg-red-500 text-white"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            )}
          >
            Sin asignar
          </button>
        )}
      </div>

      {/* Cola offline: fuera de los filtros, desaparece sola al sincronizar. */}
      <PendientesDeSubir />
      <BannerAvisos />

      {showFilters && (
        <div className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-3">
          <div className="text-sm">
            <label htmlFor="filtro-edificio" className="block text-slate-600 mb-1">Edificio</label>
            <Combobox
              strict
              id="filtro-edificio"
              value={filtros.edificio}
              onChange={(v) => setFiltro("edificio", v)}
              options={(edificiosQ.data ?? []).map((e) => e.nombre)}
              placeholder="Todos"
            />
          </div>
          <label className="text-sm">
            <span className="block text-slate-600 mb-1">Estado</span>
            <select
              value={filtros.estado || "Todos"}
              onChange={(e) =>
                setFiltro("estado", e.target.value === "Todos" ? "" : (e.target.value as EstadoTarea))
              }
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-2"
            >
              {ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-slate-600 mb-1">Prioridad</span>
            <select
              value={filtros.prioridad || "Todas"}
              onChange={(e) =>
                setFiltro("prioridad", e.target.value === "Todas" ? "" : (e.target.value as Prioridad))
              }
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-2"
            >
              {PRIORIDADES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
        </div>
      )}

      {tareasQ.isError && (
        <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          No se pudieron cargar las tareas.
        </div>
      )}

      <ul className="mt-4 space-y-2">
        {tareas.map((t) => (
          <li
            key={t.rowId}
            className="relative rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition"
          >
            <Link
              href={`/tareas/${encodeURIComponent(t.rowId)}`}
              className="block p-4 pr-12"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium text-slate-900 truncate">{t.objetivo || "(sin objetivo)"}</h3>
                  <p className="mt-0.5 text-sm text-slate-600 truncate">
                    {t.edificio} · {t.dpto || "Sin especificar"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Inicio {formatFecha(t.fechaInicio)}
                    {t.fechaEstimada ? ` · Estimada ${formatFecha(t.fechaEstimada)}` : ""}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <div className="flex items-center gap-1">
                    {t.estado === "Realizada" && (
                      <Check size={14} className="text-green-600" aria-label="realizada" />
                    )}
                    <span className={cn("rounded-full border px-2 py-0.5 text-xs", estadoBadge[t.estado])}>
                      {t.estado}
                    </span>
                  </div>
                  <span className={cn("rounded-full border px-2 py-0.5 text-xs", prioridadBadge[t.prioridad])}>
                    {t.prioridad}
                  </span>
                </div>
              </div>
            </Link>
            {isAdmin && (
              <button
                onClick={() => setToDelete(t)}
                aria-label="Eliminar tarea"
                className="absolute right-3 top-3 z-10 rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 size={16} />
              </button>
            )}
          </li>
        ))}
        {tareasQ.data && tareas.length === 0 && (
          <li className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            {filtros.q ? `No hay tareas que coincidan con "${filtros.q}"` : "No hay tareas con esos filtros."}
          </li>
        )}
      </ul>

      <ConfirmDialog
        open={!!toDelete}
        title="Eliminar tarea"
        message={`Se va a eliminar "${toDelete?.objetivo || "esta tarea"}" y su carpeta de Drive se moverá a la papelera (recuperable). ¿Confirmás?`}
        loading={eliminar.isPending}
        onConfirm={() => toDelete && eliminar.mutate(toDelete.rowId)}
        onCancel={() => setToDelete(null)}
      />

    </div>
  );
}
