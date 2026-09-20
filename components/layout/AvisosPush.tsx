"use client";

import { Bell, BellOff, BellRing, Loader2 } from "lucide-react";
import { useAvisosPush } from "@/hooks/useAvisosPush";

// Entrada "Avisos" del menú (drawer mobile y sidebar desktop). Activa/desactiva las
// notificaciones push de este dispositivo y explica los estados en que no se puede.
export function AvisosPush({ className = "" }: { className?: string }) {
  const { soporte, permiso, suscripto, ocupado, error, claveConfigurada, activar, desactivar } =
    useAvisosPush();
  const base = "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-700";

  if (!claveConfigurada || soporte === "sin-soporte") return null;

  if (soporte === "ios-sin-instalar") {
    return (
      <p className={`${base} ${className}`}>
        <BellOff size={18} /> Avisos: instalá la app para activarlos
      </p>
    );
  }
  if (permiso === "denied") {
    return (
      <p
        className={`${base} ${className}`}
        title="Permitilos desde la configuración del sitio en tu navegador"
      >
        <BellOff size={18} /> Avisos bloqueados en el navegador
      </p>
    );
  }
  if (suscripto) {
    return (
      <div className={`${base} justify-between ${className}`}>
        <span className="flex items-center gap-3">
          <BellRing size={18} className="text-emerald-600" /> Avisos activados
        </span>
        <button
          type="button"
          onClick={desactivar}
          disabled={ocupado}
          className="text-xs text-slate-500 underline disabled:opacity-50"
        >
          {ocupado ? <Loader2 size={12} className="animate-spin" /> : "Desactivar"}
        </button>
      </div>
    );
  }
  return (
    <div className={className}>
      <button
        type="button"
        onClick={activar}
        disabled={ocupado}
        className={`${base} font-medium hover:bg-slate-100 disabled:opacity-50`}
      >
        {ocupado ? <Loader2 size={18} className="animate-spin" /> : <Bell size={18} />}
        Activar avisos
      </button>
      {error && <p className="px-3 text-xs text-red-600">{error}</p>}
    </div>
  );
}
