// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/avisos/route";
import { PATCH } from "@/app/api/avisos/leer/route";

const { requireSession } = vi.hoisted(() => ({ requireSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireSession }));

const { getAvisos, marcarLeidos } = vi.hoisted(() => ({
  getAvisos: vi.fn(),
  marcarLeidos: vi.fn(),
}));
vi.mock("@/lib/google-sheets", () => ({ getAvisos, marcarLeidos }));

const DIA = 24 * 3600 * 1000;
const aviso = (id: string, leidoEn: string | null = null) => ({
  id,
  email: "s@x.com",
  titulo: `T${id}`,
  cuerpo: "c",
  url: `/tareas/${id}`,
  tipo: "asignar" as const,
  creadoEn: "2026-09-20T10:00:00.000-03:00",
  leidoEn,
});
const get = () => GET(new NextRequest("http://localhost/api/avisos"), undefined);
const patch = () => PATCH(new NextRequest("http://localhost/api/avisos/leer", { method: "PATCH" }), undefined);

beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue({ user: { email: "s@x.com", rol: "supervisor" } });
  getAvisos.mockResolvedValue([]);
  marcarLeidos.mockResolvedValue(0);
});

describe("GET /api/avisos", () => {
  it("401 sin sesión", async () => {
    requireSession.mockRejectedValue(new Response(JSON.stringify({ error: "No autenticado" }), { status: 401 }));
    expect((await get()).status).toBe(401);
    expect(getAvisos).not.toHaveBeenCalled();
  });

  it("pide los del email de la sesión desde hace 30 días", async () => {
    const antes = Date.now();
    await get();
    const [email, opts] = getAvisos.mock.calls[0];
    expect(email).toBe("s@x.com");
    expect(opts.desde).toBeGreaterThanOrEqual(antes - 30 * DIA);
    expect(opts.desde).toBeLessThanOrEqual(Date.now() - 30 * DIA);
  });

  it("devuelve tope 50 y cuenta los no leídos sobre esos", async () => {
    const muchos = Array.from({ length: 60 }, (_, i) => aviso(String(i), i % 2 === 0 ? null : "2026-09-20T11:00:00.000-03:00"));
    getAvisos.mockResolvedValue(muchos);
    const body = await (await get()).json();
    expect(body.avisos).toHaveLength(50);
    expect(body.avisos[0].id).toBe("0");
    expect(body.noLeidos).toBe(25);
  });
});

describe("PATCH /api/avisos/leer", () => {
  it("401 sin sesión", async () => {
    requireSession.mockRejectedValue(new Response(JSON.stringify({ error: "No autenticado" }), { status: 401 }));
    expect((await patch()).status).toBe(401);
    expect(marcarLeidos).not.toHaveBeenCalled();
  });

  it("marca los del email de la sesión y devuelve cuántos", async () => {
    marcarLeidos.mockResolvedValue(3);
    const res = await patch();
    expect(marcarLeidos).toHaveBeenCalledWith("s@x.com");
    expect(await res.json()).toEqual({ ok: true, marcados: 3 });
  });
});
