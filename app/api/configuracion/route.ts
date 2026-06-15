import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireSession } from "@/lib/auth";
import { getConfiguracion, updateConfiguracion } from "@/lib/google-sheets";
import { handleApiError } from "@/lib/api-utils";
import { configuracionSchema } from "@/lib/schemas";

export const runtime = "nodejs";

// GET es accesible a cualquier usuario logueado (la app necesita los límites).
export async function GET() {
  try {
    await requireSession();
    const cfg = await getConfiguracion();
    return NextResponse.json(cfg);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(req: NextRequest) {
  try {
    await requireAdmin();
    const body = await req.json();
    const parsed = configuracionSchema.parse(body);
    await updateConfiguracion(parsed);
    return NextResponse.json(parsed);
  } catch (err) {
    return handleApiError(err);
  }
}
