// @vitest-environment node
// El proxy (ex middleware) NO debe interceptar /api/upload.
//
// Motivo: Next 16 clona y bufferea en memoria el body de todo request no-GET que pase
// por el proxy, con un tope (`experimental.proxyClientMaxBodySize`, 10 MB por defecto).
// Pasado el tope corta el stream SIN error: el route handler recibe un multipart
// incompleto y `req.formData()` explota con "Failed to parse body as FormData".
// Como /api/upload sube videos de decenas de MB, tiene que quedar fuera del matcher.
// La auth de esa ruta la hace el propio handler con requireSession().
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: (fn: unknown) => fn }));
vi.mock("@/lib/demo-mode", () => ({ isDemoMode: () => false }));

import { NextRequest } from "next/server";
import proxy, { config } from "@/proxy";

const matches = (pathname: string) =>
  config.matcher.some((p) => new RegExp(`^${p}$`).test(pathname));

describe("matcher del proxy", () => {
  it("NO intercepta /api/upload (subidas grandes: el body no se puede buffear)", () => {
    expect(matches("/api/upload")).toBe(false);
  });

  it("NO intercepta /api/auth", () => {
    expect(matches("/api/auth/session")).toBe(false);
  });

  it("sigue interceptando las páginas de la app", () => {
    expect(matches("/tareas")).toBe(true);
    expect(matches("/edificios")).toBe(true);
  });

  it("sigue interceptando el resto de las API routes", () => {
    expect(matches("/api/tareas")).toBe(true);
    expect(matches("/api/directivas")).toBe(true);
  });
});

// El healthcheck de Docker corre DENTRO del contenedor y no tiene sesión. Si el proxy lo
// manda a /login, el Location es absoluto contra el dominio público: el fetch sale a
// internet, pasa por Cloudflare y el "estado" del contenedor termina dependiendo del
// túnel. Con el túnel caído eso se traba solo (el túnel espera a que web esté healthy).
describe("rutas públicas del proxy", () => {
  const pedir = (pathname: string) => {
    const req = new NextRequest(`http://localhost:3000${pathname}`);
    (req as unknown as { auth: null }).auth = null; // sin sesión
    return proxy(req as never, undefined as never) as Response;
  };

  it("deja pasar /api/health sin sesión (no redirige)", () => {
    const res = pedir("/api/health");
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("sigue redirigiendo al login una ruta privada sin sesión", () => {
    const res = pedir("/api/tareas");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });
});
