// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/upload/route";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  requireSession: vi.fn().mockResolvedValue({ user: { email: "sup@x.com", rol: "supervisor" } }),
}));

vi.mock("@/lib/google-drive", () => ({
  uploadTareaFile: vi.fn(),
  trashFileByUrl: vi.fn(),
  extractFileId: vi.fn(),
  estaBajoRaiz: vi.fn(),
}));

const { uploadVisitaFoto, uploadFirma } = vi.hoisted(() => ({
  uploadVisitaFoto: vi.fn(),
  uploadFirma: vi.fn(),
}));
vi.mock("@/lib/drive-visitas", () => ({ uploadVisitaFoto, uploadFirma }));

vi.mock("@/lib/google-sheets", () => ({
  getConfiguracion: vi.fn().mockResolvedValue({
    maxImagenes: 10,
    maxVideos: 3,
    maxDocumentos: 5,
    maxSizeImagenMB: 10,
    maxSizeVideoMB: 50,
    maxSizePdfMB: 20,
    membreteNombre: "",
    membreteEmail: "",
    membreteDireccion: "",
    membreteTelefono: "",
    membreteLogoUrl: "",
  }),
}));

function req(file: File, extra: Record<string, string> = {}) {
  const form = new FormData();
  form.append("file", file);
  form.append("destino", "visita");
  form.append("edificio", "Castro Barros 1310");
  for (const [k, v] of Object.entries(extra)) form.append(k, v);
  return new NextRequest("http://localhost/api/upload", { method: "POST", body: form });
}

const archivo = (nombre: string, tipo: string, mb = 0.1) =>
  new File([new Uint8Array(Math.round(mb * 1024 * 1024))], nombre, { type: tipo });

beforeEach(() => {
  vi.clearAllMocks();
  uploadVisitaFoto.mockResolvedValue({
    fileId: "f1",
    name: "foto-01.jpg",
    url: "https://drive.google.com/file/d/f1/view",
  });
});

describe("POST /api/upload — fotos de visita", () => {
  it("sube una imagen soportada", async () => {
    const res = await POST(req(archivo("a.jpg", "image/jpeg")));
    expect(res.status).toBe(200);
    expect(uploadVisitaFoto).toHaveBeenCalled();
  });

  // HEIC es lo que saca el iPhone y el PDF no lo puede dibujar: el mensaje tiene que
  // explicar qué hacer, no devolver el mime crudo.
  it("rechaza HEIC con un mensaje accionable", async () => {
    const res = await POST(req(archivo("IMG_1.heic", "image/heic")));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/iPhone/i);
    expect(body.error).toMatch(/JPG/i);
    expect(uploadVisitaFoto).not.toHaveBeenCalled();
  });

  it("rechaza otros formatos diciendo cuáles sirven", async () => {
    const res = await POST(req(archivo("a.gif", "image/gif")));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/JPG, PNG o WEBP/);
  });

  // Antes las fotos de visita no validaban peso: una foto grande fallaba más adelante,
  // en la subida a Drive, con un error poco claro.
  it("rechaza una foto que supera el límite configurado", async () => {
    const res = await POST(req(archivo("grande.jpg", "image/jpeg", 12)));
    expect(res.status).toBe(413);
    expect((await res.json()).error).toMatch(/no puede pesar más de/i);
    expect(uploadVisitaFoto).not.toHaveBeenCalled();
  });

  it("pide el edificio, que define la carpeta destino", async () => {
    const form = new FormData();
    form.append("file", archivo("a.jpg", "image/jpeg"));
    form.append("destino", "visita");
    const res = await POST(
      new NextRequest("http://localhost/api/upload", { method: "POST", body: form })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/edificio/i);
  });
});
