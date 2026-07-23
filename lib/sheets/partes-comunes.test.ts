import { describe, it, expect, vi, beforeEach } from "vitest";

const { valuesGet, valuesUpdate } = vi.hoisted(() => ({ valuesGet: vi.fn(), valuesUpdate: vi.fn() }));
vi.mock("googleapis", () => ({
  google: { sheets: () => ({ spreadsheets: { values: { get: valuesGet, update: valuesUpdate } } }) },
}));
vi.mock("@/lib/google-auth", () => ({ getGoogleAuth: () => ({}), getSheetId: () => "sheet-id" }));
vi.mock("@/lib/demo-mode", () => ({ isDemoMode: () => false }));

import { normalizeParteComun, getPartesComunes, appendParteComun } from "./partes-comunes";

const HEADER = ["id", "nombre"];
function rows(data: string[][]) {
  valuesGet.mockResolvedValue({ data: { values: data } });
}

beforeEach(() => {
  valuesGet.mockReset();
  valuesUpdate.mockReset().mockResolvedValue({});
});

describe("normalizeParteComun", () => {
  it("MAYÚSCULAS, trim y colapsa espacios (conserva internos)", () => {
    expect(normalizeParteComun("  pozo  de   aire y luz ")).toBe("POZO DE AIRE Y LUZ");
    expect(normalizeParteComun("terraza")).toBe("TERRAZA");
  });
});

describe("getPartesComunes", () => {
  it("lee por header y ordena", async () => {
    rows([HEADER, ["a", "TERRAZA"], ["b", "HALL"]]);
    expect(await getPartesComunes()).toEqual(["HALL", "TERRAZA"]);
  });
});

describe("appendParteComun", () => {
  it("normaliza y escribe una nueva", async () => {
    rows([HEADER, ["a", "HALL"]]);
    const creado = await appendParteComun(" terraza ");
    expect(creado).toBe("TERRAZA");
    expect(valuesUpdate).toHaveBeenCalledTimes(1);
  });
  it("rechaza duplicado (normalizado)", async () => {
    rows([HEADER, ["a", "HALL"]]);
    await expect(appendParteComun("hall")).rejects.toThrow(/ya existe/i);
    expect(valuesUpdate).not.toHaveBeenCalled();
  });
});
