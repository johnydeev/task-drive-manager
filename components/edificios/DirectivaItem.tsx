"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { Directiva } from "@/types";
import { Trash2, Loader2, Check } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

// Convención: todo lo hecho va en verde. `Realizada` usa el mismo verde que las
// tareas; `Cerrada` (cierre definitivo tras las 72 h) va en un verde más oscuro.
const badge: Record<string, string> = {
  Asignada: "bg-slate-100 text-slate-700",
  Aceptada: "bg-blue-100 text-blue-800",
  Realizada: "bg-green-100 text-green-800",
  Cerrada: "bg-emerald-100 text-emerald-800",
};

export function DirectivaItem({
  d,
  puedeOperar,
  esAdmin,
}: {
  d: Directiva;
  puedeOperar: boolean;
  esAdmin: boolean;
}) {
  const qc = useQueryClient();
  const [nota, setNota] = useState("");
  const [modo, setModo] = useState<null | "cerrar" | "objetar">(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const m = useMutation({
    mutationFn: (v: { accion: "aceptar" | "cerrar" | "objetar"; nota?: string }) =>
      api.directivas.patch({ id: d.id, accion: v.accion, nota: v.nota }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["directivas"] });
      setModo(null);
      setNota("");
    },
  });

  const eliminar = useMutation({
    mutationFn: () => api.directivas.remove(d.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["directivas"] });
      setConfirmOpen(false);
    },
  });

  return (
    <li className="rounded-lg border border-slate-200 p-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-slate-700">
          {(d.estado === "Realizada" || d.estado === "Cerrada") && (
            <Check size={14} className="mr-1 inline text-green-600" aria-label="realizada" />
          )}
          {d.descripcion} <span className="text-slate-400">({d.fecha})</span>
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs ${badge[d.estado] ?? ""}`}>{d.estado}</span>
          {esAdmin && (
            <button
              onClick={() => setConfirmOpen(true)}
              aria-label="Eliminar directiva"
              className="text-slate-400 hover:text-red-600"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {d.notaObjecion && d.estado === "Aceptada" && (
        <p className="mt-1 text-xs text-red-600">Objetada: {d.notaObjecion}</p>
      )}
      {esAdmin && d.notaCierre && <p className="mt-1 text-xs text-slate-500">Nota de cierre: {d.notaCierre}</p>}

      {puedeOperar && d.estado === "Asignada" && (
        <button
          onClick={() => m.mutate({ accion: "aceptar" })}
          disabled={m.isPending}
          className="mt-2 flex items-center gap-1 rounded bg-slate-900 px-2 py-1 text-xs text-white transition-colors hover:bg-slate-700 disabled:opacity-50 disabled:hover:bg-slate-900"
        >
          {m.isPending && <Loader2 size={12} className="animate-spin" />}
          Aceptar
        </button>
      )}
      {puedeOperar && d.estado === "Aceptada" && modo !== "cerrar" && (
        <button
          onClick={() => setModo("cerrar")}
          className="mt-2 rounded border border-slate-300 bg-white px-2 py-1 text-xs transition-colors hover:bg-slate-100"
        >
          Cerrar con nota
        </button>
      )}
      {esAdmin && d.estado === "Realizada" && modo !== "objetar" && (
        <button
          onClick={() => setModo("objetar")}
          className="mt-2 rounded border border-red-300 bg-white px-2 py-1 text-xs text-red-700 transition-colors hover:bg-red-50"
        >
          Objetar
        </button>
      )}

      {modo && (
        <div className="mt-2 space-y-1">
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            rows={2}
            placeholder={modo === "cerrar" ? "Nota de cierre" : "Motivo de la objeción"}
            className="input w-full"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setModo(null);
                setNota("");
              }}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs transition-colors hover:bg-slate-100"
            >
              Cancelar
            </button>
            <button
              disabled={!nota.trim() || m.isPending}
              onClick={() => m.mutate({ accion: modo, nota })}
              className="flex items-center gap-1 rounded bg-slate-900 px-2 py-1 text-xs text-white transition-colors hover:bg-slate-700 disabled:opacity-50 disabled:hover:bg-slate-900"
            >
              {m.isPending && <Loader2 size={12} className="animate-spin" />}
              {modo === "cerrar" ? "Cerrar" : "Objetar"}
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Eliminar directiva"
        message={`Se va a eliminar la directiva "${d.descripcion}". Esta acción no se puede deshacer. ¿Confirmás?`}
        loading={eliminar.isPending}
        onConfirm={() => eliminar.mutate()}
        onCancel={() => setConfirmOpen(false)}
      />
    </li>
  );
}
