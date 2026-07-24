// Límites de tamaño de las subidas y los mensajes que ve el usuario.
// Vive UNA sola vez y lo usan el cliente (FileUploader, que corta antes de gastar datos)
// y la API route (/api/upload, que es la que manda), para que no puedan divergir.

import type { Configuracion } from "@/types";

/**
 * Techo de infraestructura, independiente de lo que diga la hoja `Configuracion`.
 *
 * La app va detrás de Cloudflare (Tunnel) y el plan Free rechaza cualquier request de
 * más de 100 MB. Lo peor es CÓMO lo rechaza: corta la conexión mientras el celular
 * todavía está subiendo, así que el navegador nunca llega a leer el 413 y el `fetch`
 * falla con un "Failed to fetch" pelado. Cortamos nosotros antes, con un mensaje que se
 * entienda, y dejamos margen para el sobre del multipart.
 *
 * Si algún día el plan de Cloudflare cambia, este es el número a tocar.
 */
export const LIMITE_INFRA_MB = 95;

export type TipoArchivo = "imagen" | "video" | "documento";

const ARTICULO: Record<TipoArchivo, string> = {
  imagen: "La imagen",
  video: "El video",
  documento: "El documento",
};

const SUGERENCIA: Record<TipoArchivo, string> = {
  imagen: "Probá con otra foto.",
  video: "Grabá uno más corto o elegí otro.",
  documento: "Probá con un PDF más liviano.",
};

export const pesoMB = (bytes: number): number => bytes / (1024 * 1024);

// 187 MB / 1.4 MB — un decimal solo cuando el número es chico.
export const formatMB = (mb: number): string =>
  `${mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10} MB`;

// Máximo real para un tipo de archivo: lo que pide la hoja, pero nunca por encima de
// lo que la infraestructura puede transportar.
export function limiteMB(kind: TipoArchivo, config: Configuracion): number {
  const deLaHoja =
    kind === "imagen"
      ? config.maxSizeImagenMB
      : kind === "video"
        ? config.maxSizeVideoMB
        : config.maxSizePdfMB;
  return Math.min(deLaHoja, LIMITE_INFRA_MB);
}

// "El video no puede pesar más de 95 MB — este pesa 187 MB. Grabá uno más corto o elegí otro."
export function mensajeArchivoPesado(
  kind: TipoArchivo,
  sizeBytes: number,
  limite: number
): string {
  return `${ARTICULO[kind]} no puede pesar más de ${formatMB(limite)} — este pesa ${formatMB(
    pesoMB(sizeBytes)
  )}. ${SUGERENCIA[kind]}`;
}

// Un fetch que se cae sin respuesta ("Failed to fetch" en Chrome, "Load failed" en Safari)
// no le dice nada al usuario: puede ser la señal del celular o el proxy cortando el
// request por tamaño. El resto de los errores ya vienen con el mensaje del servidor.
const ERROR_DE_RED = /^(failed to fetch|load failed|network ?error)$/i;

export function mensajeErrorSubida(
  err: unknown,
  kind: TipoArchivo,
  sizeBytes: number
): string {
  const raw = err instanceof Error ? err.message : "";
  if (!ERROR_DE_RED.test(raw.trim())) {
    return raw || "Error al subir el archivo";
  }
  const nombre = kind === "imagen" ? "la imagen" : kind === "video" ? "el video" : "el documento";
  return `Se cortó la conexión subiendo ${nombre} (pesa ${formatMB(
    pesoMB(sizeBytes)
  )}). Puede ser por el tamaño o por la señal: probá de nuevo desde WiFi, o con un archivo más liviano.`;
}
