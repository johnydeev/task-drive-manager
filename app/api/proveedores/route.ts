import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getProveedores } from "@/lib/proveedores";
import { handleApiError, jsonError } from "@/lib/api-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireSession();
    const proveedores = await getProveedores();
    return NextResponse.json(proveedores);
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes("network")) {
      return jsonError(503, "Servicio de proveedores temporalmente no disponible");
    }
    return handleApiError(err);
  }
}
