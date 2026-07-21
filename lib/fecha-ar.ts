// Fecha/hora de Buenos Aires (UTC-3), FIJA — no depende de la timezone del
// runtime (browser o server). El string resultante muestra la hora de pared de
// Buenos Aires con offset -03:00, y representa el mismo instante que el original
// (así la derivación de carpetas de Drive por rowId sigue siendo correcta).

export function toBuenosAiresISO(date: Date): string {
  const artMs = date.getTime() - 3 * 60 * 60 * 1000;
  const d = new Date(artMs);
  const p = (n: number, len = 2) => String(n).padStart(len, "0");
  return (
    `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}.${p(d.getUTCMilliseconds(), 3)}-03:00`
  );
}

// Timestamp actual en hora de Buenos Aires (UTC-3). Usado como id/rowId de tarea.
export function nowBuenosAiresISO(): string {
  return toBuenosAiresISO(new Date());
}
