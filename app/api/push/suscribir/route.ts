import { NextResponse } from "next/server";
import { withAuth } from "@/lib/http/withAuth";
import { jsonError } from "@/lib/api-utils";
import { suscripcionPushSchema } from "@/lib/schemas";
import { deleteSuscripcion, getSuscripciones, upsertSuscripcion } from "@/lib/google-sheets";

export const runtime = "nodejs";

// Guarda la suscripción push de ESTE dispositivo para el usuario de la sesión.
export const POST = withAuth(async (req, session) => {
  const parsed = suscripcionPushSchema.parse(await req.json());
  const resultado = await upsertSuscripcion({
    email: session.user.email,
    endpoint: parsed.endpoint,
    p256dh: parsed.keys.p256dh,
    auth: parsed.keys.auth,
    userAgent: parsed.userAgent ?? "",
  });
  return NextResponse.json({ ok: true, resultado }, { status: resultado === "creada" ? 201 : 200 });
});

// Borra una suscripción: la propia, o cualquiera si es admin.
export const DELETE = withAuth(async (req, session) => {
  const endpoint = req.nextUrl.searchParams.get("endpoint");
  if (!endpoint) return jsonError(400, "Falta endpoint");
  const existente = (await getSuscripciones()).find((s) => s.endpoint === endpoint);
  if (!existente) return NextResponse.json({ ok: true });
  if (existente.email !== session.user.email.toLowerCase() && session.user.rol !== "admin") {
    return jsonError(403, "Esa suscripción no es tuya");
  }
  await deleteSuscripcion(endpoint);
  return NextResponse.json({ ok: true });
});
