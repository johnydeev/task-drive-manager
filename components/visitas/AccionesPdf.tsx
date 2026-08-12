"use client";

import { useState } from "react";
import { Download, ExternalLink, Loader2, Share2 } from "lucide-react";
import { compartirArchivo, compartirEnlace } from "@/lib/compartir";
import { cn } from "@/lib/utils";

interface Props {
  pdfUrl: string;
  titulo: string;
  /** Id de la visita: habilita bajar el PDF por nuestro server para poder compartirlo
   *  como archivo. Sin esto, "Compartir" manda el link de Drive. */
  visitaId?: string;
  /** `compacto` para el historial (íconos chicos), `completo` para el modal de éxito. */
  variante?: "compacto" | "completo";
}

// Nombre del archivo que ve el usuario al compartirlo o bajarlo.
function nombreDesdeTitulo(titulo: string): string {
  const limpio = titulo.replace(/[\\/:*?"<>|]/g, " ").trim() || "visita";
  return `${limpio}.pdf`;
}

// Ver / Descargar / Compartir el PDF de una visita. Se usa en el modal que sale al
// guardar y en cada fila del historial.
export function AccionesPdf({ pdfUrl, titulo, visitaId, variante = "completo" }: Props) {
  const [aviso, setAviso] = useState<string | null>(null);
  const [compartiendo, setCompartiendo] = useState(false);

  const descargaLocal = visitaId ? `/api/visitas/${encodeURIComponent(visitaId)}/pdf` : null;

  // Intenta mandar el PDF como archivo adjunto; si el dispositivo no lo soporta (o no
  // se pudo bajar), cae a compartir el link de Drive, que funciona en todos lados.
  const compartir = async () => {
    setCompartiendo(true);
    setAviso(null);
    try {
      if (descargaLocal) {
        const r = await compartirComoArchivo(descargaLocal, titulo);
        if (r !== "no-soportado") {
          mostrarResultado(r);
          return;
        }
      }
      mostrarResultado(await compartirEnlace({ url: pdfUrl, titulo }));
    } finally {
      setCompartiendo(false);
    }
  };

  const mostrarResultado = (r: string) => {
    // "compartido" y "cancelado" ya tuvieron su feedback en el menú nativo del sistema.
    if (r === "copiado") {
      setAviso("Link copiado");
      setTimeout(() => setAviso(null), 2500);
    } else if (r === "error") {
      setAviso("No se pudo compartir");
    }
  };

  async function compartirComoArchivo(url: string, titulo: string) {
    let archivo: File;
    try {
      const res = await fetch(url);
      if (!res.ok) return "no-soportado" as const;
      const blob = await res.blob();
      archivo = new File([blob], nombreDesdeTitulo(titulo), { type: "application/pdf" });
    } catch {
      return "no-soportado" as const;
    }
    return compartirArchivo({ archivo, titulo });
  }

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
          // Con el endpoint propio la descarga conserva el nombre real del archivo.
          href={descargaLocal ?? pdfUrl}
          download={descargaLocal ? nombreDesdeTitulo(titulo) : undefined}
          target={descargaLocal ? undefined : "_blank"}
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
