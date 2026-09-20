import { NextResponse } from "next/server";
import { withAuth } from "@/lib/http/withAuth";
import { marcarLeidos } from "@/lib/google-sheets";

export const runtime = "nodejs";

// Marca leídos todos los avisos no leídos del usuario de la sesión (al abrir la campana).
export const PATCH = withAuth(async (_req, session) => {
  const marcados = await marcarLeidos(session.user.email);
  return NextResponse.json({ ok: true, marcados });
});
