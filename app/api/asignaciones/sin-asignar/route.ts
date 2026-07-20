import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/http/withAdmin";
import { getEdificiosSinAsignar } from "@/lib/sheets/asignaciones";

export const runtime = "nodejs";

// Edificios activos de _Consorcios que aún no están asignados a ningún integrante.
export const GET = withAdmin(async () => {
  const edificios = await getEdificiosSinAsignar();
  return NextResponse.json(edificios);
});
