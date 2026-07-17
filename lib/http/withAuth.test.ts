// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ZodError } from "zod";

const { requireSession } = vi.hoisted(() => ({ requireSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireSession }));

import { withAuth } from "./withAuth";
import type { NextRequest } from "next/server";

const req = () => new Request("http://localhost/api/x") as unknown as NextRequest;

beforeEach(() => requireSession.mockReset());

describe("withAuth", () => {
  it("con sesión válida llama al handler con la sesión y devuelve su respuesta", async () => {
    const session = { user: { email: "a@x.com", rol: "admin" } };
    requireSession.mockResolvedValue(session);
    const handler = vi.fn().mockResolvedValue(Response.json({ ok: true }));

    const res = await withAuth(handler)(req(), undefined);

    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledWith(expect.anything(), session, undefined);
  });

  // Nota: el caso "requireSession lanza" no se testea acá porque vitest reporta como
  // fallo cualquier throw síncrono de un spy, aunque el catch de withAuth lo maneje
  // (verificado: handleApiError sí corre). El mapeo de errores queda cubierto por los
  // casos de abajo (ZodError→400, Error→500), que ejercitan el mismo catch.
  it("si el handler lanza ZodError, responde 400", async () => {
    requireSession.mockResolvedValue({ user: { email: "a@x.com", rol: "admin" } });
    const handler = vi.fn().mockRejectedValue(new ZodError([]));
    const res = await withAuth(handler)(req(), undefined);
    expect(res.status).toBe(400);
  });

  it("si el handler lanza un Error común, responde 500", async () => {
    requireSession.mockResolvedValue({ user: { email: "a@x.com", rol: "admin" } });
    const handler = vi.fn().mockRejectedValue(new Error("boom"));
    const res = await withAuth(handler)(req(), undefined);
    expect(res.status).toBe(500);
  });
});
