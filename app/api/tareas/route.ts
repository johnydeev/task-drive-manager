import { NextResponse } from "next/server";
import { withAuth } from "@/lib/http/withAuth";
import { appendTarea, getTareas, type TareaFilters } from "@/lib/google-sheets";
import { getConsorciosActivos } from "@/lib/consorcios";
import { resolveCuit } from "@/lib/edificio-cuit";
import { jsonError } from "@/lib/api-utils";
import { tareaNuevaSchema } from "@/lib/schemas";
import type { EstadoTarea, Prioridad } from "@/types";

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
    desde: sp.get("desde") || undefined,
    hasta: sp.get("hasta") || undefined,
  };

  const data = await getTareas(filters);
  return NextResponse.json(data);
});

export const POST = withAuth(async (req, session) => {
  const body = await req.json();
  const parsed = tareaNuevaSchema.parse(body);

  const consorcios = await getConsorciosActivos();
  const edificioValido = consorcios.some((c) => c.nombre === parsed.edificio);
  if (!edificioValido) {
    return jsonError(400, `Edificio "${parsed.edificio}" no es válido o no está activo`);
  }

  const tarea = await appendTarea(
    {
      ...parsed,
      // dpto es obligatorio (validado por tareaNuevaSchema): parte común específica
      // si parteComun=true, o el dpto elegido si es false.
      dpto: parsed.dpto?.trim() ?? "",
      // CUIT estable resuelto por nombre contra _Consorcios (ya cargados arriba).
      edificioCuit: resolveCuit(parsed.edificio, consorcios) ?? undefined,
    },
    session.user.email
  );
  return NextResponse.json(tarea, { status: 201 });
});
