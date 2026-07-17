// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ZodError } from "zod";

const { requireAdmin } = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAdmin }));

import { withAdmin } from "./withAdmin";
import type { NextRequest } from "next/server";

const req = () => new Request("http://localhost/api/x") as unknown as NextRequest;
beforeEach(() => requireAdmin.mockReset());

describe("withAdmin", () => {
  it("con admin llama al handler con la sesión", async () => {
    const session = { user: { email: "a@x.com", rol: "admin" } };
    requireAdmin.mockResolvedValue(session);
    const handler = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    const res = await withAdmin(handler)(req(), undefined);
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledWith(expect.anything(), session, undefined);
  });

  it("usa requireAdmin como guard (no requireSession)", async () => {
    requireAdmin.mockResolvedValue({ user: { email: "a@x.com", rol: "admin" } });
    await withAdmin(vi.fn().mockResolvedValue(Response.json({})))(req(), undefined);
    expect(requireAdmin).toHaveBeenCalledTimes(1);
  });

  it("si el handler lanza ZodError, responde 400", async () => {
    requireAdmin.mockResolvedValue({ user: { email: "a@x.com", rol: "admin" } });
    const res = await withAdmin(vi.fn().mockRejectedValue(new ZodError([])))(req(), undefined);
    expect(res.status).toBe(400);
  });
});
