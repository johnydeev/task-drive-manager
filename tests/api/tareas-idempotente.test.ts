// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/tareas/route";

vi.mock("@/lib/auth", () => ({
  requireSession: vi.fn().mockResolvedValue({ user: { email: "s@x.com", rol: "supervisor" } }),
}));
vi.mock("@/lib/consorcios", () => ({
  getConsorciosActivos: vi
    .fn()
    .mockResolvedValue([{ nombre: "Edif A", cuit: "1", nombresAlternativos: [] }]),
}));
const { appendTarea, getTareaByRowId } = vi.hoisted(() => ({
  appendTarea: vi.fn(),
  getTareaByRowId: vi.fn(),
}));
vi.mock("@/lib/google-sheets", () => ({ appendTarea, getTareaByRowId, getTareas: vi.fn() }));

const body = (extra: Record<string, unknown> = {}) => ({
  objetivo: "Pintar",
  fechaInicio: "2026-09-19",
  edificio: "Edif A",
  parteComun: false,
  dpto: "1A",
  informe: "x",
  prioridad: "Media",
  ...extra,
});
const post = (b: unknown) =>
  POST(
    new NextRequest("http://localhost/api/tareas", { method: "POST", body: JSON.stringify(b) }),
    undefined
  );

beforeEach(() => {
  appendTarea
    .mockReset()
    .mockImplementation(async (input) => ({ ...input, rowId: input.rowId ?? "nuevo" }));
  getTareaByRowId.mockReset().mockResolvedValue(null);
});

describe("POST /api/tareas — idempotencia por rowId", () => {
  it("rowId existente → 200 con la tarea existente y sin crear", async () => {
    getTareaByRowId.mockResolvedValue({ rowId: "R1", objetivo: "ya estaba" });
    const res = await post(body({ rowId: "R1" }));
    expect(res.status).toBe(200);
    expect((await res.json()).objetivo).toBe("ya estaba");
    expect(appendTarea).not.toHaveBeenCalled();
  });

  it("rowId nuevo → 201 y appendTarea recibe ese rowId", async () => {
    const res = await post(body({ rowId: "R2" }));
    expect(res.status).toBe(201);
    expect(appendTarea).toHaveBeenCalledWith(expect.objectContaining({ rowId: "R2" }), "s@x.com");
  });

  it("sin rowId → 201 como siempre, sin buscar", async () => {
    const res = await post(body());
    expect(res.status).toBe(201);
    expect(getTareaByRowId).not.toHaveBeenCalled();
  });

  it("dos POST concurrentes con el mismo rowId → una sola creación, misma tarea", async () => {
    let resolver!: (v: unknown) => void;
    appendTarea.mockImplementation(
      () =>
        new Promise((r) => {
          resolver = r;
        })
    );
    const p1 = post(body({ rowId: "R3" }));
    await new Promise((r) => setTimeout(r, 0));
    const p2 = post(body({ rowId: "R3" }));
    await new Promise((r) => setTimeout(r, 0));
    resolver({ rowId: "R3", objetivo: "creada" });
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(appendTarea).toHaveBeenCalledTimes(1);
    expect([r1.status, r2.status].sort()).toEqual([200, 201]);
    expect((await r1.json()).objetivo).toBe("creada");
    expect((await r2.json()).objetivo).toBe("creada");
  });

  it("edificio inválido con rowId → 400 y el lock queda libre", async () => {
    const res = await post(body({ rowId: "R4", edificio: "No existe" }));
    expect(res.status).toBe(400);
    expect(appendTarea).not.toHaveBeenCalled();
    const res2 = await post(body({ rowId: "R4" }));
    expect(res2.status).toBe(201);
  });
});
