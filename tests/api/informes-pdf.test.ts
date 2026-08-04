// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const { requireSession } = vi.hoisted(() => ({ requireSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireSession }));
vi.mock("@/lib/google-sheets", () => ({ getTareas: vi.fn(), getConfiguracion: vi.fn() }));
vi.mock("@/lib/informe-pdf", () => ({ renderInformeEdificio: vi.fn() }));

import { getTareas, getConfiguracion } from "@/lib/google-sheets";
import { renderInformeEdificio } from "@/lib/informe-pdf";
import { GET } from "@/app/api/informes/pdf/route";
import { NextRequest } from "next/server";
import { CONFIGURACION_DEFAULT } from "@/types";

const req = (qs: string) => new NextRequest(`http://localhost/api/informes/pdf${qs}`);

beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue({ user: { email: "sup@x.com", rol: "supervisor" } });
  vi.mocked(getTareas).mockResolvedValue([]);
  vi.mocked(getConfiguracion).mockResolvedValue(CONFIGURACION_DEFAULT);
  vi.mocked(renderInformeEdificio).mockResolvedValue(Buffer.from("%PDF-fake"));
});

describe("GET /api/informes/pdf", () => {
  it("devuelve el PDF como descarga con nombre normalizado", async () => {
    const res = await GET(
      req("?edificio=Av.%20Belgrano%201429&desde=2026-06-01&hasta=2026-06-30"),
      undefined
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="informe-av-belgrano-1429-2026-06-01_2026-06-30.pdf"'
    );
  });

  it("pasa el edificio y el rango al filtro de tareas", async () => {
    await GET(req("?edificio=Castro%20Barros%201310&desde=2026-06-01&hasta=2026-06-30"), undefined);
    expect(vi.mocked(getTareas).mock.calls[0][0]).toEqual({
      edificio: "Castro Barros 1310",
      desde: "2026-06-01",
      hasta: "2026-06-30",
    });
  });

  it("rechaza con 400 si falta el edificio", async () => {
    const res = await GET(req("?desde=2026-06-01"), undefined);
    expect(res.status).toBe(400);
    expect(vi.mocked(renderInformeEdificio)).not.toHaveBeenCalled();
  });

  it("es accesible para un supervisor (no es admin-only)", async () => {
    const res = await GET(req("?edificio=Castro%20Barros%201310"), undefined);
    expect(res.status).toBe(200);
  });

  it("propaga 401 si no hay sesión", async () => {
    requireSession.mockRejectedValue(
      new Response(JSON.stringify({ error: "No autenticado" }), { status: 401 })
    );
    const res = await GET(req("?edificio=Castro%20Barros%201310"), undefined);
    expect(res.status).toBe(401);
  });
});
