import { NextResponse } from "next/server";
import { withAuth } from "@/lib/http/withAuth";
import { withAdmin } from "@/lib/http/withAdmin";
import {
  getDirectivas,
  appendDirectiva,
  deleteDirectiva,
  getDirectivaById,
  updateDirectiva,
} from "@/lib/sheets/directivas";
import { getUsuarios } from "@/lib/google-sheets";
import { jsonError } from "@/lib/api-utils";
import { directivaNuevaSchema, directivaPatchSchema } from "@/lib/schemas";

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

// Transiciones del ciclo de vida. El permiso depende de la acción, por eso withAuth
// (no withAdmin): se valida asignadoA/admin dentro del handler.
export const PATCH = withAuth(async (req, session) => {
  const body = await req.json();
  const { id, accion, nota } = directivaPatchSchema.parse(body);
  const d = await getDirectivaById(id);
  if (!d) return jsonError(404, "Directiva no encontrada");

  const esAsignado = d.asignadoA === session.user.email.toLowerCase();
  const esAdmin = session.user.rol === "admin";

  if (accion === "aceptar") {
    if (!esAsignado) return jsonError(403, "Solo el asignado puede aceptar");
    if (d.estado !== "Asignada") return jsonError(409, "La directiva no está en estado Asignada");
    const upd = await updateDirectiva(id, { estado: "Aceptada", aceptadaEn: new Date().toISOString() });
    return NextResponse.json(upd);
  }

  if (accion === "cerrar") {
    if (!esAsignado) return jsonError(403, "Solo el asignado puede cerrar");
    if (d.estado !== "Aceptada") return jsonError(409, "La directiva no está en estado Aceptada");
    if (!nota || !nota.trim()) return jsonError(400, "La nota de cierre es requerida");
    const upd = await updateDirectiva(id, {
      estado: "Realizada",
      realizadaEn: new Date().toISOString(),
      notaCierre: nota.trim(),
    });
    return NextResponse.json(upd);
  }

  // objetar
  if (!esAdmin) return jsonError(403, "Solo el admin puede objetar");
  // getDirectivaById devuelve el estado efectivo: si venció (Cerrada) ya no es Realizada.
  if (d.estado !== "Realizada") {
    return jsonError(409, "Solo se puede objetar una directiva Realizada dentro de las 72 h");
  }
  if (!nota || !nota.trim()) return jsonError(400, "La nota de objeción es requerida");
  const upd = await updateDirectiva(id, {
    estado: "Aceptada",
    objetadaEn: new Date().toISOString(),
    notaObjecion: nota.trim(),
  });
  return NextResponse.json(upd);
});
