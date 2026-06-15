import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getTareaByRowId, updateTarea } from "@/lib/google-sheets";
import { generateAndUploadReporte } from "@/lib/pdf-generator";
import { handleApiError, jsonError } from "@/lib/api-utils";

export const runtime = "nodejs";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const rowId = decodeURIComponent(id);

    const tarea = await getTareaByRowId(rowId);
    if (!tarea) return jsonError(404, "Tarea no encontrada");
    if (session.user.rol !== "admin" && tarea.supervisor !== session.user.email) {
      return jsonError(403, "Sin permisos sobre esta tarea");
    }

    const { url } = await generateAndUploadReporte(tarea);
    await updateTarea({ rowId: tarea.rowId, reporteUrl: url });

    return NextResponse.json({ reporteUrl: url });
  } catch (err) {
    return handleApiError(err);
  }
}
