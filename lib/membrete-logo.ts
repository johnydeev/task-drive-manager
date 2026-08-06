import fs from "node:fs";
import path from "node:path";
import { logoMembreteUrl } from "./drive-url";

// El <Image> de @react-pdf/renderer corre en el server: resuelve URLs absolutas por HTTP,
// pero NO una ruta del sitio como "/membrete-logo.png" (no tiene origen). Para poder
// guardar el logo dentro del repo (public/), esa ruta se traduce al archivo real en disco.
//
// En producción funciona igual: el Dockerfile copia `public/` a /app/public y el WORKDIR
// es /app, así que process.cwd() + "public" apunta al mismo lugar que en desarrollo.
//
// Si el archivo no existe, devuelve "" y el informe se genera SIN logo en vez de fallar.
export function resolverLogoParaPdf(
  logoUrl: string | undefined,
  cwd: string = process.cwd(),
  existe: (p: string) => boolean = fs.existsSync
): string {
  const url = logoUrl?.trim();
  if (!url) return "";
  // Un link de Drive se traduce a su thumbnail (el /view es HTML, no la imagen).
  if (/^https?:\/\//i.test(url)) return logoMembreteUrl(url);
  if (!url.startsWith("/")) return "";

  // Se ignora cualquier query/hash y se corta el path traversal: solo archivos de public/.
  const limpio = url.split(/[?#]/)[0];
  const destino = path.join(cwd, "public", limpio);
  const raiz = path.join(cwd, "public");
  if (!destino.startsWith(raiz)) return "";

  return existe(destino) ? destino : "";
}
