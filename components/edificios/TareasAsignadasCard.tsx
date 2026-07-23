"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { EstadoTarea, Tarea } from "@/types";

const estadoBadge: Record<EstadoTarea, string> = {
  "Sin asignar": "bg-slate-100 text-slate-700",
  Asignada: "bg-amber-100 text-amber-800",
  Aceptada: "bg-indigo-100 text-indigo-800",
  "En Proceso": "bg-blue-100 text-blue-800",
  "En Revisión": "bg-purple-100 text-purple-800",
  Objetada: "bg-red-100 text-red-800",
  Realizada: "bg-green-100 text-green-800",
};

// Tarjeta con las tareas asignadas a un integrante, agrupadas en En curso / Realizadas.
export function TareasAsignadasCard({ tareas }: { tareas: Tarea[] }) {
  if (tareas.length === 0) return null;
  const enCurso = tareas.filter((t) => t.estado !== "Realizada");
  const realizadas = tareas.filter((t) => t.estado === "Realizada");

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-center text-xs font-semibold uppercase tracking-wide text-slate-400">Tareas asignadas</p>
      {enCurso.length > 0 && <Grupo titulo="En curso" tareas={enCurso} />}
      {realizadas.length > 0 && <Grupo titulo="Realizadas" tareas={realizadas} />}
    </div>
  );
}

function Grupo({ titulo, tareas }: { titulo: string; tareas: Tarea[] }) {
  return (
    <div className="mt-2">
      <p className="text-xs font-medium text-slate-500">{titulo}</p>
      <ul className="mt-1 space-y-1">
        {tareas.map((t) => (
          <li key={t.rowId}>
            <Link
              href={`/tareas/${encodeURIComponent(t.rowId)}`}
              className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm hover:bg-slate-50"
            >
              <span className="min-w-0 flex-1 truncate text-slate-700">
                {t.objetivo || "(sin objetivo)"} <span className="text-slate-400">· {t.edificio}</span>
              </span>
              <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs", estadoBadge[t.estado])}>{t.estado}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
