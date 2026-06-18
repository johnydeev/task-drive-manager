import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { appendTarea, getTareas, type TareaFilters } from "@/lib/google-sheets";
import { getConsorciosActivos } from "@/lib/consorcios";
import { handleApiError, jsonError } from "@/lib/api-utils";
import { tareaNuevaSchema } from "@/lib/schemas";
import type { EstadoTarea, Prioridad } from "@/types";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const sp = req.nextUrl.searchParams;

    const filters: TareaFilters = {
      edificio: sp.get("edificio") || undefined,
      estado: (sp.get("estado") as EstadoTarea) || undefined,
      prioridad: (sp.get("prioridad") as Prioridad) || undefined,
      supervisor: sp.get("supervisor") || undefined,
      desde: sp.get("desde") || undefined,
      hasta: sp.get("hasta") || undefined,
    };

    // Los supervisores solo ven sus propias tareas.
    if (session.user.rol !== "admin") {
      filters.supervisor = session.user.email;
    }

    const data = await getTareas(filters);
    return NextResponse.json(data);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
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
        dpto: parsed.parteComun ? "Parte Común" : (parsed.dpto ?? ""),
      },
      session.user.email
    );
    return NextResponse.json(tarea, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
