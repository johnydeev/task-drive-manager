"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useEdificiosSinAsignar } from "@/hooks/edificios-queries";
import { displayName } from "@/lib/user-display";
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
}

export function IntegranteCard({
  usuario,
  usuarios,
  asignaciones,
  directivas,
  readOnly,
  currentEmail,
  isAdmin,
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
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {asignaciones.map((a) => (
            <span
              key={a.edificio}
              className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
            >
              {a.edificio}
              {!readOnly && (
                <button
                  onClick={() => removeM.mutate(a.edificio)}
                  disabled={removeM.isPending && removeM.variables === a.edificio}
                  aria-label={`Quitar ${a.edificio}`}
                  className="-mr-0.5 ml-0.5 text-slate-400 hover:text-red-600 disabled:opacity-50"
                >
                  {removeM.isPending && removeM.variables === a.edificio ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <X size={12} />
                  )}
                </button>
              )}
            </span>
          ))}
          {asignaciones.length === 0 && <span className="text-sm text-slate-400">Sin edificios</span>}
        </div>
        {!readOnly && (
          <>
            <div className="mt-2 flex gap-2">
              <select
                value={nuevoEdificio}
                onChange={(e) => setNuevoEdificio(e.target.value)}
                className="input flex-1"
              >
                <option value="">Agregar edificio…</option>
                {(sinAsignarQ.data ?? []).map((nombre) => (
                  <option key={nombre} value={nombre}>
                    {nombre}
                  </option>
                ))}
              </select>
              <button
                disabled={!nuevoEdificio || addM.isPending}
                onClick={() => addM.mutate(nuevoEdificio)}
                aria-label="Agregar edificio"
                className="rounded-lg bg-slate-900 px-3 text-sm text-white disabled:opacity-50"
              >
                {addM.isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              </button>
            </div>
            {addError && <p className="mt-1 text-xs text-red-600">{addError}</p>}
          </>
        )}
      </div>

      {/* Directivas */}
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
            className="mt-2 flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700"
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
    </div>
  );
}
