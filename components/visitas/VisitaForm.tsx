"use client";

import { Loader2, Save } from "lucide-react";
import { BLOQUES_VISITA } from "@/lib/visitas-items";
import { SuccessDialog } from "@/components/ui/SuccessDialog";
import { AccionesPdf } from "./AccionesPdf";
import { FotosVisita } from "./FotosVisita";
import { useVisitaForm } from "./hooks/useVisitaForm";
import type { EdificioFicha } from "@/types";

// Card de sección, siempre abierta. El formulario se completa entero caminando el
// edificio: esconder secciones detrás de un chevron obligaba a abrirlas una por una.
function Seccion({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <h3 className="px-4 py-3 text-sm font-medium text-slate-700">{title}</h3>
      <div className="px-4 pb-4">{children}</div>
    </section>
  );
}

type CampoFicha = keyof Omit<EdificioFicha, "edificio" | "actualizadoEn">;

const CAMPOS_FICHA: Array<[CampoFicha, string]> = [
  ["seguroPoliza", "Seguro - Póliza"],
  ["ascensores", "Ascensores"],
  ["fumigacion", "Fumigación"],
  ["empresaMatafuegoVenc", "Empresa Matafuego. Venc."],
  ["encargado", "Encargado"],
  ["calderaTermotanque", "Caldera o Termotanque"],
  ["empresaLimpieza", "Emp. de Limpieza"],
  ["horarioTrabajo", "Horario de trab."],
  ["encargadoLimpiezaHs", "Encargado o limpieza y hs de trab."],
];

export function VisitaForm() {
  const {
    edificio,
    setEdificio,
    edificios,
    ficha,
    setCampoFicha,
    cargandoFicha,
    controles,
    setControl,
    informeGeneral,
    setInformeGeneral,
    fotos,
    setFotos,
    guardar,
    error,
    emitida,
    cerrarEmitida,
  } = useVisitaForm();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        guardar.mutate();
      }}
      className="mx-auto w-full max-w-3xl space-y-3 px-4 py-4 md:px-8 md:py-6"
    >
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Visita / Control</h2>
        <p className="text-sm text-slate-600">
          Al guardar se genera el PDF de la visita y queda archivado en Drive.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <label className="block text-sm">
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
        <p className="mt-2 text-xs text-slate-500">
          La fecha de la visita es la de hoy y la asigna el sistema.
        </p>
      </div>

      {/* Todas las secciones quedan fijas: el parte se completa entero de una pasada. */}
      <Seccion title="Datos del edificio">
        {cargandoFicha && <p className="mb-2 text-sm text-slate-500">Cargando datos…</p>}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {CAMPOS_FICHA.map(([campo, label]) => (
            <label key={campo} className="block text-sm">
              <span className="mb-1 block text-slate-600">{label}</span>
              <input
                type="text"
                value={ficha[campo]}
                onChange={(e) => setCampoFicha(campo, e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-2 py-2"
              />
            </label>
          ))}
        </div>
      </Seccion>

      {BLOQUES_VISITA.map((bloque) => (
        <Seccion key={bloque.titulo} title={bloque.titulo}>
          <ul className="divide-y divide-slate-100">
            {bloque.items.map((item) => (
              <li key={item.clave} className="flex items-center justify-between gap-3 py-2">
                <span className="text-sm text-slate-800">{item.label}</span>
                <div className="flex shrink-0 gap-3">
                  {(["Realizada", "No realizada"] as const).map((valor) => (
                    <label key={valor} className="flex items-center gap-1 text-xs text-slate-600">
                      <input
                        type="radio"
                        name={item.clave}
                        aria-label={valor}
                        checked={controles[item.clave] === valor}
                        onChange={() => setControl(item.clave, valor)}
                      />
                      {valor}
                    </label>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </Seccion>
      ))}

      <Seccion title="Informe general">
        <textarea
          value={informeGeneral}
          onChange={(e) => setInformeGeneral(e.target.value)}
          rows={5}
          className="w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm"
        />
      </Seccion>

      <Seccion title={`Fotos (${fotos.length})`}>
        <FotosVisita edificio={edificio} fotos={fotos} onChange={setFotos} />
      </Seccion>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!edificio || guardar.isPending}
          className="flex items-center gap-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60 disabled:hover:bg-slate-900"
        >
          {guardar.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Guardar y generar PDF
        </button>
      </div>

      {/* El PDF recién emitido a mano: se puede abrir, bajar o mandar sin ir a buscarlo
          al historial. Al cerrar se navega a la pestaña Visitas. */}
      <SuccessDialog
        open={!!emitida}
        message="Visita guardada y PDF generado"
        buttonLabel="Listo"
        onClose={cerrarEmitida}
      >
        {emitida && (
          <AccionesPdf
            pdfUrl={emitida.pdfUrl}
            visitaId={emitida.id}
            titulo={`Visita ${emitida.edificio}`}
          />
        )}
      </SuccessDialog>
    </form>
  );
}
