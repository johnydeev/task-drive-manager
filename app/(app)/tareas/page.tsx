"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { api } from "@/lib/api-client";
import { cn, formatFecha } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SuccessDialog } from "@/components/ui/SuccessDialog";
import type { EstadoTarea, Prioridad, Tarea, Edificio } from "@/types";
import { Plus, Filter, Trash2 } from "lucide-react";

const ESTADOS: (EstadoTarea | "Todos")[] = [
  "Todos", "Sin asignar", "Asignada", "Aceptada", "En Proceso", "En Revisión", "Realizada",
];
const PRIORIDADES: (Prioridad | "Todas")[] = ["Todas", "Alta", "Media", "Baja"];

const estadoBadge: Record<EstadoTarea, string> = {
  "Sin asignar": "bg-slate-100 text-slate-700 border-slate-200",
  Asignada: "bg-amber-100 text-amber-800 border-amber-200",
  Aceptada: "bg-indigo-100 text-indigo-800 border-indigo-200",
  "En Proceso": "bg-blue-100 text-blue-800 border-blue-200",
  "En Revisión": "bg-purple-100 text-purple-800 border-purple-200",
  Realizada: "bg-green-100 text-green-800 border-green-200",
};

const prioridadBadge: Record<Prioridad, string> = {
  Alta: "bg-red-100 text-red-800 border-red-200",
  Media: "bg-amber-100 text-amber-800 border-amber-200",
  Baja: "bg-slate-100 text-slate-700 border-slate-200",
};

async function fetchTareas(params: URLSearchParams): Promise<Tarea[]> {
  const res = await fetch(`/api/tareas?${params.toString()}`);
  if (!res.ok) throw new Error("Error al cargar tareas");
  return res.json();
}

async function fetchEdificios(): Promise<Edificio[]> {
  const res = await fetch("/api/edificios");
  if (!res.ok) throw new Error("Error al cargar edificios");
  return res.json();
}

export default function TareasPage() {
  const [edificio, setEdificio] = useState<string>("");
  const [estado, setEstado] = useState<EstadoTarea | "Todos">("Todos");
  const [prioridad, setPrioridad] = useState<Prioridad | "Todas">("Todas");
  const [showFilters, setShowFilters] = useState(false);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (edificio) p.set("edificio", edificio);
    if (estado !== "Todos") p.set("estado", estado);
    if (prioridad !== "Todas") p.set("prioridad", prioridad);
    return p;
  }, [edificio, estado, prioridad]);

  const qc = useQueryClient();
  const { data: session } = useSession();
  const [toDelete, setToDelete] = useState<Tarea | null>(null);
  const [deleteDone, setDeleteDone] = useState(false);

  const tareasQ = useQuery({
    queryKey: ["tareas", params.toString()],
    queryFn: () => fetchTareas(params),
  });

  const edificiosQ = useQuery({
    queryKey: ["edificios"],
    queryFn: fetchEdificios,
    staleTime: 5 * 60_000,
  });

  const eliminar = useMutation({
    mutationFn: (rowId: string) => api.tareas.remove(rowId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tareas"] });
      setToDelete(null);
      setDeleteDone(true);
    },
  });

  // Puede eliminar el admin o quien creó la tarea. Sin sesión (demo/carga) es permisivo;
  // el servidor igual valida el permiso.
  const canDelete = (t: Tarea) =>
    !session?.user ||
    session.user.rol === "admin" ||
    session.user.email?.toLowerCase() === t.supervisor?.toLowerCase();

  return (
    <div className="px-4 py-4 md:px-8 md:py-6 max-w-5xl mx-auto w-full">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Tareas</h2>
          <p className="text-sm text-slate-600">
            {tareasQ.data ? `${tareasQ.data.length} resultado${tareasQ.data.length !== 1 ? "s" : ""}` : "Cargando…"}
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

      {showFilters && (
        <div className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-3">
          <label className="text-sm">
            <span className="block text-slate-600 mb-1">Edificio</span>
            <select
              value={edificio}
              onChange={(e) => setEdificio(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-2"
            >
              <option value="">Todos</option>
              {edificiosQ.data?.map((e) => (
                <option key={e.nombre} value={e.nombre}>{e.nombre}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-slate-600 mb-1">Estado</span>
            <select
              value={estado}
              onChange={(e) => setEstado(e.target.value as EstadoTarea | "Todos")}
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-2"
            >
              {ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-slate-600 mb-1">Prioridad</span>
            <select
              value={prioridad}
              onChange={(e) => setPrioridad(e.target.value as Prioridad | "Todas")}
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
        {tareasQ.data?.map((t) => (
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
                    Inicio {formatFecha(t.fechaInicio)} · Estimada {formatFecha(t.fechaEstimada)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className={cn("rounded-full border px-2 py-0.5 text-xs", estadoBadge[t.estado])}>
                    {t.estado}
                  </span>
                  <span className={cn("rounded-full border px-2 py-0.5 text-xs", prioridadBadge[t.prioridad])}>
                    {t.prioridad}
                  </span>
                </div>
              </div>
            </Link>
            {canDelete(t) && (
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
        {tareasQ.data?.length === 0 && !tareasQ.isLoading && (
          <li className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            No hay tareas con esos filtros.
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

      <SuccessDialog
        open={deleteDone}
        message="Tarea eliminada exitosamente"
        onClose={() => setDeleteDone(false)}
      />
    </div>
  );
}
