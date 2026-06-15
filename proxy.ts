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
  // Excluye assets y _next.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
