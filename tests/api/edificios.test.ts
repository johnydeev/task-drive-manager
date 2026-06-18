// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({
  requireSession: vi.fn().mockResolvedValue({ user: { email: "t@x.com", rol: "supervisor" } }),
}));

vi.mock("@/lib/consorcios", () => ({
  getConsorciosActivos: vi.fn(),
}));

describe("GET /api/edificios", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retorna lista de edificios desde getConsorciosActivos", async () => {
    const { getConsorciosActivos } = await import("@/lib/consorcios");
    vi.mocked(getConsorciosActivos).mockResolvedValueOnce([
      { nombre: "ACEVEDO 1079", cuit: "11-11111111-2" },
      { nombre: "ARAOZ 192", cuit: "30-55007155-6" },
    ]);
    const { GET } = await import("@/app/api/edificios/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([
      { nombre: "ACEVEDO 1079", cuit: "11-11111111-2" },
      { nombre: "ARAOZ 192", cuit: "30-55007155-6" },
    ]);
  });

  it("retorna 503 si no hay cache y la red falla", async () => {
    const { getConsorciosActivos } = await import("@/lib/consorcios");
    vi.mocked(getConsorciosActivos).mockRejectedValueOnce(new Error("network down"));
    const { GET } = await import("@/app/api/edificios/route");
    const res = await GET();
    expect(res.status).toBe(503);
  });
});
