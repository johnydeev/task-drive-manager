// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Tarea } from "@/types";

vi.mock("@/lib/google-drive", () => ({
  uploadTareaFile: vi.fn().mockResolvedValue({
    fileId: "reporte-id",
    name: "reporte-01.pdf",
    url: "https://drive.google.com/file/d/reporte-id/view",
  }),
}));

const tareaBase: Tarea = {
  rowId: "2026-06-14T10:00:00.000Z",
  objetivo: "Pintura",
  fechaInicio: "2026-06-14",
  fechaEstimada: "2026-06-20",
  edificio: "Av. 123",
  parteComun: true,
  dpto: "Parte Común",
  informe: "Informe",
  imagenes: [],
  videos: [],
  documentos: [],
  estado: "Realizado",
  prioridad: "Media",
  supervisor: "test@x.com",
};

describe("generateAndUploadReporte", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.DEMO_MODE;
  });

  it("retorna una URL de Drive", async () => {
    const { generateAndUploadReporte } = await import("@/lib/pdf-generator");
    const result = await generateAndUploadReporte(tareaBase);
    expect(result.url).toMatch(/drive\.google\.com\/file\/d\/.+\/view/);
  }, 30000);

  it("sube el reporte a la subcarpeta Reporte de la tarea (kind=reporte)", async () => {
    const { generateAndUploadReporte } = await import("@/lib/pdf-generator");
    const { uploadTareaFile } = await import("@/lib/google-drive");
    await generateAndUploadReporte(tareaBase);
    expect(uploadTareaFile).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "reporte",
        edificio: tareaBase.edificio,
        objetivo: tareaBase.objetivo,
        ubicacion: tareaBase.dpto,
        rowId: tareaBase.rowId,
      })
    );
  }, 30000);

  it("en DEMO_MODE no llama a uploadTareaFile y devuelve URL fake", async () => {
    process.env.DEMO_MODE = "1";
    const { generateAndUploadReporte } = await import("@/lib/pdf-generator");
    const { uploadTareaFile } = await import("@/lib/google-drive");
    const result = await generateAndUploadReporte(tareaBase);
    expect(uploadTareaFile).not.toHaveBeenCalled();
    expect(result.url).toContain("demo-reporte-");
  });
});
