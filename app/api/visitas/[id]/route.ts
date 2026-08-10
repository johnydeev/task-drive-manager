import { NextResponse } from "next/server";
import { withAuth } from "@/lib/http/withAuth";
import { getVisitaById, deleteVisita } from "@/lib/google-sheets";
import { trashFileByUrl } from "@/lib/google-drive";
import { jsonError } from "@/lib/api-utils";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// Borrar es la única forma de corregir una visita mal cargada (los PDF son inmutables):
// el archivo va a la papelera de Drive y la fila se saca de la planilla.
export const DELETE = withAuth<Ctx>(async (_req, session, { params }) => {
  if (session.user.rol !== "admin") {
    return jsonError(403, "Solo un administrador puede eliminar visitas");
  }

  const { id } = await params;
  const visita = await getVisitaById(decodeURIComponent(id));
  if (!visita) return jsonError(404, "Visita no encontrada");

  // El archivo se busca por su id, no por la ruta: da igual dónde esté en Drive (sirve
  // para las visitas emitidas con la estructura de carpetas anterior, o movidas a mano).
  //
  // Si ya no existe —borrado definitivo por fuera de la app— Drive responde 404. Eso NO
  // puede impedir borrar la fila: si no, la visita queda huérfana y sin forma de sacarla
  // desde la app.
  if (visita.pdfUrl) {
    try {
      await trashFileByUrl(visita.pdfUrl);
    } catch (err) {
      console.error("No se pudo mandar el PDF a la papelera; se borra la fila igual:", err);
    }
  }
  await deleteVisita(visita.id);

  return NextResponse.json({ ok: true });
});
