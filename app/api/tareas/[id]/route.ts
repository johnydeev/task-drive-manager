import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getTareaByRowId, updateTarea } from "@/lib/google-sheets";
import { generateAndUploadReporte } from "@/lib/pdf-generator";
import { handleApiError, jsonError } from "@/lib/api-utils";
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

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const result = await getOwnedTarea(id, session);
    if (!result) return jsonError(404, "Tarea no encontrada");
    if (result === "forbidden") return jsonError(403, "Sin permisos sobre esta tarea");
    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const result = await getOwnedTarea(id, session);
    if (!result) return jsonError(404, "Tarea no encontrada");
    if (result === "forbidden") return jsonError(403, "Sin permisos sobre esta tarea");

    const body = await req.json();
    const parsed = tareaUpdateSchema.parse(body);
    const updated = await updateTarea({ ...parsed, rowId: result.rowId });
    return NextResponse.json(updated);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const session = await requireSession();
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
  } catch (err) {
    return handleApiError(err);
  }
}
