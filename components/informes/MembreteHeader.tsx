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
      <div className="flex items-center gap-4">
        {config?.membreteLogoUrl ? (
          // Imagen externa arbitraria (Drive): <img> evita configurar remotePatterns de next/image.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={config.membreteLogoUrl}
            alt=""
            className="h-16 w-16 shrink-0 rounded-full object-contain"
          />
        ) : null}
        <div className="min-w-0">
          <h3 className="truncate text-xl font-bold text-slate-900">
            {config?.membreteNombre || APP_NAME}
          </h3>
          {config?.membreteEmail && (
            <p className="truncate text-sm text-sky-700">{config.membreteEmail}</p>
          )}
          {contacto && <p className="truncate text-sm text-slate-600">{contacto}</p>}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 text-sm font-semibold text-slate-900">
        <span>Consorcio: {edificio}</span>
        {rango && <span>Período: {rango}</span>}
      </div>
    </div>
  );
}
