"use client";

import { useState } from "react";
import { Download, ExternalLink, Loader2, Share2 } from "lucide-react";
import { compartirEnlace } from "@/lib/compartir";
import { descargaUrl } from "@/lib/drive-url";
import { cn } from "@/lib/utils";

interface Props {
  pdfUrl: string;
  titulo: string;
  /** `compacto` para el historial (íconos chicos), `completo` para el modal de éxito. */
  variante?: "compacto" | "completo";
}

// Ver / Descargar / Compartir el PDF de una visita. Se usa en el modal que sale al
// guardar y en cada fila del historial.
export function AccionesPdf({ pdfUrl, titulo, variante = "completo" }: Props) {
  const [aviso, setAviso] = useState<string | null>(null);
  const [compartiendo, setCompartiendo] = useState(false);

  const compartir = async () => {
    setCompartiendo(true);
    const r = await compartirEnlace({ url: pdfUrl, titulo });
    setCompartiendo(false);
    // "compartido" y "cancelado" ya tuvieron su feedback en el menú nativo del sistema.
    if (r === "copiado") setAviso("Link copiado");
    else if (r === "error") setAviso("No se pudo compartir");
    else setAviso(null);
    if (r === "copiado") setTimeout(() => setAviso(null), 2500);
  };

  const compacto = variante === "compacto";
  const base = compacto
    ? "flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-600 hover:bg-slate-200"
    : "flex flex-1 items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50";
  const icono = compacto ? 14 : 16;

  return (
    <div className={compacto ? "flex items-center gap-1" : ""}>
      <div className={cn("flex gap-2", compacto && "gap-1")}>
        <a
          href={pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={base}
          aria-label="Ver PDF"
        >
          <ExternalLink size={icono} />
          {!compacto && "Ver"}
        </a>
        <a
          href={descargaUrl(pdfUrl)}
          target="_blank"
          rel="noopener noreferrer"
          className={base}
          aria-label="Descargar PDF"
        >
          <Download size={icono} />
          {!compacto && "Descargar"}
        </a>
        <button type="button" onClick={compartir} className={base} aria-label="Compartir PDF">
          {compartiendo ? (
            <Loader2 size={icono} className="animate-spin" />
          ) : (
            <Share2 size={icono} />
          )}
          {!compacto && "Compartir"}
        </button>
      </div>
      {aviso && (
        <p className={cn("text-xs text-slate-500", compacto ? "ml-1" : "mt-2 text-center")}>
          {aviso}
        </p>
      )}
    </div>
  );
}
