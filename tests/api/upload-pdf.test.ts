// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/upload/route";

vi.mock("@/lib/auth", () => ({
  requireSession: vi.fn().mockResolvedValue({ user: { email: "test@x.com", rol: "admin" } }),
}));

vi.mock("@/lib/google-drive", () => ({
  uploadTareaFile: vi.fn().mockResolvedValue({
    fileId: "fake-id",
    name: "documento-01.pdf",
    url: "https://drive.google.com/file/d/fake-id/view",
  }),
}));

vi.mock("@/lib/google-sheets", () => ({
  getConfiguracion: vi.fn().mockResolvedValue({
    maxImagenes: 10,
    maxVideos: 3,
    maxDocumentos: 5,
    maxSizeImagenMB: 10,
    maxSizeVideoMB: 100,
    maxSizePdfMB: 20,
  }),
}));

function makeRequest(file: File): Request {
  const form = new FormData();
  form.append("file", file);
  form.append("edificio", "Av. 123");
  form.append("objetivo", "Test");
  form.append("dpto", "3A");
  form.append("rowId", "2026-07-05T18:00:00.000Z");
  return new Request("http://localhost/api/upload", { method: "POST", body: form });
}

describe("POST /api/upload con PDF", () => {
  beforeEach(() => vi.clearAllMocks());

  it("acepta application/pdf y retorna kind=documento", async () => {
    const pdfHeader = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
    const file = new File([pdfHeader], "doc.pdf", { type: "application/pdf" });
    const res = await POST(makeRequest(file) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.kind).toBe("documento");
    expect(body.url).toContain("drive.google.com");
  });

  it("rechaza PDF que excede maxSizePdfMB", async () => {
    const bigBytes = new Uint8Array(25 * 1024 * 1024); // 25MB > 20MB default
    const file = new File([bigBytes], "big.pdf", { type: "application/pdf" });
    const res = await POST(makeRequest(file) as never);
    expect(res.status).toBe(413);
  });

  it("sigue aceptando imágenes con kind=imagen", async () => {
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], "img.jpg", { type: "image/jpeg" });
    const res = await POST(makeRequest(file) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.kind).toBe("imagen");
  });
});
