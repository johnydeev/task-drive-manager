"use client";

import { useEffect, useState } from "react";
import { RefreshCw, X } from "lucide-react";

// Banner que aparece cuando hay un Service Worker nuevo esperando.
// Toca el botón "Actualizar" → mensaje SKIP_WAITING al SW → controllerchange → reload.
export function UpdateBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onUpdate = () => setShow(true);
    window.addEventListener("sw-update-available", onUpdate);
    return () => window.removeEventListener("sw-update-available", onUpdate);
  }, []);

  if (!show) return null;

  const applyUpdate = async () => {
    if (!("serviceWorker" in navigator)) return;
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg?.waiting) {
      reg.waiting.postMessage({ type: "SKIP_WAITING" });
      // El listener controllerchange en RegisterPWA dispara reload().
    } else {
      window.location.reload();
    }
  };

  return (
    <div className="fixed inset-x-0 bottom-20 z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-lg md:bottom-6">
      <div className="flex items-center gap-2 text-sm text-slate-700">
        <RefreshCw size={16} className="shrink-0 text-slate-500" />
        <div>
          <p className="font-medium text-slate-900">Nueva versión disponible</p>
          <p className="text-xs text-slate-500">Recargá para aplicar los últimos cambios.</p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={applyUpdate}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          Actualizar
        </button>
        <button
          onClick={() => setShow(false)}
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
          aria-label="Cerrar"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
