// Normalizadores de valores de celda compartidos entre las hojas.

// Fecha de calendario: YYYY-MM-DD. Trunca cualquier parte de hora/timezone.
// Devuelve "" si no reconoce el formato (evita propagar basura a la DB futura).
export function toDateOnly(v: string): string {
  const s = (v ?? "").trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}

// Booleano tolerante a lo que ya hay en la planilla (TRUE/FALSE/Sí, may/min).
export function toBool(v: string): boolean {
  const s = (v ?? "").toString().trim().toLowerCase();
  return s === "true" || s === "sí" || s === "si" || s === "verdadero";
}

// Serialización canónica de booleano para escribir en la Sheet.
export function boolToCell(b: boolean): "TRUE" | "FALSE" {
  return b ? "TRUE" : "FALSE";
}
