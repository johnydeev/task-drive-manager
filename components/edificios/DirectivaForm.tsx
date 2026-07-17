"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { Loader2 } from "lucide-react";

// Form contextual para crear/asignar una directiva a un integrante (asignadoA ya fijado
// por la tarjeta desde la que se abre).
export function DirectivaForm({ asignadoA, onDone }: { asignadoA: string; onDone: () => void }) {
  const [descripcion, setDescripcion] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);

  const createM = useMutation({
    mutationFn: () => api.directivas.create({ descripcion, fecha, asignadoA }),
    onSuccess: onDone,
    onError: (e) => setError(e instanceof Error ? e.message : "Error al crear"),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!descripcion.trim()) {
          setError("Descripción requerida");
          return;
        }
        setError(null);
        createM.mutate();
      }}
      className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3"
    >
      <textarea
        value={descripcion}
        onChange={(e) => setDescripcion(e.target.value)}
        rows={2}
        placeholder="Indicación (ej. Visitar edificio X y crear tareas pendientes)"
        className="input w-full"
      />
      <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="input w-full" />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={createM.isPending}
          className="flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {createM.isPending && <Loader2 size={14} className="animate-spin" />} Asignar
        </button>
      </div>
    </form>
  );
}
