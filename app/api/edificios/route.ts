import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getEdificios } from "@/lib/google-sheets";
import { handleApiError } from "@/lib/api-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireSession();
    const data = await getEdificios();
    return NextResponse.json(data);
  } catch (err) {
    return handleApiError(err);
  }
}
