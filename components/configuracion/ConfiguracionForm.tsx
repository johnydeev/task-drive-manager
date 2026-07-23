"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { CONFIGURACION_DEFAULT, type Configuracion } from "@/types";
import { Loader2, Save } from "lucide-react";

export function ConfiguracionForm() {
  const qc = useQueryClient();
  const cfgQ = useQuery({ queryKey: ["configuracion"], queryFn: api.configuracion.get });
  const [form, setForm] = useState<Configuracion>(CONFIGURACION_DEFAULT);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cfgQ.data) setForm(cfgQ.data);
  }, [cfgQ.data]);

  const updateM = useMutation({
    mutationFn: () => api.configuracion.update(form),
    onSuccess: (data) => {
      qc.setQueryData(["configuracion"], data);
      setSaved(true);
      setError(null);
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Error al guardar"),
  });

  const handleNumber = (key: keyof Configuracion) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    setForm((f) => ({ ...f, [key]: Number.isFinite(v) ? v : 0 }));
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        updateM.mutate();
      }}
      className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 md:p-6"
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Máximo de imágenes por tarea" hint="Mínimo 1">
          <input type="number" min={1} value={form.maxImagenes} onChange={handleNumber("maxImagenes")} className="input" />
        </Field>
        <Field label="Máximo de videos por tarea" hint="Mínimo 0">
          <input type="number" min={0} value={form.maxVideos} onChange={handleNumber("maxVideos")} className="input" />
        </Field>
        <Field label="Peso máximo por imagen (MB)">
          <input type="number" min={1} step="0.1" value={form.maxSizeImagenMB} onChange={handleNumber("maxSizeImagenMB")} className="input" />
        </Field>
        <Field label="Peso máximo por video (MB)">
          <input type="number" min={1} step="1" value={form.maxSizeVideoMB} onChange={handleNumber("maxSizeVideoMB")} className="input" />
        </Field>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="flex items-center justify-between">
        {saved ? (
          <span className="text-sm text-emerald-700">Guardado ✓</span>
        ) : (
          <span className="text-xs text-slate-500">Cambios se aplican inmediatamente.</span>
        )}
        <button
          type="submit"
          disabled={updateM.isPending}
          className="flex items-center gap-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-60 disabled:hover:bg-slate-900"
        >
          {updateM.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Guardar
        </button>
      </div>
    </form>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-slate-700 font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}
