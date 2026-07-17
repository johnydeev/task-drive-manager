import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";

type Session = Awaited<ReturnType<typeof requireAdmin>>;
type AdminHandler<Ctx> = (
  req: NextRequest,
  session: Session,
  ctx: Ctx
) => Promise<Response> | Response;

// Como withAuth pero exige rol admin: requireAdmin lanza 401 sin sesión / 403 si no es admin.
// El resto de excepciones se mapean con handleApiError (Response passthrough, ZodError→400).
export function withAdmin<Ctx = unknown>(handler: AdminHandler<Ctx>) {
  return async (req: NextRequest, ctx: Ctx): Promise<Response> => {
    try {
      const session = await requireAdmin();
      return await handler(req, session, ctx);
    } catch (err) {
      return handleApiError(err);
    }
  };
}
