"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  comentarioMasReciente,
  ETIQUETA_COMENTARIO,
  type GrupoInforme,
  type GrupoTareas,
} from "@/lib/informes";

// Mismos fondos que el PDF, replicando la planilla original.
const FONDO_GRUPO: Record<GrupoInforme, string> = {
  Pendientes: "bg-red-50",
  "En Proceso": "bg-yellow-50",
  Realizadas: "bg-green-50",
};

export function TablaGrupo({ grupo, tareas }: GrupoTareas) {
  if (tareas.length === 0) return null;

  return (
    <section className="mt-4">
      <h4 className="text-sm font-semibold text-slate-900">
        {grupo} ({tareas.length})
      </h4>
      <div className="mt-1.5 overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th className="px-3 py-2 font-semibold">Dpto</th>
              <th className="px-3 py-2 font-semibold">Prioridad</th>
              <th className="px-3 py-2 font-semibold">Informe</th>
              <th className="px-3 py-2 font-semibold">Comentario</th>
              <th className="px-3 py-2 font-semibold">Estado</th>
            </tr>
          </thead>
          <tbody>
            {tareas.map((t) => {
              const comentario = comentarioMasReciente(t);
              return (
                <tr key={t.rowId} className={cn("border-t border-slate-200", FONDO_GRUPO[grupo])}>
                  <td className="px-3 py-2 font-medium text-slate-900">
                    <Link
                      href={`/tareas/${encodeURIComponent(t.rowId)}`}
                      className="hover:underline"
                    >
                      {t.dpto || "—"}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{t.prioridad}</td>
                  <td className="px-3 py-2">{t.informe || "—"}</td>
                  <td className="px-3 py-2">
                    {comentario.origen ? (
                      <>
                        <span className="text-slate-500">
                          {ETIQUETA_COMENTARIO[comentario.origen]}:{" "}
                        </span>
                        {comentario.texto}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2">{t.estado}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
