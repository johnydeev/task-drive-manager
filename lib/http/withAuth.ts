import type { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";

type Session = Awaited<ReturnType<typeof requireSession>>;

type AuthedHandler<Ctx> = (
  req: NextRequest,
  session: Session,
  ctx: Ctx
) => Promise<Response> | Response;

// Envuelve un handler de API route con la autenticación y el manejo de errores comunes:
// corre requireSession (lanza 401 si no hay sesión), pasa la sesión al handler, y mapea
// cualquier excepción con handleApiError (Response passthrough, ZodError→400, resto→500).
// Reemplaza el try/requireSession/handleApiError repetido en cada ruta.
export function withAuth<Ctx = unknown>(handler: AuthedHandler<Ctx>) {
  return async (req: NextRequest, ctx: Ctx): Promise<Response> => {
    try {
      const session = await requireSession();
      return await handler(req, session, ctx);
    } catch (err) {
      return handleApiError(err);
    }
  };
}
