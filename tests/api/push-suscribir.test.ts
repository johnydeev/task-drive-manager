// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST, DELETE } from "@/app/api/push/suscribir/route";

const { requireSession } = vi.hoisted(() => ({ requireSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireSession }));

const { upsertSuscripcion, deleteSuscripcion, getSuscripciones } = vi.hoisted(() => ({
  upsertSuscripcion: vi.fn(),
  deleteSuscripcion: vi.fn(),
  getSuscripciones: vi.fn(),
}));
vi.mock("@/lib/google-sheets", () => ({ upsertSuscripcion, deleteSuscripcion, getSuscripciones }));

const sesion = (email: string, rol: "admin" | "supervisor") => ({ user: { email, rol } });
const body = { endpoint: "https://push/abc", keys: { p256dh: "p", auth: "a" }, userAgent: "ua" };
const post = (b: unknown) =>
  POST(new NextRequest("http://localhost/api/push/suscribir", { method: "POST", body: JSON.stringify(b) }), undefined);
const del = (endpoint?: string) =>
  DELETE(
    new NextRequest(
      `http://localhost/api/push/suscribir${endpoint ? `?endpoint=${encodeURIComponent(endpoint)}` : ""}`,
      { method: "DELETE" }
    ),
    undefined
  );

beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue(sesion("s@x.com", "supervisor"));
  upsertSuscripcion.mockResolvedValue("creada");
  deleteSuscripcion.mockResolvedValue(undefined);
  getSuscripciones.mockResolvedValue([
    { id: "1", email: "s@x.com", endpoint: "https://push/mia", p256dh: "p", auth: "a", userAgent: "", creadoEn: "" },
    { id: "2", email: "otro@x.com", endpoint: "https://push/ajena", p256dh: "p", auth: "a", userAgent: "", creadoEn: "" },
  ]);
});

describe("POST /api/push/suscribir", () => {
  it("guarda la suscripción con el email de la sesión → 201", async () => {
    const res = await post(body);
    expect(res.status).toBe(201);
    expect(upsertSuscripcion).toHaveBeenCalledWith({
      email: "s@x.com",
      endpoint: "https://push/abc",
      p256dh: "p",
      auth: "a",
      userAgent: "ua",
    });
  });

  it("sin cambios → 200", async () => {
    upsertSuscripcion.mockResolvedValue("sin-cambios");
    expect((await post(body)).status).toBe(200);
  });

  it("body inválido → 400", async () => {
    const res = await post({ endpoint: "no-es-url" });
    expect(res.status).toBe(400);
    expect(upsertSuscripcion).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/push/suscribir", () => {
  it("sin endpoint → 400", async () => {
    expect((await del()).status).toBe(400);
  });

  it("propia → 200 y borra", async () => {
    const res = await del("https://push/mia");
    expect(res.status).toBe(200);
    expect(deleteSuscripcion).toHaveBeenCalledWith("https://push/mia");
  });

  it("ajena siendo supervisor → 403", async () => {
    const res = await del("https://push/ajena");
    expect(res.status).toBe(403);
    expect(deleteSuscripcion).not.toHaveBeenCalled();
  });

  it("ajena siendo admin → 200", async () => {
    requireSession.mockResolvedValue(sesion("admin@x.com", "admin"));
    expect((await del("https://push/ajena")).status).toBe(200);
    expect(deleteSuscripcion).toHaveBeenCalledWith("https://push/ajena");
  });

  it("inexistente → 200 sin borrar", async () => {
    expect((await del("https://push/zzz")).status).toBe(200);
    expect(deleteSuscripcion).not.toHaveBeenCalled();
  });
});
