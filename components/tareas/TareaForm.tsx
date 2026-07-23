"use client";

import { Controller } from "react-hook-form";
import type { Tarea } from "@/types";
import { FileUploader } from "./FileUploader";
import { Combobox } from "@/components/ui/Combobox";
import { SuccessDialog } from "@/components/ui/SuccessDialog";
import { Loader2, CloudOff, Plus } from "lucide-react";
import { useTareaForm } from "./hooks/useTareaForm";

interface Props {
  mode: "create" | "edit";
  initial?: Tarea;
  onSubmitSuccess?: (tarea: Tarea) => void;
}

export function TareaForm({ mode, initial, onSubmitSuccess }: Props) {
  const f = useTareaForm({ mode, initial, onSubmitSuccess });

  return (
    <>
    <SuccessDialog open={!!f.successMsg} message={f.successMsg ?? ""} onClose={f.handleSuccessClose} />
    <form onSubmit={f.submitForm} className="space-y-4">
      {!f.online && mode === "create" && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <CloudOff size={16} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Estás sin conexión.</p>
            <p className="text-xs">
              La tarea se guardará localmente y se sincronizará automáticamente al recuperar la red. Los archivos
              adjuntos requieren conexión.
            </p>
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Objetivo" error={f.errors.objetivo?.message}>
          <input
            {...f.register("objetivo")}
            placeholder="Ej: Pintura exterior"
            className="input"
          />
        </Field>
        <Field label="Edificio" error={f.errors.edificio?.message}>
          <select {...f.register("edificio")} className="input">
            <option value="">Seleccionar…</option>
            {f.edificiosQ.data?.map((e) => (
              <option key={e.nombre} value={e.nombre}>
                {e.nombre}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
        <Controller
          control={f.control}
          name="parteComun"
          render={({ field }) => (
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={field.value}
                onChange={(e) => field.onChange(e.target.checked)}
                className="h-4 w-4"
              />
              <span className="text-sm">Parte común del edificio</span>
            </label>
          )}
        />
      </div>

      {!f.parteComun ? (
        <Field label="Dpto" error={f.errors.dpto?.message}>
          <select {...f.register("dpto")} className="input" disabled={!f.edificio || f.dptosQ.isLoading}>
            <option value="">
              {f.dptosQ.isLoading ? "Cargando…" : f.edificio ? "Seleccionar dpto" : "Elegí un edificio primero"}
            </option>
            {f.dptoOptions.map((d) => (
              <option key={d.idDpto} value={d.dpto}>
                {d.dpto}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <Field label="Parte común" error={f.errors.dpto?.message}>
          <div className="flex gap-2">
            <select {...f.register("dpto")} className="input flex-1" disabled={f.partesComunesQ.isLoading}>
              <option value="">
                {f.partesComunesQ.isLoading ? "Cargando…" : "Seleccionar parte común"}
              </option>
              {f.partesComunesOptions.map((nombre) => (
                <option key={nombre} value={nombre}>
                  {nombre}
                </option>
              ))}
            </select>
            {f.isAdmin && (
              <button
                type="button"
                onClick={() => f.setShowAddParte((s) => !s)}
                aria-label="Agregar parte común"
                className="rounded-lg border border-slate-300 bg-white px-3 text-slate-700 hover:bg-slate-50"
              >
                <Plus size={16} />
              </button>
            )}
          </div>
          {f.isAdmin && f.showAddParte && (
            <div className="mt-2 flex gap-2">
              <input
                value={f.nuevaParteComun}
                onChange={(e) => f.setNuevaParteComun(e.target.value)}
                placeholder="Ej: TERRAZA"
                className="input flex-1"
              />
              <button
                type="button"
                disabled={!f.nuevaParteComun.trim() || f.addParteComun.isPending}
                onClick={() => f.addParteComun.mutate(f.nuevaParteComun)}
                className="flex items-center gap-1 rounded-lg bg-slate-900 px-3 text-sm text-white disabled:opacity-50"
              >
                {f.addParteComun.isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                Agregar
              </button>
            </div>
          )}
          {f.addParteComun.isError && (
            <p className="mt-1 text-xs text-red-600">{f.addParteComun.error?.message}</p>
          )}
        </Field>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Fecha de inicio" error={f.errors.fechaInicio?.message}>
          <input type="date" {...f.register("fechaInicio")} className="input" />
        </Field>
        <Field label="Fecha estimada" error={f.errors.fechaEstimada?.message}>
          <input type="date" {...f.register("fechaEstimada")} className="input" />
        </Field>
      </div>

      <Field label="Informe / Descripción del trabajo" error={f.errors.informe?.message}>
        <textarea {...f.register("informe")} rows={3} className="input" />
      </Field>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Prioridad">
          <select {...f.register("prioridad")} className="input">
            <option>Alta</option>
            <option>Media</option>
            <option>Baja</option>
          </select>
        </Field>
        <Field label="Presupuesto (ARS)">
          <input
            type="number"
            min={0}
            step="0.01"
            {...f.register("presupuesto", {
              setValueAs: (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
            })}
            className="input"
          />
        </Field>
      </div>

      <Field label="Proveedor">
        <Controller
          control={f.control}
          name="proveedor"
          render={({ field }) => (
            <Combobox
              value={field.value ?? ""}
              onChange={field.onChange}
              options={f.proveedoresQ.data ?? []}
              placeholder="Elegí de la lista o escribí uno nuevo"
            />
          )}
        />
      </Field>

      {mode === "edit" && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Comentario en proceso">
            <textarea {...f.register("comentarioEnProceso")} rows={2} className="input" />
          </Field>
          <Field label="Comentario realizado">
            <textarea {...f.register("comentarioRealizado")} rows={2} className="input" />
          </Field>
        </div>
      )}

      <div>
        <p className="mb-2 text-sm font-medium text-slate-700">Archivos adjuntos</p>
        <FileUploader
          edificio={f.edificio}
          objetivo={f.objetivo}
          dpto={f.dptoActual ?? ""}
          rowId={f.taskRowId}
          config={f.config}
          imagenes={f.imagenes}
          videos={f.videos}
          documentos={f.documentos}
          disabled={!f.online}
          onChange={f.setFiles}
        />
      </div>

      {f.submitError && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{f.submitError}</div>
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={f.cancel}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={f.isSubmitting}
          className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {f.isSubmitting && <Loader2 size={16} className="animate-spin" />}
          {mode === "create" ? "Crear tarea" : "Guardar cambios"}
        </button>
      </div>
    </form>
    </>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-slate-600">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}
