// @vitest-environment node
import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  it("devuelve 200 con status ok", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok" });
  });

  it("no requiere autenticación (responde sin sesión)", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
  });
});
