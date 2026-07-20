import { NextResponse } from "next/server";
import { withAuth } from "@/lib/http/withAuth";
import { withAdmin } from "@/lib/http/withAdmin";
import { getAsignaciones, addAsignacion, removeAsignacion } from "@/lib/sheets/asignaciones";
import { getConsorciosActivos } from "@/lib/consorcios";
import { jsonError } from "@/lib/api-utils";
import { asignacionSchema } from "@/lib/schemas";

export const runtime = "nodejs";

export const GET = withAuth(async (_req, session) => {
  const data =
    session.user.rol === "admin"
      ? await getAsignaciones()
      : await getAsignaciones(session.user.email);
  return NextResponse.json(data);
});

export const POST = withAdmin(async (req) => {
  const body = await req.json();
  const { email, edificio } = asignacionSchema.parse(body);
  const consorcios = await getConsorciosActivos();
  if (!consorcios.some((c) => c.nombre === edificio)) {
    return jsonError(400, `Edificio "${edificio}" no es válido o no está activo`);
  }
  try {
    const a = await addAsignacion(email, edificio);
    return NextResponse.json(a, { status: 201 });
  } catch (err) {
    // R2: el edificio ya está asignado a otro integrante.
    return jsonError(409, err instanceof Error ? err.message : "El edificio ya está asignado");
  }
});

export const DELETE = withAdmin(async (req) => {
  const sp = req.nextUrl.searchParams;
  const email = sp.get("email");
  const edificio = sp.get("edificio");
  if (!email || !edificio) return jsonError(400, "Faltan email y edificio");
  await removeAsignacion(email, edificio);
  return NextResponse.json({ ok: true });
});
