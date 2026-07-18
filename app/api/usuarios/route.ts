import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireSession } from "@/lib/auth";
import { appendUsuario, getUsuarioByEmail, getUsuarios, setUsuarioActivo } from "@/lib/google-sheets";
import { handleApiError, jsonError } from "@/lib/api-utils";
import { usuarioNuevoSchema, usuarioPatchSchema } from "@/lib/schemas";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await requireSession();
    const usuarios = await getUsuarios();
    // El admin recibe todos (gestión de usuarios). Un no-admin recibe solo su propio
    // registro: lo necesita la vista Edificios para renderizar su tarjeta y su nombre,
    // sin exponer la lista completa del equipo.
    if (session.user.rol === "admin") return NextResponse.json(usuarios);
    const email = session.user.email.toLowerCase();
    return NextResponse.json(usuarios.filter((u) => u.email.toLowerCase() === email));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const body = await req.json();
    const parsed = usuarioNuevoSchema.parse(body);

    const existing = await getUsuarioByEmail(parsed.email);
    if (existing) return jsonError(409, "El usuario ya existe");

    const created = await appendUsuario(parsed);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireAdmin();
    const email = req.nextUrl.searchParams.get("email");
    if (!email) return jsonError(400, "Falta query param 'email'");

    const body = await req.json();
    const parsed = usuarioPatchSchema.parse(body);
    await setUsuarioActivo(email, parsed.activo);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
