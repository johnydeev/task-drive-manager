// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const { requireSession, requireAdmin } = vi.hoisted(() => ({ requireSession: vi.fn(), requireAdmin: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireSession, requireAdmin }));
vi.mock("@/lib/sheets/directivas", () => ({
  getDirectivas: vi.fn(),
  appendDirectiva: vi.fn(),
  deleteDirectiva: vi.fn(),
}));
vi.mock("@/lib/google-sheets", () => ({ getUsuarios: vi.fn() }));

import { getDirectivas, appendDirectiva } from "@/lib/sheets/directivas";
import { getUsuarios } from "@/lib/google-sheets";
import { GET, POST } from "@/app/api/directivas/route";
import type { NextRequest } from "next/server";

const jsonReq = (body: unknown) =>
  new Request("http://localhost/api/directivas", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;

beforeEach(() => {
  requireSession.mockReset();
  requireAdmin.mockReset();
  vi.clearAllMocks();
});

describe("GET /api/directivas", () => {
  it("supervisor recibe solo las suyas", async () => {
    requireSession.mockResolvedValue({ user: { email: "b@x.com", rol: "supervisor" } });
    vi.mocked(getDirectivas).mockResolvedValue([]);
    await GET(new Request("http://localhost/api/directivas") as unknown as NextRequest, undefined);
    expect(vi.mocked(getDirectivas)).toHaveBeenCalledWith("b@x.com");
  });
  it("admin recibe todas", async () => {
    requireSession.mockResolvedValue({ user: { email: "a@x.com", rol: "admin" } });
    vi.mocked(getDirectivas).mockResolvedValue([]);
    await GET(new Request("http://localhost/api/directivas") as unknown as NextRequest, undefined);
    expect(vi.mocked(getDirectivas)).toHaveBeenCalledWith();
  });
});

describe("POST /api/directivas", () => {
  it("crea si asignadoA es un usuario activo (201)", async () => {
    requireAdmin.mockResolvedValue({ user: { email: "a@x.com", rol: "admin" } });
    vi.mocked(getUsuarios).mockResolvedValue([
      { email: "op@x.com", nombre: "Op", rol: "supervisor", activo: true, creadoEn: "" },
    ]);
    vi.mocked(appendDirectiva).mockResolvedValue({
      id: "1", descripcion: "x", fecha: "2026-07-17", asignadoA: "op@x.com",
      creadoPor: "a@x.com", creadoEn: "1", estado: "Asignada",
    });
    const res = await POST(jsonReq({ descripcion: "x", fecha: "2026-07-17", asignadoA: "op@x.com" }), undefined);
    expect(res.status).toBe(201);
    expect(requireAdmin).toHaveBeenCalled();
  });

  it("rechaza si asignadoA no es usuario activo (400)", async () => {
    requireAdmin.mockResolvedValue({ user: { email: "a@x.com", rol: "admin" } });
    vi.mocked(getUsuarios).mockResolvedValue([]);
    const res = await POST(jsonReq({ descripcion: "x", fecha: "2026-07-17", asignadoA: "nadie@x.com" }), undefined);
    expect(res.status).toBe(400);
  });
});
