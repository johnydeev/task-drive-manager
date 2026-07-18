// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const { requireSession, requireAdmin } = vi.hoisted(() => ({ requireSession: vi.fn(), requireAdmin: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireSession, requireAdmin }));
vi.mock("@/lib/sheets/directivas", () => ({
  getDirectivas: vi.fn(),
  appendDirectiva: vi.fn(),
  deleteDirectiva: vi.fn(),
  getDirectivaById: vi.fn(),
  updateDirectiva: vi.fn(),
}));
vi.mock("@/lib/google-sheets", () => ({ getUsuarios: vi.fn() }));

import { getDirectivas, appendDirectiva, getDirectivaById, updateDirectiva } from "@/lib/sheets/directivas";
import { getUsuarios } from "@/lib/google-sheets";
import { GET, POST, PATCH } from "@/app/api/directivas/route";
import type { Directiva } from "@/types";
import type { NextRequest } from "next/server";

const jsonReq = (body: unknown) =>
  new Request("http://localhost/api/directivas", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
const patchReq = (body: unknown) =>
  new Request("http://localhost/api/directivas", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;

const dir = (over: Partial<Directiva>): Directiva => ({
  id: "1", descripcion: "x", fecha: "2026-07-17", asignadoA: "op@x.com",
  creadoPor: "a@x.com", creadoEn: "1", estado: "Asignada", ...over,
});

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

describe("PATCH /api/directivas", () => {
  it("aceptar: el asignado mueve Asignada→Aceptada", async () => {
    requireSession.mockResolvedValue({ user: { email: "op@x.com", rol: "supervisor" } });
    vi.mocked(getDirectivaById).mockResolvedValue(dir({ estado: "Asignada" }));
    vi.mocked(updateDirectiva).mockResolvedValue(dir({ estado: "Aceptada" }));
    const res = await PATCH(patchReq({ id: "1", accion: "aceptar" }), undefined);
    expect(res.status).toBe(200);
    expect(vi.mocked(updateDirectiva)).toHaveBeenCalledWith("1", expect.objectContaining({ estado: "Aceptada" }));
  });

  it("aceptar: un no-asignado → 403", async () => {
    requireSession.mockResolvedValue({ user: { email: "otro@x.com", rol: "supervisor" } });
    vi.mocked(getDirectivaById).mockResolvedValue(dir({ estado: "Asignada" }));
    const res = await PATCH(patchReq({ id: "1", accion: "aceptar" }), undefined);
    expect(res.status).toBe(403);
  });

  it("cerrar: requiere nota (400)", async () => {
    requireSession.mockResolvedValue({ user: { email: "op@x.com", rol: "supervisor" } });
    vi.mocked(getDirectivaById).mockResolvedValue(dir({ estado: "Aceptada" }));
    const res = await PATCH(patchReq({ id: "1", accion: "cerrar" }), undefined);
    expect(res.status).toBe(400);
  });

  it("cerrar: con nota mueve Aceptada→Realizada", async () => {
    requireSession.mockResolvedValue({ user: { email: "op@x.com", rol: "supervisor" } });
    vi.mocked(getDirectivaById).mockResolvedValue(dir({ estado: "Aceptada" }));
    vi.mocked(updateDirectiva).mockResolvedValue(dir({ estado: "Realizada" }));
    const res = await PATCH(patchReq({ id: "1", accion: "cerrar", nota: "listo" }), undefined);
    expect(res.status).toBe(200);
    expect(vi.mocked(updateDirectiva)).toHaveBeenCalledWith("1", expect.objectContaining({ estado: "Realizada", notaCierre: "listo" }));
  });

  it("objetar: un no-admin → 403", async () => {
    requireSession.mockResolvedValue({ user: { email: "op@x.com", rol: "supervisor" } });
    vi.mocked(getDirectivaById).mockResolvedValue(dir({ estado: "Realizada", realizadaEn: new Date().toISOString() }));
    const res = await PATCH(patchReq({ id: "1", accion: "objetar", nota: "rehacer" }), undefined);
    expect(res.status).toBe(403);
  });

  it("objetar (admin): reabre Realizada→Aceptada con nota", async () => {
    requireSession.mockResolvedValue({ user: { email: "a@x.com", rol: "admin" } });
    vi.mocked(getDirectivaById).mockResolvedValue(dir({ estado: "Realizada", realizadaEn: new Date().toISOString() }));
    vi.mocked(updateDirectiva).mockResolvedValue(dir({ estado: "Aceptada" }));
    const res = await PATCH(patchReq({ id: "1", accion: "objetar", nota: "rehacer" }), undefined);
    expect(res.status).toBe(200);
    expect(vi.mocked(updateDirectiva)).toHaveBeenCalledWith("1", expect.objectContaining({ estado: "Aceptada", notaObjecion: "rehacer" }));
  });

  it("objetar fuera de plazo (ya Cerrada) → 409", async () => {
    requireSession.mockResolvedValue({ user: { email: "a@x.com", rol: "admin" } });
    // getDirectivaById ya devuelve el estado efectivo: Cerrada.
    vi.mocked(getDirectivaById).mockResolvedValue(dir({ estado: "Cerrada", realizadaEn: "2026-01-01T00:00:00.000Z" }));
    const res = await PATCH(patchReq({ id: "1", accion: "objetar", nota: "tarde" }), undefined);
    expect(res.status).toBe(409);
  });
});
