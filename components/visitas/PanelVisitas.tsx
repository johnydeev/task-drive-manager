"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Loader2, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { resumenPorEdificio } from "@/lib/visitas-panel";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { Visita } from "@/types";

const fmt = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

export function PanelVisitas() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.rol === "admin";
  const qc = useQueryClient();
  const [elegido, setElegido] = useState<string | null>(null);
  const [aBorrar, setABorrar] = useState<Visita | null>(null);

  const edificiosQ = useQuery({
    queryKey: ["edificios"],
    queryFn: api.edificios.list,
    staleTime: 5 * 60_000,
  });
  const visitasQ = useQuery({ queryKey: ["visitas"], queryFn: () => api.visitas.list() });

  const resumen = useMemo(
    () => resumenPorEdificio(edificiosQ.data ?? [], visitasQ.data ?? []),
    [edificiosQ.data, visitasQ.data]
  );

  const historial = useMemo(
    () =>
      (visitasQ.data ?? [])
        .filter((v) => v.edificio === elegido)
        .sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [visitasQ.data, elegido]
  );

  const eliminar = useMutation({
    mutationFn: (id: string) => api.visitas.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["visitas"] });
      setABorrar(null);
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          Última visita de cada consorcio. Tocá uno para ver su historial.
        </p>
        <Link
          href="/visitas/nueva"
          className="flex shrink-0 items-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          <Plus size={16} /> Nueva visita
        </Link>
      </div>

      <ul className="mt-4 space-y-2">
        {resumen.map((r) => (
          <li key={r.edificio}>
            <button
              type="button"
              onClick={() => setElegido(elegido === r.edificio ? null : r.edificio)}
              className={cn(
                "flex w-full items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3 text-left transition",
                r.atrasado ? "border-red-300 bg-red-50" : "border-slate-200 hover:border-slate-300"
              )}
            >
              <span className="min-w-0 flex-1 truncate font-medium text-slate-900">
                {r.edificio}
              </span>
              <span
                className={cn("shrink-0 text-sm", r.atrasado ? "text-red-700" : "text-slate-600")}
              >
                {r.ultima
                  ? `${fmt(r.ultima.fecha)} · hace ${r.dias} día${r.dias === 1 ? "" : "s"}`
                  : "Sin visitas registradas"}
              </span>
            </button>

            {elegido === r.edificio && (
              <ul className="mt-1 space-y-1 rounded-xl border border-slate-200 bg-slate-50 p-3">
                {historial.length === 0 && (
                  <li className="text-sm text-slate-500">
                    Este consorcio todavía no tiene visitas.
                  </li>
                )}
                {historial.map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-2">
                    <a
                      href={v.pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-slate-800 hover:underline"
                    >
                      <FileText size={14} className="shrink-0 text-slate-500" />
                      {fmt(v.fecha)}
                    </a>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => setABorrar(v)}
                        aria-label="Eliminar visita"
                        className="rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      >
                        {eliminar.isPending && eliminar.variables === v.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Trash2 size={14} />
                        )}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={!!aBorrar}
        title="Eliminar visita"
        message={`Se va a eliminar la visita del ${aBorrar ? fmt(aBorrar.fecha) : ""} y su PDF se moverá a la papelera de Drive (recuperable). ¿Confirmás?`}
        loading={eliminar.isPending}
        onConfirm={() => aBorrar && eliminar.mutate(aBorrar.id)}
        onCancel={() => setABorrar(null)}
      />
    </div>
  );
}
