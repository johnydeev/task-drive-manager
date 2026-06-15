import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getDptos } from "@/lib/google-sheets";
import { handleApiError } from "@/lib/api-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireSession();
    const edificio = req.nextUrl.searchParams.get("edificio") ?? undefined;
    const data = await getDptos(edificio || undefined);
    return NextResponse.json(data);
  } catch (err) {
    return handleApiError(err);
  }
}
