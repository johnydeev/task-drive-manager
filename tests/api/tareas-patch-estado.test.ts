// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({
  requireSession: vi.fn().mockResolvedValue({ user: { email: "test@x.com", rol: "admin" } }),
}));

vi.mock("@/lib/google-sheets", () => {
  const tarea = {
    rowId: "2026-06-14T10:00:00.000Z",
    objetivo: "Test",
    fechaInicio: "2026-06-14",
    fechaEstimada: "2026-06-20",
    edificio: "Av. 123",
    parteComun: true,
    dpto: "Parte Común",
    informe: "x",
    imagenes: [],
    videos: [],
    documentos: [],
    estado: "Pendiente",
    prioridad: "Media",
    supervisor: "test@x.com",
  };
  return {
    getTareaByRowId: vi.fn().mockResolvedValue(tarea),
    updateTarea: vi.fn().mockImplementation(async (p) => ({ ...tarea, ...p })),
  };
});

vi.mock("@/lib/pdf-generator", () => ({
  generateAndUploadReporte: vi.fn().mockResolvedValue({
    url: "https://drive.google.com/file/d/auto-reporte/view",
    fileId: "auto-reporte",
  }),
}));

describe("PATCH estado dispara generación de reporte solo si Realizado", () => {
  beforeEach(() => vi.clearAllMocks());

  it("genera reporte cuando se marca como Realizado", async () => {
    const { PATCH } = await import("@/app/api/tareas/[id]/route");
    const { generateAndUploadReporte } = await import("@/lib/pdf-generator");
    const req = new Request("http://localhost/api/tareas/foo", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ estado: "Realizado" }),
    });
    const res = await PATCH(req as never, {
      params: Promise.resolve({ id: "2026-06-14T10:00:00.000Z" }),
    });
    expect(res.status).toBe(200);
    // Fire-and-forget: esperar un tick para que se ejecute el .then encolado.
    await new Promise((r) => setTimeout(r, 100));
    expect(generateAndUploadReporte).toHaveBeenCalledTimes(1);
  });

  it("NO genera reporte si estado distinto a Realizado", async () => {
    const { PATCH } = await import("@/app/api/tareas/[id]/route");
    const { generateAndUploadReporte } = await import("@/lib/pdf-generator");
    const req = new Request("http://localhost/api/tareas/foo", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ estado: "En Proceso" }),
    });
    await PATCH(req as never, {
      params: Promise.resolve({ id: "2026-06-14T10:00:00.000Z" }),
    });
    await new Promise((r) => setTimeout(r, 100));
    expect(generateAndUploadReporte).not.toHaveBeenCalled();
  });
});
