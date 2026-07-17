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

import { getAsignaciones, addAsignacion, removeAsignacion } from "./asignaciones";

beforeEach(() => {
  valuesGet.mockReset();
  valuesAppend.mockReset().mockResolvedValue({});
  spreadsheetsGet.mockReset();
  batchUpdate.mockReset().mockResolvedValue({});
});
const rows = (v: string[][]) => valuesGet.mockResolvedValue({ data: { values: v } });

describe("getAsignaciones", () => {
  it("lista todas y baja el email", async () => {
    rows([["A@X.com", "Belgrano 1429"], ["b@x.com", "Garay 350"]]);
    const all = await getAsignaciones();
    expect(all).toEqual([
      { email: "a@x.com", edificio: "Belgrano 1429" },
      { email: "b@x.com", edificio: "Garay 350" },
    ]);
  });
  it("filtra por email", async () => {
    rows([["a@x.com", "Belgrano 1429"], ["b@x.com", "Garay 350"]]);
    expect(await getAsignaciones("A@X.com")).toEqual([{ email: "a@x.com", edificio: "Belgrano 1429" }]);
  });
});

describe("addAsignacion", () => {
  it("agrega con append si no existe", async () => {
    rows([]);
    await addAsignacion("a@x.com", "Garay 350");
    expect(valuesAppend).toHaveBeenCalledWith(expect.objectContaining({ range: "Asignaciones!A:B" }));
  });
  it("es idempotente: no agrega si ya existe", async () => {
    rows([["a@x.com", "Garay 350"]]);
    await addAsignacion("A@X.com", "Garay 350");
    expect(valuesAppend).not.toHaveBeenCalled();
  });
});

describe("removeAsignacion", () => {
  it("borra la fila que matchea con deleteDimension", async () => {
    rows([["a@x.com", "Belgrano 1429"], ["a@x.com", "Garay 350"]]);
    spreadsheetsGet.mockResolvedValue({ data: { sheets: [{ properties: { sheetId: 55, title: "Asignaciones" } }] } });
    await removeAsignacion("a@x.com", "Garay 350");
    const range = batchUpdate.mock.calls[0][0].requestBody.requests[0].deleteDimension.range;
    expect(range.sheetId).toBe(55);
    expect(range.startIndex).toBe(2); // idx 1 -> fila 3 -> 0-based 2
    expect(range.endIndex).toBe(3);
  });
});
