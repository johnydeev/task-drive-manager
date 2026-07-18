import { NextResponse } from "next/server";
import { withAuth } from "@/lib/http/withAuth";
import { deleteTarea, getTareaByRowId, updateTarea } from "@/lib/google-sheets";
import { trashTareaFolder } from "@/lib/google-drive";
import { generateAndUploadReporte } from "@/lib/pdf-generator";
import { jsonError } from "@/lib/api-utils";
import { tareaPatchEstadoSchema, tareaUpdateSchema } from "@/lib/schemas";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

async function getOwnedTarea(rowId: string, session: { user: { email: string; rol: string } }) {
  const tarea = await getTareaByRowId(decodeURIComponent(rowId));
  if (!tarea) return null;
  if (session.user.rol !== "admin" && tarea.supervisor !== session.user.email) {
    return "forbidden" as const;
  }
  return tarea;
}

// Lectura del detalle: las tareas de edificio son compartidas, cualquier integrante
// autenticado puede abrir cualquiera. La escritura (PUT/DELETE/PATCH) sí valida dueño/admin.
export const GET = withAuth<Params>(async (_req, _session, { params }) => {
  const { id } = await params;
  const tarea = await getTareaByRowId(decodeURIComponent(id));
  if (!tarea) return jsonError(404, "Tarea no encontrada");
  return NextResponse.json(tarea);
});

export const PUT = withAuth<Params>(async (req, session, { params }) => {
  const { id } = await params;
  const result = await getOwnedTarea(id, session);
  if (!result) return jsonError(404, "Tarea no encontrada");
  if (result === "forbidden") return jsonError(403, "Sin permisos sobre esta tarea");

  const body = await req.json();
  const parsed = tareaUpdateSchema.parse(body);
  const updated = await updateTarea({ ...parsed, rowId: result.rowId });
  return NextResponse.json(updated);
});

export const DELETE = withAuth<Params>(async (_req, session, { params }) => {
  const { id } = await params;
  const result = await getOwnedTarea(id, session);
  if (!result) return jsonError(404, "Tarea no encontrada");
  if (result === "forbidden") return jsonError(403, "Sin permisos sobre esta tarea");

  // Papelera de Drive primero (best-effort): si falla, igual borramos la fila para no
  // dejar la tarea a medias. La operación es idempotente en reintentos.
  try {
    await trashTareaFolder({
      edificio: result.edificio,
      objetivo: result.objetivo,
      ubicacion: result.dpto,
      rowId: result.rowId,
    });
  } catch (err) {
    console.error("[delete-tarea] no se pudo mover la carpeta a papelera:", err);
  }

  await deleteTarea(result.rowId);
  return NextResponse.json({ ok: true });
});

export const PATCH = withAuth<Params>(async (req, session, { params }) => {
  const { id } = await params;
  const result = await getOwnedTarea(id, session);
  if (!result) return jsonError(404, "Tarea no encontrada");
  if (result === "forbidden") return jsonError(403, "Sin permisos sobre esta tarea");

  const body = await req.json();
  const parsed = tareaPatchEstadoSchema.parse(body);

  const updated = await updateTarea({
    rowId: result.rowId,
    estado: parsed.estado,
    comentarioEnProceso: parsed.comentarioEnProceso,
    comentarioRealizado: parsed.comentarioRealizado,
    fechaRealizado: parsed.estado === "Realizado" ? new Date().toISOString().slice(0, 10) : undefined,
  });

  // Auto-generación del reporte al cerrar la tarea. Fire-and-forget para no bloquear
  // la respuesta. Si falla, queda el estado actualizado pero sin reporte; el usuario
  // puede regenerarlo manualmente desde la UI.
  if (parsed.estado === "Realizado") {
    generateAndUploadReporte(updated)
      .then((r) => updateTarea({ rowId: updated.rowId, reporteUrl: r.url }))
      .catch((err) => console.error("[reporte-auto] error:", err));
  }

  return NextResponse.json(updated);
});
