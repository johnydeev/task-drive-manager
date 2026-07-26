"use client";

import { useEffect, useRef, useState } from "react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { usePendingCount } from "@/hooks/usePendingTareas";
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
}

// Punto de estado de conexión (mobile + desktop). Verde = online y al día;
// ámbar + número = online con cola por subir; rojo = offline. Al tocarlo abre un
// modal explicando el modo sin conexión. Se abre solo una vez al primer offline
// de la sesión.
export function OfflineIndicator({ className }: Props) {
  // Mount guard: el server render devuelve null (el estado de red vive solo en cliente).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const online = useOnlineStatus();
  const pending = usePendingCount();
  const [modalOpen, setModalOpen] = useState(false);
  const autoShownRef = useRef(false);

  // Apertura automática única al primer offline de la sesión.
  useEffect(() => {
    if (!mounted) return;
    if (!online && !autoShownRef.current) {
      autoShownRef.current = true;
      setModalOpen(true);
    }
  }, [mounted, online]);

  if (!mounted) return null;

  const color = !online
    ? "bg-red-500"
    : pending > 0
      ? "bg-amber-500"
      : "bg-emerald-500";

  const label = !online
    ? "Sin conexión"
    : pending > 0
      ? `${pending} tarea${pending !== 1 ? "s" : ""} pendiente${pending !== 1 ? "s" : ""} de subir — conexión al día`
      : "Conectado — todo al día";

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        aria-label={label}
        title={label}
        className={cn("flex items-center gap-1.5", className)}
      >
        <span className={cn("inline-block h-2.5 w-2.5 rounded-full", color)} />
        {online && pending > 0 && (
          <span className="text-xs font-semibold text-amber-700">{pending}</span>
        )}
      </button>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-slate-900">Modo sin conexión</h3>
            <p className="mt-2 text-sm text-slate-600">
              Podés crear tareas aunque no tengas internet: se guardan en tu teléfono y se suben
              solas apenas vuelva la conexión.
            </p>
            <ul className="mt-3 space-y-1 text-sm text-slate-600">
              <li className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" /> Verde: todo al día
              </li>
              <li className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" /> Ámbar: subiendo pendientes
              </li>
              <li className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" /> Rojo: sin conexión
              </li>
            </ul>
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="mt-5 w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </>
  );
}
