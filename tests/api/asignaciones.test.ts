// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const { requireSession, requireAdmin } = vi.hoisted(() => ({ requireSession: vi.fn(), requireAdmin: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireSession, requireAdmin }));
vi.mock("@/lib/sheets/asignaciones", () => ({
  getAsignaciones: vi.fn(),
  addAsignacion: vi.fn(),
  removeAsignacion: vi.fn(),
}));
vi.mock("@/lib/consorcios", () => ({ getConsorciosActivos: vi.fn() }));

import { getAsignaciones, addAsignacion } from "@/lib/sheets/asignaciones";
import { getConsorciosActivos } from "@/lib/consorcios";
import { GET, POST } from "@/app/api/asignaciones/route";
import type { NextRequest } from "next/server";

const getReq = () => new Request("http://localhost/api/asignaciones") as unknown as NextRequest;
const postReq = (body: unknown) =>
  new Request("http://localhost/api/asignaciones", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;

beforeEach(() => {
  requireSession.mockReset();
  requireAdmin.mockReset();
  vi.clearAllMocks();
});

describe("GET /api/asignaciones", () => {
  it("admin recibe todas (sin filtro)", async () => {
    requireSession.mockResolvedValue({ user: { email: "a@x.com", rol: "admin" } });
    vi.mocked(getAsignaciones).mockResolvedValue([{ email: "b@x.com", edificio: "Garay 350" }]);
    const res = await GET(getReq(), undefined);
    expect(res.status).toBe(200);
    expect(vi.mocked(getAsignaciones)).toHaveBeenCalledWith();
  });
  it("supervisor recibe solo las suyas", async () => {
    requireSession.mockResolvedValue({ user: { email: "b@x.com", rol: "supervisor" } });
    vi.mocked(getAsignaciones).mockResolvedValue([]);
    await GET(getReq(), undefined);
    expect(vi.mocked(getAsignaciones)).toHaveBeenCalledWith("b@x.com");
  });
});

describe("POST /api/asignaciones", () => {
  it("admin agrega si el edificio es válido (201)", async () => {
    requireAdmin.mockResolvedValue({ user: { email: "a@x.com", rol: "admin" } });
    vi.mocked(getConsorciosActivos).mockResolvedValue([{ nombre: "Garay 350", cuit: null, nombresAlternativos: [] }]);
    vi.mocked(addAsignacion).mockResolvedValue({ email: "b@x.com", edificio: "Garay 350" });
    const res = await POST(postReq({ email: "b@x.com", edificio: "Garay 350" }), undefined);
    expect(res.status).toBe(201);
    expect(requireAdmin).toHaveBeenCalled();
  });

  it("rechaza edificio inexistente en _Consorcios (400)", async () => {
    requireAdmin.mockResolvedValue({ user: { email: "a@x.com", rol: "admin" } });
    vi.mocked(getConsorciosActivos).mockResolvedValue([]);
    const res = await POST(postReq({ email: "b@x.com", edificio: "No Existe" }), undefined);
    expect(res.status).toBe(400);
  });
});
