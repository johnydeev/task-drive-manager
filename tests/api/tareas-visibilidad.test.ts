// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const { requireSession, requireAdmin } = vi.hoisted(() => ({ requireSession: vi.fn(), requireAdmin: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireSession, requireAdmin }));
vi.mock("@/lib/google-sheets", () => ({
  getTareas: vi.fn(),
  appendTarea: vi.fn(),
  getTareaByRowId: vi.fn(),
  updateTarea: vi.fn(),
  deleteTarea: vi.fn(),
}));
vi.mock("@/lib/consorcios", () => ({ getConsorciosActivos: vi.fn() }));
vi.mock("@/lib/google-drive", () => ({ trashTareaFolder: vi.fn() }));
vi.mock("@/lib/pdf-generator", () => ({ generateAndUploadReporte: vi.fn() }));

import { getTareas, getTareaByRowId } from "@/lib/google-sheets";
import { GET as GET_LISTA } from "@/app/api/tareas/route";
import { GET as GET_DETALLE } from "@/app/api/tareas/[id]/route";
import { NextRequest } from "next/server";
import type { Tarea } from "@/types";

const req = () => new NextRequest("http://localhost/api/tareas");
const tarea = (over: Partial<Tarea> = {}): Tarea => ({
  rowId: "2026-07-16T10:00:00.000Z", objetivo: "x", fechaInicio: "2026-07-16", fechaEstimada: "2026-07-20",
  edificio: "Edif A", parteComun: false, dpto: "1A", informe: "", imagenes: [], videos: [], documentos: [],
  estado: "Pendiente", prioridad: "Media", supervisor: "creador@x.com", ...over,
});

beforeEach(() => {
  requireSession.mockReset();
  requireAdmin.mockReset();
  vi.clearAllMocks();
});

describe("visibilidad de tareas", () => {
  it("un supervisor ve TODAS las tareas (getTareas sin filtro por creador)", async () => {
    requireSession.mockResolvedValue({ user: { email: "sup@x.com", rol: "supervisor" } });
    vi.mocked(getTareas).mockResolvedValue([]);
    await GET_LISTA(req(), undefined);
    const filtros = vi.mocked(getTareas).mock.calls[0][0];
    expect(filtros?.supervisor).toBeUndefined();
  });

  it("el detalle de una tarea es legible por un supervisor que no la creó (200, no 403)", async () => {
    requireSession.mockResolvedValue({ user: { email: "otro@x.com", rol: "supervisor" } });
    vi.mocked(getTareaByRowId).mockResolvedValue(tarea({ supervisor: "creador@x.com" }));
    const res = await GET_DETALLE(
      new Request("http://localhost/api/tareas/x") as unknown as NextRequest,
      { params: Promise.resolve({ id: "2026-07-16T10:00:00.000Z" }) }
    );
    expect(res.status).toBe(200);
  });
});
