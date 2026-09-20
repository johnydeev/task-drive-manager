import { NextResponse } from "next/server";
import { withAuth } from "@/lib/http/withAuth";
import { getAvisos } from "@/lib/google-sheets";
import { RETENCION_AVISOS_MS } from "@/lib/avisos";

export const runtime = "nodejs";

const TOPE = 50;

// Avisos del usuario de la sesión: últimos 30 días, más nuevos primero, tope 50.
// `noLeidos` se cuenta sobre esos mismos.
export const GET = withAuth(async (_req, session) => {
  const todos = await getAvisos(session.user.email, { desde: Date.now() - RETENCION_AVISOS_MS });
  const avisos = todos.slice(0, TOPE);
  const noLeidos = avisos.filter((a) => !a.leidoEn).length;
  return NextResponse.json({ avisos, noLeidos });
});
