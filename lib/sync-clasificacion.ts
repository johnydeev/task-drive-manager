// Decide si un fallo al subir una tarea de la cola es transitorio (se reintenta solo) o un
// rechazo del server (queda marcado hasta que el usuario reintente o descarte).
// Módulo puro: lo importan offline-sync.ts (browser) y app/sw.ts (Service Worker).
export type FalloSync = "red" | "rechazo";

// 401: es la sesión, no la tarea. 429: cuota, transitorio. 5xx y sin status: red.
export function clasificarStatus(status: number | undefined): FalloSync {
  if (status === undefined) return "red";
  if (status === 401 || status === 429) return "red";
  if (status >= 400 && status < 500) return "rechazo";
  return "red";
}

export function clasificarFalloSync(err: unknown): FalloSync {
  const status = (err as { status?: unknown } | null)?.status;
  return clasificarStatus(typeof status === "number" ? status : undefined);
}
