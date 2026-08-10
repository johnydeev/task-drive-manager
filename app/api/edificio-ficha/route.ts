import { NextResponse } from "next/server";
import { withAuth } from "@/lib/http/withAuth";
import { getEdificioFicha } from "@/lib/google-sheets";
import { jsonError } from "@/lib/api-utils";

export const runtime = "nodejs";

// Datos fijos del consorcio, para precargar el formulario de visita.
export const GET = withAuth(async (req) => {
  const edificio = req.nextUrl.searchParams.get("edificio")?.trim();
  if (!edificio) return jsonError(400, "Falta el parámetro edificio");
  return NextResponse.json(await getEdificioFicha(edificio));
});
