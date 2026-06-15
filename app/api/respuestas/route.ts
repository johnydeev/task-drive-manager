import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getRespuestasTrabajadores } from "@/lib/google-sheets";
import { handleApiError } from "@/lib/api-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
    const data = await getRespuestasTrabajadores();
    return NextResponse.json(data);
  } catch (err) {
    return handleApiError(err);
  }
}
