// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const { requireSession } = vi.hoisted(() => ({ requireSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireSession }));
vi.mock("@/lib/google-sheets", () => ({
  getVisitas: vi.fn(),
  getVisitaById: vi.fn(),
  appendVisita: vi.fn(),
  deleteVisita: vi.fn(),
  getEdificioFicha: vi.fn(),
  guardarEdificioFicha: vi.fn(),
  getConfiguracion: vi.fn(),
  getUsuarios: vi.fn(),
}));
vi.mock("@/lib/visita-pdf", () => ({ generarYSubirVisitaPdf: vi.fn() }));
vi.mock("@/lib/google-drive", () => ({ trashFileByUrl: vi.fn() }));

import {
  getVisitas,
  getVisitaById,
  appendVisita,
  deleteVisita,
  getEdificioFicha,
  guardarEdificioFicha,
  getConfiguracion,
  getUsuarios,
} from "@/lib/google-sheets";
import { generarYSubirVisitaPdf } from "@/lib/visita-pdf";
import { trashFileByUrl } from "@/lib/google-drive";
import { GET, POST } from "@/app/api/visitas/route";
import { DELETE } from "@/app/api/visitas/[id]/route";
import { NextRequest } from "next/server";
import { CONFIGURACION_DEFAULT, EDIFICIO_FICHA_VACIA } from "@/types";

const PDF_URL = "https://drive.google.com/file/d/pdf1/view";
const post = (body: unknown) =>
  new NextRequest("http://localhost/api/visitas", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue({ user: { email: "sup@x.com", rol: "supervisor" } });
  vi.mocked(getVisitas).mockResolvedValue([]);
  vi.mocked(getConfiguracion).mockResolvedValue(CONFIGURACION_DEFAULT);
  vi.mocked(getUsuarios).mockResolvedValue([
    { email: "sup@x.com", nombre: "Supervisor Uno", rol: "supervisor", activo: true, creadoEn: "" },
  ]);
  vi.mocked(getEdificioFicha).mockResolvedValue({
    edificio: "Castro Barros 1310",
    ...EDIFICIO_FICHA_VACIA,
  });
  vi.mocked(generarYSubirVisitaPdf).mockResolvedValue({ url: PDF_URL, fileId: "pdf1" });
  vi.mocked(appendVisita).mockImplementation(async (i) => ({
    id: "1",
    edificio: i.edificio,
    fecha: "2026-08-08",
    pdfUrl: i.pdfUrl,
    supervisor: i.supervisor,
    creadoEn: "2026-08-08T10:00:00-03:00",
  }));
});

describe("GET /api/visitas", () => {
  it("lista todas las visitas", async () => {
    await GET(new NextRequest("http://localhost/api/visitas"), undefined);
    expect(getVisitas).toHaveBeenCalledWith(undefined);
  });

  it("filtra por edificio cuando viene el query param", async () => {
    await GET(
      new NextRequest("http://localhost/api/visitas?edificio=Castro%20Barros%201310"),
      undefined
    );
    expect(getVisitas).toHaveBeenCalledWith("Castro Barros 1310");
  });
});

describe("POST /api/visitas", () => {
  it("genera el PDF, escribe la fila y guarda la ficha", async () => {
    const res = await POST(
      post({
        edificio: "Castro Barros 1310",
        ficha: { encargado: "Juan" },
        controles: { hall: "Realizada" },
        informeGeneral: "ok",
        fotos: [],
      }),
      undefined
    );
    expect(res.status).toBe(201);
    expect(generarYSubirVisitaPdf).toHaveBeenCalled();
    expect(appendVisita).toHaveBeenCalledWith(
      expect.objectContaining({
        edificio: "Castro Barros 1310",
        pdfUrl: PDF_URL,
        supervisor: "sup@x.com",
      })
    );
    expect(guardarEdificioFicha).toHaveBeenCalledWith(
      "Castro Barros 1310",
      expect.objectContaining({ encargado: "Juan" })
    );
  });

  it("usa el nombre del usuario para la firma del PDF", async () => {
    await POST(post({ edificio: "Castro Barros 1310" }), undefined);
    const args = vi.mocked(generarYSubirVisitaPdf).mock.calls[0][0];
    expect(args.supervisorNombre).toBe("Supervisor Uno");
  });

  it("NO escribe la fila si falla la generación del PDF", async () => {
    vi.mocked(generarYSubirVisitaPdf).mockRejectedValue(new Error("boom"));
    const res = await POST(post({ edificio: "Castro Barros 1310" }), undefined);
    expect(res.status).toBe(500);
    expect(appendVisita).not.toHaveBeenCalled();
    expect(guardarEdificioFicha).not.toHaveBeenCalled();
  });

  it("rechaza sin edificio", async () => {
    const res = await POST(post({ controles: {} }), undefined);
    expect(res.status).toBe(400);
    expect(generarYSubirVisitaPdf).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/visitas/[id]", () => {
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
  const req = () => new NextRequest("http://localhost/api/visitas/1", { method: "DELETE" });

  it("un admin borra la fila y manda el PDF a la papelera", async () => {
    requireSession.mockResolvedValue({ user: { email: "admin@x.com", rol: "admin" } });
    vi.mocked(getVisitaById).mockResolvedValue({
      id: "1",
      edificio: "A",
      fecha: "2026-08-08",
      pdfUrl: PDF_URL,
      supervisor: "sup@x.com",
      creadoEn: "2026-08-08",
    });
    const res = await DELETE(req(), ctx("1"));
    expect(res.status).toBe(200);
    expect(trashFileByUrl).toHaveBeenCalledWith(PDF_URL);
    expect(deleteVisita).toHaveBeenCalledWith("1");
  });

  it("un supervisor recibe 403 y no borra nada", async () => {
    requireSession.mockResolvedValue({ user: { email: "sup@x.com", rol: "supervisor" } });
    const res = await DELETE(req(), ctx("1"));
    expect(res.status).toBe(403);
    expect(deleteVisita).not.toHaveBeenCalled();
    expect(trashFileByUrl).not.toHaveBeenCalled();
  });

  it("404 si la visita no existe", async () => {
    requireSession.mockResolvedValue({ user: { email: "admin@x.com", rol: "admin" } });
    vi.mocked(getVisitaById).mockResolvedValue(null);
    const res = await DELETE(req(), ctx("9"));
    expect(res.status).toBe(404);
  });
});
