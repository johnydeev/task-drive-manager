// Compartir un enlace desde el navegador.
//
// En el celular abre el menú nativo (WhatsApp, mail, etc.); en escritorio ese menú
// normalmente no existe, así que se copia el link al portapapeles. El resultado dice cuál
// de las dos cosas pasó, para poder avisarle al usuario.

export type ResultadoCompartir = "compartido" | "copiado" | "cancelado" | "error";

interface DatosCompartir {
  title?: string;
  text?: string;
  url?: string;
  files?: File[];
}

interface Navegador {
  share?: (data: DatosCompartir) => Promise<void>;
  canShare?: (data: DatosCompartir) => boolean;
  clipboard?: { writeText: (t: string) => Promise<void> };
}

// Comparte el ARCHIVO en sí (llega el PDF, no un enlace). Requiere Web Share Level 2:
// anda en Android/Chrome y iOS 15+, no en la mayoría de los navegadores de escritorio.
// Devuelve "no-soportado" para que el caller pueda caer a compartir el link.
export async function compartirArchivo(
  opts: { archivo: File; titulo?: string },
  nav: Navegador = typeof navigator !== "undefined" ? navigator : {}
): Promise<ResultadoCompartir | "no-soportado"> {
  const datos = { files: [opts.archivo], title: opts.titulo };
  if (typeof nav.share !== "function" || !nav.canShare?.(datos)) return "no-soportado";
  try {
    await nav.share(datos);
    return "compartido";
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return "cancelado";
    return "error";
  }
}

export async function compartirEnlace(
  opts: { url: string; titulo?: string },
  nav: Navegador = typeof navigator !== "undefined" ? navigator : {}
): Promise<ResultadoCompartir> {
  if (typeof nav.share === "function") {
    try {
      await nav.share({ title: opts.titulo, url: opts.url });
      return "compartido";
    } catch (err) {
      // Cerrar el menú nativo sin elegir nada lanza AbortError: no es un fallo,
      // no hay que mostrar error ni caer al portapapeles.
      if (err instanceof Error && err.name === "AbortError") return "cancelado";
    }
  }

  if (nav.clipboard?.writeText) {
    try {
      await nav.clipboard.writeText(opts.url);
      return "copiado";
    } catch {
      return "error";
    }
  }

  return "error";
}
