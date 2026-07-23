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

import { config } from "@/proxy";

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
