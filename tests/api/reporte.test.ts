// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({
  requireSession: vi.fn().mockResolvedValue({ user: { email: "test@x.com", rol: "admin" } }),
}));

vi.mock("@/lib/google-sheets", () => {
  const fake = {
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
    estado: "Realizada",
    prioridad: "Media",
    supervisor: "test@x.com",
  };
  return {
    getTareaByRowId: vi.fn().mockResolvedValue(fake),
    updateTarea: vi.fn().mockResolvedValue(fake),
  };
});

vi.mock("@/lib/pdf-generator", () => ({
  generateAndUploadReporte: vi.fn().mockResolvedValue({
    url: "https://drive.google.com/file/d/reporte/view",
    fileId: "reporte",
  }),
}));

describe("POST /api/tareas/[id]/reporte", () => {
  beforeEach(() => vi.clearAllMocks());

  it("genera el reporte y devuelve la URL", async () => {
    const { POST } = await import("@/app/api/tareas/[id]/reporte/route");
    const req = new Request("http://localhost/api/tareas/foo/reporte", { method: "POST" });
    const res = await POST(req as never, {
      params: Promise.resolve({ id: "2026-06-14T10:00:00.000Z" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reporteUrl).toBe("https://drive.google.com/file/d/reporte/view");
  });

  it("actualiza la Sheet con la URL del reporte", async () => {
    const { POST } = await import("@/app/api/tareas/[id]/reporte/route");
    const { updateTarea } = await import("@/lib/google-sheets");
    const req = new Request("http://localhost/api/tareas/foo/reporte", { method: "POST" });
    await POST(req as never, {
      params: Promise.resolve({ id: "2026-06-14T10:00:00.000Z" }),
    });
    expect(updateTarea).toHaveBeenCalledWith(
      expect.objectContaining({ reporteUrl: "https://drive.google.com/file/d/reporte/view" })
    );
  });
});
