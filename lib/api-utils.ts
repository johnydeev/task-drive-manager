import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function jsonError(status: number, message: string, details?: unknown) {
  return NextResponse.json({ error: message, ...(details ? { details } : {}) }, { status });
}

// Convierte cualquier error en una respuesta JSON consistente.
// Si la "excepción" ya es un Response (lo lanzamos así en requireSession), lo retorna tal cual.
export function handleApiError(err: unknown): Response {
  if (err instanceof Response) return err;
  if (err instanceof ZodError) {
    return jsonError(400, "Datos inválidos", err.flatten());
  }
  if (err instanceof Error) {
    console.error("[api] error:", err);
    return jsonError(500, err.message);
  }
  console.error("[api] error desconocido:", err);
  return jsonError(500, "Error interno");
}
