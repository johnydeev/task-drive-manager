"use client";

import { useSyncExternalStore } from "react";
import { Bell, Loader2, X } from "lucide-react";
import { useAvisosPush } from "@/hooks/useAvisosPush";

const KEY = "avisos-banner-cerrado";
const listeners = new Set<() => void>();

function leerCerrado(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
function suscribir(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function cerrarBanner() {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    /* modo privado: solo se oculta en esta sesión */
  }
  for (const cb of listeners) cb();
}

// Invitación única por dispositivo a activar los avisos. Se oculta al activar o con "Ahora no".
// El "cerrado" vive en localStorage y se lee con useSyncExternalStore (en el server siempre
// cerrado → sin banner en el HTML inicial, sin setState en efecto).
export function BannerAvisos() {
  const { soporte, permiso, suscripto, ocupado, claveConfigurada, activar } = useAvisosPush();
  const cerrado = useSyncExternalStore(suscribir, leerCerrado, () => true);

  if (cerrado || !claveConfigurada || soporte !== "ok" || permiso !== "default" || suscripto) {
    return null;
  }

  return (
    <div className="mt-4 flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 md:flex-row md:items-center">
      <Bell size={18} className="shrink-0 text-slate-700" />
      <p className="flex-1 text-sm text-slate-700">
        Activá los avisos para enterarte cuando te asignen o revisen una tarea.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={activar}
          disabled={ocupado}
          className="flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {ocupado && <Loader2 size={14} className="animate-spin" />} Activar
        </button>
        <button
          type="button"
          onClick={cerrarBanner}
          className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
        >
          <X size={14} /> Ahora no
        </button>
      </div>
    </div>
  );
}
