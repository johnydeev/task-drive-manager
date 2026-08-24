// Big John (`public/fonts/BigJohn.otf`) es la tipografía de la marca de la administración, pero
// cubre solo ASCII básico: NO tiene vocales acentuadas, ñ, arroba ni punto medio, y tampoco los
// acentos sueltos como para componerlos. `@react-pdf/renderer` no hace fallback por glifo
// faltante, así que un carácter que no esté acá sale como hueco en el PDF.
//
// Por eso la fuente se usa SOLO en el título del membrete, con el texto normalizado por
// `tituloMembrete`. Nunca para texto corrido (los comentarios y los nombres de dpto llevan tildes).
export const COBERTURA_BIG_JOHN =
  " !$%&()+,-./0123456789:;=?ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]_abcdefghijklmnopqrstuvwxyz¡¿‘’“”";

/**
 * Normaliza el nombre de la administración para dibujarlo con Big John: mayúsculas y sin
 * diacríticos. `texto` sale normalizado siempre, se dibuje con la fuente que se dibuje, así el
 * título se ve igual en pantalla y en los PDFs.
 *
 * `usaBigJohn` es false cuando queda algún carácter fuera de la cobertura: ahí conviene dibujar
 * el título entero con la fuente de respaldo antes que entregar un membrete con un hueco.
 */
export function tituloMembrete(nombre: string): { texto: string; usaBigJohn: boolean } {
  const texto = nombre
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

  const usaBigJohn = texto.length > 0 && [...texto].every((c) => COBERTURA_BIG_JOHN.includes(c));

  return { texto, usaBigJohn };
}
