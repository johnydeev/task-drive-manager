// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({
  requireSession: vi.fn().mockResolvedValue({ user: { email: "s@x.com", rol: "supervisor" } }),
}));

vi.mock("@/lib/consorcios", () => ({
  getConsorciosActivos: vi.fn().mockResolvedValue([
    { nombre: "ACEVEDO 1079", cuit: null },
  ]),
}));

vi.mock("@/lib/google-sheets", () => ({
  appendTarea: vi.fn().mockImplementation(async (input) => ({ rowId: "fake-id", ...input })),
  getTareas: vi.fn().mockResolvedValue([]),
}));

const baseInput = {
  objetivo: "Test",
  fechaInicio: "2026-06-16",
  fechaEstimada: "2026-06-20",
  parteComun: true,
  informe: "x",
  prioridad: "Media" as const,
};

describe("POST /api/tareas con validación de edificio canónico", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rechaza con 400 si el edificio no está en _Consorcios", async () => {
    const { POST } = await import("@/app/api/tareas/route");
    const req = new Request("http://localhost/api/tareas", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...baseInput, edificio: "EDIFICIO_FANTASMA" }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/edificio/i);
  });

  it("acepta si el edificio está en _Consorcios", async () => {
    const { POST } = await import("@/app/api/tareas/route");
    const req = new Request("http://localhost/api/tareas", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...baseInput, edificio: "ACEVEDO 1079" }),
    });
    const res = await POST(req as never);
    // Acepta el body — el status puede variar (200 o 201) según el endpoint actual.
    expect([200, 201]).toContain(res.status);
  });
});
