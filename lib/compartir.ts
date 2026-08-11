// Compartir un enlace desde el navegador.
//
// En el celular abre el menú nativo (WhatsApp, mail, etc.); en escritorio ese menú
// normalmente no existe, así que se copia el link al portapapeles. El resultado dice cuál
// de las dos cosas pasó, para poder avisarle al usuario.

export type ResultadoCompartir = "compartido" | "copiado" | "cancelado" | "error";

interface Navegador {
  share?: (data: { title?: string; text?: string; url?: string }) => Promise<void>;
  clipboard?: { writeText: (t: string) => Promise<void> };
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
