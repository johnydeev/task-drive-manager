import { NextResponse } from "next/server";
import { withAuth } from "@/lib/http/withAuth";
import { withAdmin } from "@/lib/http/withAdmin";
import { getDirectivas, appendDirectiva, deleteDirectiva } from "@/lib/sheets/directivas";
import { getUsuarios } from "@/lib/google-sheets";
import { jsonError } from "@/lib/api-utils";
import { directivaNuevaSchema } from "@/lib/schemas";

export const runtime = "nodejs";

export const GET = withAuth(async (_req, session) => {
  const data =
    session.user.rol === "admin"
      ? await getDirectivas()
      : await getDirectivas(session.user.email);
  return NextResponse.json(data);
});

export const POST = withAdmin(async (req, session) => {
  const body = await req.json();
  const input = directivaNuevaSchema.parse(body);
  const usuarios = await getUsuarios();
  const activo = usuarios.some((u) => u.email === input.asignadoA && u.activo);
  if (!activo) return jsonError(400, `El usuario "${input.asignadoA}" no existe o está inactivo`);
  const d = await appendDirectiva(input, session.user.email);
  return NextResponse.json(d, { status: 201 });
});

export const DELETE = withAdmin(async (req) => {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return jsonError(400, "Falta id");
  await deleteDirectiva(id);
  return NextResponse.json({ ok: true });
});
