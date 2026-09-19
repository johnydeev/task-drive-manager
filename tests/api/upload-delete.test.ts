// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import { DELETE } from "@/app/api/upload/route";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  requireSession: vi.fn().mockResolvedValue({ user: { email: "sup@x.com", rol: "supervisor" } }),
}));

const { isDemoMode } = vi.hoisted(() => ({ isDemoMode: vi.fn(() => false) }));
vi.mock("@/lib/demo-mode", () => ({ isDemoMode }));

const { trashFileByUrl, estaBajoRaiz } = vi.hoisted(() => ({
  trashFileByUrl: vi.fn(),
  estaBajoRaiz: vi.fn(),
}));
vi.mock("@/lib/google-drive", () => ({
  uploadTareaFile: vi.fn(),
  trashFileByUrl,
  estaBajoRaiz,
  // Implementación real mínima: la ruta la usa para validar la url.
  extractFileId: (url: string) => url.match(/\/file\/d\/([^/]+)/)?.[1] ?? null,
}));

const { cargarReferencias, estaReferenciado } = vi.hoisted(() => ({
  cargarReferencias: vi.fn(),
  estaReferenciado: vi.fn(),
}));
vi.mock("@/lib/archivo-referencias", () => ({ cargarReferencias, estaReferenciado }));

vi.mock("@/lib/drive-visitas", () => ({ uploadVisitaFoto: vi.fn(), uploadFirma: vi.fn() }));
vi.mock("@/lib/google-sheets", () => ({ getConfiguracion: vi.fn() }));

const URL_OK = "https://drive.google.com/file/d/abc123/view";
const req = (url?: string) =>
  new NextRequest(`http://localhost/api/upload${url ? `?url=${encodeURIComponent(url)}` : ""}`, {
    method: "DELETE",
  });

beforeEach(() => {
  isDemoMode.mockReturnValue(false);
  trashFileByUrl.mockReset().mockResolvedValue(undefined);
  estaBajoRaiz.mockReset().mockResolvedValue(true);
  cargarReferencias.mockReset().mockResolvedValue({ tareas: [], visitas: [], usuarios: [] });
  estaReferenciado.mockReset().mockReturnValue(false);
});

describe("DELETE /api/upload", () => {
  it("sin url → 400", async () => {
    const res = await DELETE(req());
    expect(res.status).toBe(400);
    expect(trashFileByUrl).not.toHaveBeenCalled();
  });

  it("url que no es un archivo de Drive → 400", async () => {
    const res = await DELETE(req("https://otro.host/x.png"));
    expect(res.status).toBe(400);
    expect(trashFileByUrl).not.toHaveBeenCalled();
  });

  it("Drive responde 404 → 404, sin papelera", async () => {
    estaBajoRaiz.mockRejectedValue(Object.assign(new Error("nf"), { code: "404" }));
    const res = await DELETE(req(URL_OK));
    expect(res.status).toBe(404);
    expect(trashFileByUrl).not.toHaveBeenCalled();
  });

  it("archivo fuera de la raíz → 403, sin papelera ni lectura de referencias", async () => {
    estaBajoRaiz.mockResolvedValue(false);
    const res = await DELETE(req(URL_OK));
    expect(res.status).toBe(403);
    expect(cargarReferencias).not.toHaveBeenCalled();
    expect(trashFileByUrl).not.toHaveBeenCalled();
  });

  it("archivo referenciado por una fila → 409, sin papelera", async () => {
    estaReferenciado.mockReturnValue(true);
    const res = await DELETE(req(URL_OK));
    expect(res.status).toBe(409);
    expect(estaReferenciado).toHaveBeenCalledWith("abc123", expect.anything());
    expect(trashFileByUrl).not.toHaveBeenCalled();
  });

  it("archivo huérfano bajo la raíz → 200 y manda a papelera", async () => {
    const res = await DELETE(req(URL_OK));
    expect(res.status).toBe(200);
    expect(estaBajoRaiz).toHaveBeenCalledWith("abc123");
    expect(trashFileByUrl).toHaveBeenCalledWith(URL_OK);
  });

  it("en demo → 200 sin chequear Drive ni la Sheet", async () => {
    isDemoMode.mockReturnValue(true);
    const res = await DELETE(req(URL_OK));
    expect(res.status).toBe(200);
    expect(estaBajoRaiz).not.toHaveBeenCalled();
    expect(cargarReferencias).not.toHaveBeenCalled();
    expect(trashFileByUrl).toHaveBeenCalledWith(URL_OK);
  });
});
