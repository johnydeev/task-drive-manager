import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getConsorciosActivos } from "@/lib/consorcios";
import { handleApiError, jsonError } from "@/lib/api-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireSession();
    const consorcios = await getConsorciosActivos();
    return NextResponse.json(consorcios);
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes("network")) {
      return jsonError(503, "Servicio de consorcios temporalmente no disponible");
    }
    return handleApiError(err);
  }
}
