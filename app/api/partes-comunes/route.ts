import { NextResponse } from "next/server";
import { withAuth } from "@/lib/http/withAuth";
import { withAdmin } from "@/lib/http/withAdmin";
import { getPartesComunes, appendParteComun } from "@/lib/sheets/partes-comunes";
import { jsonError } from "@/lib/api-utils";
import { parteComunNuevaSchema } from "@/lib/schemas";

export const runtime = "nodejs";

export const GET = withAuth(async () => {
  return NextResponse.json(await getPartesComunes());
});

export const POST = withAdmin(async (req) => {
  const { nombre } = parteComunNuevaSchema.parse(await req.json());
  try {
    const creado = await appendParteComun(nombre);
    return NextResponse.json({ nombre: creado }, { status: 201 });
  } catch (err) {
    return jsonError(409, err instanceof Error ? err.message : "No se pudo agregar la parte común");
  }
});
