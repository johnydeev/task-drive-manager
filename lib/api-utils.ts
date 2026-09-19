import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { nanoid } from "nanoid";

export function jsonError(status: number, message: string, details?: unknown) {
  return NextResponse.json({ error: message, ...(details ? { details } : {}) }, { status });
}

// Convierte cualquier error en una respuesta JSON consistente.
// - Si la "excepción" ya es un Response (lo lanzamos así en requireSession), lo retorna tal cual.
// - ZodError → 400 con el detalle de validación.
// - Cualquier otra cosa → 500 OPACO: el mensaje real puede traer rangos, nombres de hoja o
//   ids (errores de googleapis) y no debe llegar al browser. Se loguea completo con un `ref`
//   corto que viaja en la respuesta: el usuario manda captura, se busca `ref=xxxx` en el log.
export function handleApiError(err: unknown): Response {
  if (err instanceof Response) return err;
  if (err instanceof ZodError) {
    return jsonError(400, "Datos inválidos", err.flatten());
  }
  const ref = nanoid(8);
  console.error(`[api] error ref=${ref}:`, err);
  return NextResponse.json({ error: "Error interno", ref }, { status: 500 });
}
