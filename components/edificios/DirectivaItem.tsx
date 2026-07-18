"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { Directiva } from "@/types";

const badge: Record<string, string> = {
  Asignada: "bg-slate-100 text-slate-700",
  Aceptada: "bg-blue-100 text-blue-800",
  Realizada: "bg-amber-100 text-amber-800",
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

  const m = useMutation({
    mutationFn: (v: { accion: "aceptar" | "cerrar" | "objetar"; nota?: string }) =>
      api.directivas.patch({ id: d.id, accion: v.accion, nota: v.nota }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["directivas"] });
      setModo(null);
      setNota("");
    },
  });

  return (
    <li className="rounded-lg border border-slate-200 p-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-slate-700">
          {d.descripcion} <span className="text-slate-400">({d.fecha})</span>
        </span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${badge[d.estado] ?? ""}`}>{d.estado}</span>
      </div>

      {d.notaObjecion && d.estado === "Aceptada" && (
        <p className="mt-1 text-xs text-red-600">Objetada: {d.notaObjecion}</p>
      )}
      {esAdmin && d.notaCierre && <p className="mt-1 text-xs text-slate-500">Nota de cierre: {d.notaCierre}</p>}

      {puedeOperar && d.estado === "Asignada" && (
        <button
          onClick={() => m.mutate({ accion: "aceptar" })}
          disabled={m.isPending}
          className="mt-2 rounded bg-slate-900 px-2 py-1 text-xs text-white disabled:opacity-50"
        >
          Aceptar
        </button>
      )}
      {puedeOperar && d.estado === "Aceptada" && modo !== "cerrar" && (
        <button
          onClick={() => setModo("cerrar")}
          className="mt-2 rounded border border-slate-300 px-2 py-1 text-xs"
        >
          Cerrar con nota
        </button>
      )}
      {esAdmin && d.estado === "Realizada" && modo !== "objetar" && (
        <button
          onClick={() => setModo("objetar")}
          className="mt-2 rounded border border-red-300 px-2 py-1 text-xs text-red-700"
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
              className="rounded border border-slate-300 px-2 py-1 text-xs"
            >
              Cancelar
            </button>
            <button
              disabled={!nota.trim() || m.isPending}
              onClick={() => m.mutate({ accion: modo, nota })}
              className="rounded bg-slate-900 px-2 py-1 text-xs text-white disabled:opacity-50"
            >
              {modo === "cerrar" ? "Cerrar" : "Objetar"}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
