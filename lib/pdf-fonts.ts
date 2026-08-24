import fs from "node:fs";
import path from "node:path";
import { Font } from "@react-pdf/renderer";

/** Familia registrada para Big John. Ojo: solo sirve para el título del membrete — ver `membrete-titulo.ts`. */
export const BIG_JOHN = "BigJohn";

/**
 * Registra la tipografía de la marca para `@react-pdf/renderer`.
 *
 * El `Font.register` corre server-side y necesita una ruta de disco, no una URL del sitio (mismo
 * caso que el logo del membrete, ver `resolverLogoParaPdf`). El Dockerfile copia `public/` a
 * /app/public con WORKDIR /app, así que `process.cwd()` apunta al mismo lugar en dev y en prod.
 *
 * Si el archivo no está, no registra nada y devuelve false: el PDF se genera igual con la fuente
 * de respaldo, en vez de fallar por un asset ausente.
 */
export function registrarFuentes(cwd: string = process.cwd()): boolean {
  const archivo = path.join(cwd, "public", "fonts", "BigJohn.otf");
  if (!fs.existsSync(archivo)) return false;

  Font.register({ family: BIG_JOHN, src: archivo });
  return true;
}
