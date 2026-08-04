"use client";

import { Download, Loader2 } from "lucide-react";
import { useInforme } from "./hooks/useInforme";
import { MembreteHeader } from "./MembreteHeader";
import { TablaGrupo } from "./TablaGrupo";

export function InformeEdificio() {
  const {
    edificio,
    setEdificio,
    desde,
    setDesde,
    hasta,
    setHasta,
    edificios,
    config,
    grupos,
    total,
    cargando,
    error,
    exportar,
    errorExport,
  } = useInforme();

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-4 md:px-8 md:py-6">
      <h2 className="text-xl font-semibold text-slate-900">Informes</h2>
      <p className="text-sm text-slate-600">Informe de tareas por edificio, listo para exportar</p>

      <div className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-4">
        <label className="text-sm md:col-span-2">
          <span className="mb-1 block text-slate-600">Edificio</span>
          <select
            value={edificio}
            onChange={(e) => setEdificio(e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-2 py-2"
          >
            <option value="">Elegí un edificio…</option>
            {edificios.map((e) => (
              <option key={e.nombre} value={e.nombre}>
                {e.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">Desde</span>
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-2 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">Hasta</span>
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-2 py-2"
          />
        </label>
        <div className="flex justify-end md:col-span-4">
          <button
            type="button"
            onClick={() => exportar.mutate()}
            disabled={!edificio || exportar.isPending}
            className="flex items-center gap-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-60 disabled:hover:bg-slate-900"
          >
            {exportar.isPending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Download size={16} />
            )}
            Exportar PDF
          </button>
        </div>
      </div>

      {errorExport && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorExport}
        </div>
      )}

      {!edificio && (
        <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          Elegí un edificio para ver su informe.
        </div>
      )}

      {edificio && error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          No se pudo cargar el informe.
        </div>
      )}

      {edificio && !error && (
        <div className="mt-4">
          <MembreteHeader config={config} edificio={edificio} desde={desde} hasta={hasta} />
          <div className="rounded-b-2xl border border-slate-200 bg-white p-4 md:p-6">
            {cargando && <p className="text-sm text-slate-500">Cargando…</p>}
            {!cargando && total === 0 && (
              <p className="text-sm text-slate-500">
                No hay tareas de este edificio en el período elegido.
              </p>
            )}
            {!cargando &&
              grupos.map((g) => <TablaGrupo key={g.grupo} grupo={g.grupo} tareas={g.tareas} />)}
          </div>
        </div>
      )}
    </div>
  );
}
