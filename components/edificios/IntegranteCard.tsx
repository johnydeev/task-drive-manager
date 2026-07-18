"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { displayName } from "@/lib/user-display";
import type { Asignacion, Directiva, Usuario } from "@/types";
import { Trash2, Plus, ClipboardList, Loader2 } from "lucide-react";
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

  const edificiosQ = useQuery({
    queryKey: ["edificios"],
    queryFn: api.edificios.list,
    staleTime: 5 * 60_000,
    enabled: !readOnly,
  });

  const addM = useMutation({
    mutationFn: (edificio: string) => api.asignaciones.add(usuario.email, edificio),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["asignaciones"] });
      setNuevoEdificio("");
    },
  });
  const removeM = useMutation({
    mutationFn: (edificio: string) => api.asignaciones.remove(usuario.email, edificio),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["asignaciones"] }),
  });

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
      <h3 className="font-medium text-slate-900">{displayName(usuario.email, usuarios)}</h3>

      {/* Edificios */}
      <div>
        <p className="text-xs font-medium uppercase text-slate-500">Edificios</p>
        <ul className="mt-1 space-y-1">
          {asignaciones.map((a) => (
            <li key={a.edificio} className="flex items-center justify-between text-sm">
              <span className="text-slate-700">{a.edificio}</span>
              {!readOnly && (
                <button
                  onClick={() => removeM.mutate(a.edificio)}
                  disabled={removeM.isPending && removeM.variables === a.edificio}
                  aria-label={`Quitar ${a.edificio}`}
                  className="text-red-600 disabled:opacity-50"
                >
                  {removeM.isPending && removeM.variables === a.edificio ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Trash2 size={14} />
                  )}
                </button>
              )}
            </li>
          ))}
          {asignaciones.length === 0 && <li className="text-sm text-slate-400">Sin edificios</li>}
        </ul>
        {!readOnly && (
          <div className="mt-2 flex gap-2">
            <select
              value={nuevoEdificio}
              onChange={(e) => setNuevoEdificio(e.target.value)}
              className="input flex-1"
            >
              <option value="">Agregar edificio…</option>
              {edificiosQ.data
                ?.filter((e) => !asignaciones.some((a) => a.edificio === e.nombre))
                .map((e) => (
                  <option key={e.nombre} value={e.nombre}>
                    {e.nombre}
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
        )}
      </div>

      {/* Directivas */}
      <div>
        <p className="text-xs font-medium uppercase text-slate-500">Directivas</p>
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
