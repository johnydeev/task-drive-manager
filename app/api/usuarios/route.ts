import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireSession } from "@/lib/auth";
import {
  appendUsuario,
  getUsuarioByEmail,
  getUsuarios,
  setUsuarioActivo,
  setUsuarioFirma,
} from "@/lib/google-sheets";
import { handleApiError, jsonError } from "@/lib/api-utils";
import { firmaSchema, usuarioNuevoSchema, usuarioPatchSchema } from "@/lib/schemas";
import type { Usuario } from "@/types";

export const runtime = "nodejs";

// La firma es el link público en Drive con el que se sellan los PDF de visita. No hace
// falta para dibujar /edificios, así que no viaja en los registros ajenos.
function sinFirma(u: Usuario): Usuario {
  const copia = { ...u };
  delete copia.firmaUrl;
  return copia;
}

export async function GET() {
  try {
    const session = await requireSession();
    const usuarios = await getUsuarios();
    // El admin recibe todo (gestión de usuarios: necesita también los inactivos y las
    // firmas). Un no-admin recibe al equipo activo para la vista Edificios, con su propio
    // registro completo y los ajenos sin firma.
    if (session.user.rol === "admin") return NextResponse.json(usuarios);
    const email = session.user.email.toLowerCase();
    const esPropio = (u: Usuario) => u.email.toLowerCase() === email;
    const visibles = usuarios
      .filter((u) => u.activo || esPropio(u))
      .map((u) => (esPropio(u) ? u : sinFirma(u)));
    return NextResponse.json(visibles);
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
    // Dos patches distintos sobre el mismo endpoint: activar/desactivar y firma.
    if (typeof body?.firmaUrl === "string") {
      const parsedFirma = firmaSchema.parse({ email, firmaUrl: body.firmaUrl });
      await setUsuarioFirma(email, parsedFirma.firmaUrl);
      return NextResponse.json({ ok: true });
    }
    const parsed = usuarioPatchSchema.parse(body);
    await setUsuarioActivo(email, parsed.activo);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
