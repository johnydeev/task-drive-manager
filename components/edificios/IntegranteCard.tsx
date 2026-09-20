"use client";

import { Combobox } from "@/components/ui/Combobox";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useEdificiosSinAsignar } from "@/hooks/edificios-queries";
import { displayName } from "@/lib/user-display";
import { pendientesDe } from "@/lib/pendientes-por-edificio";
import { cn } from "@/lib/utils";
import type { Asignacion, Directiva, Usuario } from "@/types";
import { X, Plus, ClipboardList, Loader2 } from "lucide-react";
import { DirectivaForm } from "./DirectivaForm";
import { DirectivaItem } from "./DirectivaItem";

interface Props {
  usuario: Usuario;
  usuarios: Usuario[] | undefined;
  asignaciones: Asignacion[];
  directivas: Directiva[];
  readOnly: boolean;
  currentEmail: string;
  isAdmin: boolean;
  // Falso en las tarjetas ajenas de un no-admin: el endpoint no le devuelve esas
  // directivas, así que mostrar el bloque vacío afirmaría algo falso.
  mostrarDirectivas: boolean;
  // Tareas abiertas por consorcio, ya contadas por la vista (clave normalizada).
  pendientes: Map<string, number>;
}

export function IntegranteCard({
  usuario,
  usuarios,
  asignaciones,
  directivas,
  readOnly,
  currentEmail,
  isAdmin,
  mostrarDirectivas,
  pendientes,
}: Props) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [nuevoEdificio, setNuevoEdificio] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  // El dropdown ofrece solo los edificios sin asignar (admin-only, de ahí !readOnly).
  const sinAsignarQ = useEdificiosSinAsignar(!readOnly);

  const invalidarEdificios = () => {
    qc.invalidateQueries({ queryKey: ["asignaciones"] });
    qc.invalidateQueries({ queryKey: ["edificios-sin-asignar"] });
  };

  const addM = useMutation({
    mutationFn: (edificio: string) => api.asignaciones.add(usuario.email, edificio),
    onSuccess: () => {
      invalidarEdificios();
      setNuevoEdificio("");
      setAddError(null);
    },
    onError: (e: Error) => setAddError(e.message),
  });
  const removeM = useMutation({
    mutationFn: (edificio: string) => api.asignaciones.remove(usuario.email, edificio),
    onSuccess: invalidarEdificios,
  });

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
      <h3 className="border-b border-slate-100 pb-2 text-center text-base font-semibold text-slate-900">
        {displayName(usuario.email, usuarios)}
      </h3>

      {/* Edificios */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Edificios</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {asignaciones.map((a) => {
            const n = pendientesDe(pendientes, a.edificio);
            return (
              <span
                key={a.edificio}
                className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3.5 py-1.5 text-sm font-medium text-slate-700"
              >
                {/* El link envuelve nombre + contador para que el número también sea área
                    clickeable. El ✕ queda FUERA del anchor: un <button> dentro de un <a> es
                    HTML inválido y en mobile el tap se pelea entre navegar y quitar. */}
                <Link
                  href={`/tareas?edificio=${encodeURIComponent(a.edificio)}`}
                  aria-label={`${a.edificio} — ${
                    n === 0 ? "sin tareas pendientes" : `${n} ${n === 1 ? "tarea pendiente" : "tareas pendientes"}`
                  }`}
                  className="inline-flex items-center gap-1.5 rounded px-0.5 transition-colors hover:bg-slate-200 hover:text-slate-900"
                >
                  {a.edificio}
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums",
                      n > 0 ? "bg-red-100 text-red-700" : "bg-slate-200 text-slate-500"
                    )}
                  >
                    {n}
                  </span>
                </Link>
                {!readOnly && (
                  <button
                    onClick={() => removeM.mutate(a.edificio)}
                    disabled={removeM.isPending && removeM.variables === a.edificio}
                    aria-label={`Quitar ${a.edificio}`}
                    className="-mr-1 ml-0.5 text-slate-400 hover:text-red-600 disabled:opacity-50"
                  >
                    {removeM.isPending && removeM.variables === a.edificio ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <X size={14} />
                    )}
                  </button>
                )}
              </span>
            );
          })}
          {asignaciones.length === 0 && <span className="text-sm text-slate-400">Sin edificios</span>}
        </div>
        {!readOnly && (
          <>
            <div className="mt-2 flex gap-2">
              <div className="flex-1">
                <Combobox
                  strict
                  value={nuevoEdificio}
                  onChange={setNuevoEdificio}
                  options={sinAsignarQ.data ?? []}
                  placeholder="Agregar edificio…"
                  aria-label="Edificio a agregar"
                />
              </div>
              <button
                disabled={!nuevoEdificio || addM.isPending}
                onClick={() => addM.mutate(nuevoEdificio)}
                aria-label="Agregar edificio"
                className="rounded-lg bg-slate-900 px-3 text-sm text-white transition-colors hover:bg-slate-700 disabled:opacity-50 disabled:hover:bg-slate-900"
              >
                {addM.isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              </button>
            </div>
            {addError && <p className="mt-1 text-xs text-red-600">{addError}</p>}
          </>
        )}
      </div>

      {/* Directivas — solo en la tarjeta propia, o para el admin. */}
      {mostrarDirectivas && (
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Directivas</p>
        <ul className="mt-1 space-y-1.5">
          {directivas.map((d) => (
            <DirectivaItem
              key={d.id}
              d={d}
              puedeOperar={usuario.email.toLowerCase() === currentEmail.toLowerCase()}
              esAdmin={isAdmin}
            />
          ))}
          {directivas.length === 0 && <li className="text-sm text-slate-400">Sin directivas</li>}
        </ul>
        {!readOnly && (
          <button
            onClick={() => setShowForm((s) => !s)}
            className="mt-2 flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 transition-colors hover:bg-slate-100"
          >
            <ClipboardList size={14} /> Asignar directiva
          </button>
        )}
        {showForm && !readOnly && (
          <DirectivaForm
            asignadoA={usuario.email}
            onDone={() => {
              setShowForm(false);
              qc.invalidateQueries({ queryKey: ["directivas"] });
            }}
          />
        )}
      </div>
      )}
    </div>
  );
}
