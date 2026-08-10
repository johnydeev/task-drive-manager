"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { InformeEdificio } from "@/components/informes/InformeEdificio";
import { PanelVisitas } from "@/components/visitas/PanelVisitas";

type Tab = "tareas" | "visitas";

const TABS: Array<[Tab, string]> = [
  ["tareas", "Tareas"],
  ["visitas", "Visitas"],
];

export default function InformesPage() {
  // `?tab=visitas` abre directo en Visitas: es a donde vuelve el formulario después de
  // guardar una visita. El grupo (app) es force-dynamic, así que useSearchParams no
  // necesita Suspense acá.
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(
    searchParams.get("tab") === "visitas" ? "visitas" : "tareas"
  );

  return (
    <div>
      <div className="border-b border-slate-200 bg-white px-4 md:px-8">
        <div className="mx-auto flex w-full max-w-5xl gap-1">
          {TABS.map(([valor, label]) => (
            <button
              key={valor}
              type="button"
              onClick={() => setTab(valor)}
              className={cn(
                "-mb-px border-b-2 px-4 py-3 text-sm font-medium transition",
                tab === valor
                  ? "border-slate-900 text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === "tareas" ? (
        <InformeEdificio />
      ) : (
        <div className="mx-auto w-full max-w-5xl px-4 py-4 md:px-8 md:py-6">
          <h2 className="text-xl font-semibold text-slate-900">Visitas</h2>
          <PanelVisitas />
        </div>
      )}
    </div>
  );
}
