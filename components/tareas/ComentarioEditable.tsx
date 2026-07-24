"use client";

import { useState } from "react";
import { Edit3, Loader2 } from "lucide-react";

// Bloque de comentario del detalle de tarea. En solo lectura muestra subtítulo + texto;
// si es editable, un botón chico de lápiz despliega un textarea inline con Guardar/Cancelar.
// El permiso (solo el asignado, tarea activa) lo decide el padre vía `editable`.
export function ComentarioEditable({
  label,
  fecha,
  valor,
  editable,
  saving,
  onSave,
}: {
  label: string;
  fecha?: string;
  valor: string;
  editable: boolean;
  saving: boolean;
  onSave: (texto: string) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(valor);

  const abrir = () => {
    setTexto(valor);
    setEditando(true);
  };

  const guardar = () => {
    onSave(texto.trim());
    setEditando(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-500">
          {label}
          {fecha ? ` - ${fecha}` : ""}
        </p>
        {editable && !editando && (
          <button
            type="button"
            onClick={abrir}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"
            aria-label={`Editar comentario ${label}`}
          >
            <Edit3 size={13} /> Editar
          </button>
        )}
      </div>

      {editando ? (
        <div className="mt-1">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={3}
            className="input w-full"
          />
          <div className="mt-1 flex gap-2">
            <button
              type="button"
              onClick={guardar}
              disabled={saving}
              className="flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50 disabled:hover:bg-slate-900"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              Guardar
            </button>
            <button
              type="button"
              onClick={() => setEditando(false)}
              disabled={saving}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-700 whitespace-pre-wrap">{valor}</p>
      )}
    </div>
  );
}
