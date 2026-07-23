import { NextResponse } from "next/server";
import { withAuth } from "@/lib/http/withAuth";
import {
  deleteTarea,
  getTareaByRowId,
  getTareaPersistida,
  getUsuarios,
  updateTarea,
} from "@/lib/google-sheets";
import { trashTareaFolder } from "@/lib/google-drive";
import { generateAndUploadReporte } from "@/lib/pdf-generator";
import { jsonError } from "@/lib/api-utils";
import { tareaAsignarSchema, tareaTransicionSchema, tareaUpdateSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

// Lectura del detalle: compartida, cualquier integrante autenticado la abre. El estado
// se muestra derivado (72h). La escritura valida rol/estado de origen abajo.
export const GET = withAuth<Params>(async (_req, _session, { params }) => {
  const { id } = await params;
  const tarea = await getTareaByRowId(decodeURIComponent(id));
  if (!tarea) return jsonError(404, "Tarea no encontrada");
  return NextResponse.json(tarea);
});

// Editar campos (objetivo, prioridad, fechas, etc.): SOLO admin.
export const PUT = withAuth<Params>(async (req, session, { params }) => {
  if (session.user.rol !== "admin") return jsonError(403, "Solo el admin puede editar los campos de la tarea");
  const { id } = await params;
  const t = await getTareaPersistida(decodeURIComponent(id));
  if (!t) return jsonError(404, "Tarea no encontrada");
  const parsed = tareaUpdateSchema.parse(await req.json());
  return NextResponse.json(await updateTarea({ ...parsed, rowId: t.rowId }));
});

// Borrar: SOLO admin.
export const DELETE = withAuth<Params>(async (_req, session, { params }) => {
  if (session.user.rol !== "admin") return jsonError(403, "Solo el admin puede borrar tareas");
  const { id } = await params;
  const t = await getTareaPersistida(decodeURIComponent(id));
  if (!t) return jsonError(404, "Tarea no encontrada");

  // Papelera de Drive primero (best-effort): si falla, igual borramos la fila.
  try {
    await trashTareaFolder({ edificio: t.edificio, objetivo: t.objetivo, ubicacion: t.dpto, rowId: t.rowId });
  } catch (err) {
    console.error("[delete-tarea] no se pudo mover la carpeta a papelera:", err);
  }

  await deleteTarea(t.rowId);
  return NextResponse.json({ ok: true });
});

// PATCH: asignar (body {asignadoA}) o transición (body {accion,...}). El estado de origen
// se valida contra el PERSISTIDO (getTareaPersistida), no el derivado a 72h.
export const PATCH = withAuth<Params>(async (req, session, { params }) => {
  const { id } = await params;
  const t = await getTareaPersistida(decodeURIComponent(id));
  if (!t) return jsonError(404, "Tarea no encontrada");

  const body = await req.json();
  const now = new Date().toISOString();
  const email = session.user.email.toLowerCase();
  const esAdmin = session.user.rol === "admin";
  const esAsignado = (t.asignadoA ?? "").toLowerCase() === email;

  // --- Asignar / reasignar (admin) ---
  if ("asignadoA" in body) {
    if (!esAdmin) return jsonError(403, "Solo el admin puede asignar");
    const { asignadoA } = tareaAsignarSchema.parse(body);
    const usuarios = await getUsuarios();
    if (!usuarios.some((u) => u.email === asignadoA && u.activo)) {
      return jsonError(400, `El usuario "${asignadoA}" no existe o está inactivo`);
    }
    return NextResponse.json(
      await updateTarea({
        rowId: t.rowId,
        asignadoA,
        estado: "Asignada",
        asignadaEn: now,
        aceptadaEn: "", // D3: reasignar resetea el ciclo
        revisionEn: "",
      })
    );
  }

  // --- Transiciones del ciclo de vida ---
  const { accion, comentario, nota } = tareaTransicionSchema.parse(body);

  if (accion === "aceptar") {
    if (!esAsignado) return jsonError(403, "Solo el asignado puede aceptar");
    if (t.estado !== "Asignada") return jsonError(409, "La tarea no está en estado Asignada");
    return NextResponse.json(await updateTarea({ rowId: t.rowId, estado: "Aceptada", aceptadaEn: now }));
  }

  if (accion === "empezar") {
    if (!esAsignado) return jsonError(403, "Solo el asignado puede iniciar");
    if (t.estado !== "Aceptada") return jsonError(409, "La tarea no está en estado Aceptada");
    return NextResponse.json(await updateTarea({ rowId: t.rowId, estado: "En Proceso" }));
  }

  if (accion === "comentar") {
    if (!esAsignado && !esAdmin) return jsonError(403, "Sin permiso");
    if (t.estado !== "En Proceso") return jsonError(409, "Solo se comenta en En Proceso");
    return NextResponse.json(await updateTarea({ rowId: t.rowId, comentarioEnProceso: comentario ?? "" }));
  }

  if (accion === "revisar") {
    if (!esAsignado) return jsonError(403, "Solo el asignado puede mandar a revisión");
    if (t.estado !== "En Proceso" && t.estado !== "Objetada") {
      return jsonError(409, "La tarea no está En Proceso ni Objetada");
    }
    return NextResponse.json(
      await updateTarea({
        rowId: t.rowId,
        estado: "En Revisión",
        revisionEn: now,
        comentarioRevision: comentario ?? "",
      })
    );
  }

  if (accion === "objetar") {
    if (!esAdmin) return jsonError(403, "Solo el admin puede objetar");
    if (t.estado !== "En Revisión") return jsonError(409, "Solo se puede objetar una tarea En Revisión");
    if (!nota?.trim()) return jsonError(400, "El motivo de la objeción es requerido");
    return NextResponse.json(
      await updateTarea({
        rowId: t.rowId,
        estado: "Objetada",
        notaObjecion: nota.trim(),
        objetadaEn: now,
      })
    );
  }

  // cerrar (admin)
  if (!esAdmin) return jsonError(403, "Solo el admin puede cerrar la tarea");
  if (t.estado !== "En Revisión") return jsonError(409, "La tarea no está En Revisión");
  if (!nota?.trim()) return jsonError(400, "La nota de cierre es requerida");
  const updated = await updateTarea({
    rowId: t.rowId,
    estado: "Realizada",
    realizadaEn: now,
    comentarioRealizado: nota.trim(),
    fechaRealizado: now.slice(0, 10),
  });

  // Auto-reporte al cerrar (fire-and-forget). Si falla, queda cerrada sin reporte; se
  // puede regenerar a mano desde la UI.
  generateAndUploadReporte(updated)
    .then((r) => updateTarea({ rowId: updated.rowId, reporteUrl: r.url }))
    .catch((err) => console.error("[reporte-auto] error:", err));

  return NextResponse.json(updated);
});
