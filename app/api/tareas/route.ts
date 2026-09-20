import { NextResponse } from "next/server";
import { withAuth } from "@/lib/http/withAuth";
import { appendTarea, getTareaByRowId, getTareas, type TareaFilters } from "@/lib/google-sheets";
import { getConsorciosActivos } from "@/lib/consorcios";
import { resolveCuit } from "@/lib/edificio-cuit";
import { jsonError } from "@/lib/api-utils";
import { tareaNuevaSchema } from "@/lib/schemas";
import type { EstadoTarea, Prioridad, Tarea } from "@/types";

export const runtime = "nodejs";

export const GET = withAuth(async (req) => {
  const sp = req.nextUrl.searchParams;

  // Las tareas de edificio son trabajo operativo compartido: todos los integrantes
  // (admin y supervisores) ven todas. El filtro por `supervisor` queda disponible solo
  // como filtro opcional por query param (ej. para el admin), no como restricción de rol.
  const filters: TareaFilters = {
    edificio: sp.get("edificio") || undefined,
    estado: (sp.get("estado") as EstadoTarea) || undefined,
    prioridad: (sp.get("prioridad") as Prioridad) || undefined,
    supervisor: sp.get("supervisor") || undefined,
    asignado: sp.get("asignado") || undefined,
    sinAsignar: sp.get("sinAsignar") === "1" || undefined,
    desde: sp.get("desde") || undefined,
    hasta: sp.get("hasta") || undefined,
  };

  const data = await getTareas(filters);
  return NextResponse.json(data);
});

// Un mismo rowId puede llegar dos veces (sync in-page y Background Sync del SW sobre la
// misma cola, doble tap, reintento tras timeout). La primera crea; las demás reciben la
// misma tarea. El lock cubre la ventana entre "no existe" y "ya escribí".
const creandoPorRowId = new Map<string, Promise<Tarea>>();

export const POST = withAuth(async (req, session) => {
  const parsed = tareaNuevaSchema.parse(await req.json());
  const rowId = parsed.rowId?.trim();

  if (rowId) {
    const existente = await getTareaByRowId(rowId);
    if (existente) return NextResponse.json(existente, { status: 200 });
    const enCurso = creandoPorRowId.get(rowId);
    if (enCurso) return NextResponse.json(await enCurso, { status: 200 });
  }

  const crear = async (): Promise<Tarea> => {
    const consorcios = await getConsorciosActivos();
    if (!consorcios.some((c) => c.nombre === parsed.edificio)) {
      throw jsonError(400, `Edificio "${parsed.edificio}" no es válido o no está activo`);
    }
    return appendTarea(
      {
        ...parsed,
        // fechaEstimada es opcional: se guarda "" si no se cargó.
        fechaEstimada: parsed.fechaEstimada ?? "",
        // dpto es obligatorio (validado por tareaNuevaSchema): parte común específica
        // si parteComun=true, o el dpto elegido si es false.
        dpto: parsed.dpto?.trim() ?? "",
        // CUIT estable resuelto por nombre contra _Consorcios (ya cargados arriba).
        edificioCuit: resolveCuit(parsed.edificio, consorcios) ?? undefined,
      },
      session.user.email
    );
  };

  if (!rowId) return NextResponse.json(await crear(), { status: 201 });

  const p = crear().finally(() => creandoPorRowId.delete(rowId));
  creandoPorRowId.set(rowId, p);
  return NextResponse.json(await p, { status: 201 });
});
