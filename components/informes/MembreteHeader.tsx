"use client";

import type { Configuracion } from "@/types";
import { APP_NAME } from "@/lib/app-name";

interface Props {
  config?: Configuracion;
  edificio: string;
  desde: string;
  hasta: string;
}

// Espejo en pantalla del membrete del PDF. Los campos vacíos no se dibujan.
export function MembreteHeader({ config, edificio, desde, hasta }: Props) {
  const contacto = [config?.membreteDireccion, config?.membreteTelefono]
    .filter(Boolean)
    .join(" · ");
  const rango = [desde, hasta].filter(Boolean).join(" al ");

  return (
    <div className="rounded-t-2xl border border-b-0 border-slate-200 bg-white p-4 md:p-6">
      {/* Logo + nombre centrados, calcado de la planilla original */}
      <div className="flex items-center justify-center gap-4">
        {config?.membreteLogoUrl ? (
          // Imagen externa arbitraria (Drive): <img> evita configurar remotePatterns de next/image.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={config.membreteLogoUrl}
            alt=""
            className="h-16 w-16 shrink-0 rounded-full object-contain md:h-20 md:w-20"
          />
        ) : null}
        <h3 className="text-center text-2xl font-bold uppercase tracking-wide text-slate-900 md:text-3xl">
          {config?.membreteNombre || APP_NAME}
        </h3>
      </div>

      {/* Contacto: email a la izquierda, dirección y teléfono a la derecha */}
      {(config?.membreteEmail || contacto) && (
        <div className="mt-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-1 text-sm">
          <span className="font-semibold text-blue-700">{config?.membreteEmail}</span>
          <span className="font-semibold text-slate-900">{contacto}</span>
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t-2 border-slate-900 pt-2 text-sm font-bold italic text-slate-900">
        <span>Consorcio: {edificio}</span>
        {rango && <span>Período: {rango}</span>}
      </div>
    </div>
  );
}
