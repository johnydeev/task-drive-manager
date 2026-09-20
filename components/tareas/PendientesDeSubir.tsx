"use client";

import { useState } from "react";
import { Loader2, CloudOff, RefreshCw, Trash2 } from "lucide-react";
import { usePendingTareas } from "@/hooks/usePendingTareas";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { syncPendingTareas } from "@/lib/offline-sync";
import { descartarPendiente, reintentarPendiente } from "@/lib/offline-db";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { cn, formatDateTime } from "@/lib/utils";
import type { TareaPendiente } from "@/types";

// Tareas creadas sin conexión que todavía no llegaron a la Sheet. Va arriba de la lista de
// /tareas, fuera de los filtros: es "lo que acabo de cargar". Una rechazada por el server
// (errorMsg) muestra el motivo y espera al usuario: Reintentar o Descartar.
export function PendientesDeSubir() {
  const pendientes = usePendingTareas() ?? [];
  const online = useOnlineStatus();
  const [reintentando, setReintentando] = useState<string | null>(null);
  const [aDescartar, setADescartar] = useState<TareaPendiente | null>(null);
  const [descartando, setDescartando] = useState(false);

  if (pendientes.length === 0) return null;

  const reintentar = async (localId: string) => {
    setReintentando(localId);
    try {
      await reintentarPendiente(localId);
      const r = await syncPendingTareas();
      // OfflineSyncProvider escucha este evento e invalida ["tareas"]; así no dependemos
      // de un QueryClient acá.
      if (r.ok > 0) window.dispatchEvent(new CustomEvent("tareas-synced"));
    } finally {
      setReintentando(null);
    }
  };

  const descartar = async () => {
    if (!aDescartar) return;
    setDescartando(true);
    try {
      await descartarPendiente(aDescartar.localId);
      setADescartar(null);
    } finally {
      setDescartando(false);
    }
  };

  return (
    <section className="mt-4" aria-label="Pendientes de subir">
      <h3 className="flex items-center gap-2 text-sm font-medium text-slate-700">
        <CloudOff size={16} className="text-amber-600" />
        Pendientes de subir ({pendientes.length})
      </h3>
      <ul className="mt-2 space-y-2">
        {pendientes.map((p) => {
          const rechazada = !!p.errorMsg;
          return (
            <li
              key={p.localId}
              className={cn(
                "rounded-xl border bg-white p-4",
                rechazada ? "border-red-200" : "border-amber-200"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h4 className="truncate font-medium text-slate-900">
                    {p.objetivo || "(sin objetivo)"}
                  </h4>
                  <p className="mt-0.5 truncate text-sm text-slate-600">
                    {p.edificio} · {p.dpto || "Sin especificar"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Creada {formatDateTime(p.createdAt)}</p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full border px-2 py-0.5 text-xs",
                    rechazada
                      ? "border-red-200 bg-red-100 text-red-800"
                      : "border-amber-200 bg-amber-100 text-amber-800"
                  )}
                >
                  {rechazada ? "No se pudo subir" : "Pendiente de subir"}
                </span>
              </div>
              {rechazada && (
                <div className="mt-3 space-y-2">
                  <p className="text-sm text-red-700">{p.errorMsg}</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={!online || reintentando === p.localId}
                      onClick={() => reintentar(p.localId)}
                      className="flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50 disabled:hover:bg-slate-900"
                    >
                      {reintentando === p.localId ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <RefreshCw size={14} />
                      )}
                      Reintentar
                    </button>
                    <button
                      type="button"
                      onClick={() => setADescartar(p)}
                      className="flex items-center gap-1 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                    >
                      <Trash2 size={14} /> Descartar
                    </button>
                  </div>
                  {!online && (
                    <p className="text-xs text-slate-500">
                      Sin conexión: se puede reintentar al volver la red.
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        open={!!aDescartar}
        title="Descartar tarea pendiente"
        message={`Se va a borrar "${aDescartar?.objetivo || "esta tarea"}" de este teléfono. No está guardada en ningún otro lado. ¿Confirmás?`}
        confirmLabel="Descartar"
        variant="danger"
        loading={descartando}
        onConfirm={descartar}
        onCancel={() => setADescartar(null)}
      />
    </section>
  );
}
