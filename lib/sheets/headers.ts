// Utilitario para mapear columnas de una Sheet por NOMBRE de header en vez de
// por índice fijo. Tolera diferencias de mayúsculas, acentos, y espacios/tabs
// vs guiones bajos, y permite alias (para renames que no son normalización-
// equivalentes, ej. "rowId" -> "id"). Así el código funciona con los headers
// viejos o los nuevos: renombrar la planilla no requiere lockstep con el deploy.

export function normalizeHeader(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // saca diacríticos
    .replace(/[\s_]+/g, ""); // "fecha inicio" y "fecha_inicio" -> "fechainicio"
}

export interface HeaderMap {
  /** Índice de columna (0-based) del nombre canónico o alguno de sus alias; -1 si no existe. */
  index(canonical: string, aliases?: string[]): number;
  /** Valor de la celda para ese nombre; "" si la columna o la celda no existen. */
  get(row: string[], canonical: string, aliases?: string[]): string;
}

export function buildHeaderMap(headerRow: string[]): HeaderMap {
  const norm = headerRow.map(normalizeHeader);
  const find = (canonical: string, aliases: string[] = []): number => {
    const candidates = [canonical, ...aliases].map(normalizeHeader);
    for (const c of candidates) {
      const i = norm.indexOf(c);
      if (i !== -1) return i;
    }
    return -1;
  };
  return {
    index: find,
    get: (row, canonical, aliases) => {
      const i = find(canonical, aliases);
      return i === -1 ? "" : (row[i] ?? "");
    },
  };
}

// Convierte un número de columna 1-based a letra(s) en notación A1: 1->A, 26->Z, 27->AA.
export function colLetter(n: number): string {
  let s = "";
  let x = n;
  while (x > 0) {
    const rem = (x - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s || "A";
}
