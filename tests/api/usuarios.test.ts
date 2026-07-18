// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const { requireSession, requireAdmin } = vi.hoisted(() => ({ requireSession: vi.fn(), requireAdmin: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireSession, requireAdmin }));
vi.mock("@/lib/google-sheets", () => ({
  getUsuarios: vi.fn(),
  getUsuarioByEmail: vi.fn(),
  appendUsuario: vi.fn(),
  setUsuarioActivo: vi.fn(),
}));

import { getUsuarios } from "@/lib/google-sheets";
import { GET } from "@/app/api/usuarios/route";
import type { Usuario } from "@/types";

const US: Usuario[] = [
  { email: "admin@x.com", nombre: "Admin", rol: "admin", activo: true, creadoEn: "" },
  { email: "op@x.com", nombre: "Operario", rol: "supervisor", activo: true, creadoEn: "" },
];

beforeEach(() => {
  requireSession.mockReset();
  vi.clearAllMocks();
  vi.mocked(getUsuarios).mockResolvedValue(US);
});

describe("GET /api/usuarios", () => {
  it("el admin recibe todos", async () => {
    requireSession.mockResolvedValue({ user: { email: "admin@x.com", rol: "admin" } });
    const res = await GET();
    expect(await res.json()).toHaveLength(2);
  });

  it("un no-admin recibe solo su propio registro", async () => {
    requireSession.mockResolvedValue({ user: { email: "op@x.com", rol: "supervisor" } });
    const res = await GET();
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].email).toBe("op@x.com");
  });
});
