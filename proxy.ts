import { auth } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo-mode";
import { NextResponse } from "next/server";

// Rutas que NO requieren auth.
const PUBLIC_PATHS = ["/login", "/api/auth"];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Permitir assets estáticos y archivos de Next.
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".") // archivos como /logo.png
  ) {
    return NextResponse.next();
  }

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  // DEMO_MODE bypasea la auth real — todos los requests cuentan como logueados.
  const isLogged = isDemoMode() || !!req.auth;

  if (!isLogged && !isPublic) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isLogged && pathname === "/login") {
    return NextResponse.redirect(new URL("/tareas", req.url));
  }

  return NextResponse.next();
});

export const config = {
  // Excluye assets, _next y las rutas que no pueden pasar por el proxy.
  //
  // ⚠ /api/upload queda AFUERA a propósito: Next 16 clona y bufferea en memoria el body
  // de todo request no-GET que pase por el proxy, con un tope
  // (`experimental.proxyClientMaxBodySize`, 10 MB por defecto). Al pasarse, corta el
  // stream SIN devolver error — el handler recibe un multipart incompleto y
  // `req.formData()` falla con "Failed to parse body as FormData". Los videos del celular
  // superan esos 10 MB siempre. La auth de esa ruta la hace el handler con requireSession().
  matcher: ["/((?!api/auth|api/upload|_next/static|_next/image|favicon.ico).*)"],
};
