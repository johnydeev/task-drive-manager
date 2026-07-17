import { describe, it, expect, vi, beforeEach } from "vitest";

const { valuesGet, valuesAppend, spreadsheetsGet, batchUpdate } = vi.hoisted(() => ({
  valuesGet: vi.fn(),
  valuesAppend: vi.fn(),
  spreadsheetsGet: vi.fn(),
  batchUpdate: vi.fn(),
}));
vi.mock("googleapis", () => ({
  google: {
    sheets: () => ({
      spreadsheets: {
        values: { get: valuesGet, append: valuesAppend, update: vi.fn() },
        get: spreadsheetsGet,
        batchUpdate,
      },
    }),
  },
}));
vi.mock("@/lib/google-auth", () => ({ getGoogleAuth: () => ({}), getSheetId: () => "sheet-id" }));
vi.mock("@/lib/demo-mode", () => ({ isDemoMode: () => false }));

import { getDirectivas, appendDirectiva, deleteDirectiva } from "./directivas";

const row = (id: string, asignadoA = "op@x.com") =>
  [id, "desc", "2026-07-17", asignadoA, "admin@x.com", id, "Asignada"];

beforeEach(() => {
  valuesGet.mockReset();
  valuesAppend.mockReset().mockResolvedValue({});
  spreadsheetsGet.mockReset();
  batchUpdate.mockReset().mockResolvedValue({});
});
const rows = (v: string[][]) => valuesGet.mockResolvedValue({ data: { values: v } });

describe("getDirectivas", () => {
  it("mapea filas y filtra por asignadoA", async () => {
    rows([row("2026-07-17T10:00:00.000Z", "op@x.com"), row("2026-07-17T11:00:00.000Z", "otro@x.com")]);
    const mias = await getDirectivas("OP@X.com");
    expect(mias).toHaveLength(1);
    expect(mias[0].asignadoA).toBe("op@x.com");
    expect(mias[0].estado).toBe("Asignada");
  });
});

describe("appendDirectiva", () => {
  it("crea con id/creadoEn y estado Asignada", async () => {
    const d = await appendDirectiva({ descripcion: "x", fecha: "2026-07-17", asignadoA: "OP@X.com" }, "ADMIN@X.com");
    expect(d.asignadoA).toBe("op@x.com");
    expect(d.creadoPor).toBe("admin@x.com");
    expect(d.estado).toBe("Asignada");
    expect(valuesAppend).toHaveBeenCalledWith(expect.objectContaining({ range: "Directivas!A:G" }));
  });
});

describe("deleteDirectiva", () => {
  it("borra la fila del id con deleteDimension", async () => {
    rows([row("2026-07-17T10:00:00.000Z"), row("2026-07-17T11:00:00.000Z")]);
    spreadsheetsGet.mockResolvedValue({ data: { sheets: [{ properties: { sheetId: 66, title: "Directivas" } }] } });
    await deleteDirectiva("2026-07-17T11:00:00.000Z");
    const range = batchUpdate.mock.calls[0][0].requestBody.requests[0].deleteDimension.range;
    expect(range.sheetId).toBe(66);
    expect(range.startIndex).toBe(2);
  });
});
