import { describe, it, expect, vi, beforeEach } from "vitest";

const { valuesGet, valuesAppend, valuesUpdate, spreadsheetsGet, batchUpdate } = vi.hoisted(() => ({
  valuesGet: vi.fn(),
  valuesAppend: vi.fn(),
  valuesUpdate: vi.fn(),
  spreadsheetsGet: vi.fn(),
  batchUpdate: vi.fn(),
}));
vi.mock("googleapis", () => ({
  google: {
    sheets: () => ({
      spreadsheets: {
        values: { get: valuesGet, append: valuesAppend, update: valuesUpdate },
        get: spreadsheetsGet,
        batchUpdate,
      },
    }),
  },
}));
vi.mock("@/lib/google-auth", () => ({ getGoogleAuth: () => ({}), getSheetId: () => "sheet-id" }));
vi.mock("@/lib/demo-mode", () => ({ isDemoMode: () => false }));

import { getAsignaciones, addAsignacion, removeAsignacion, computeSinAsignar } from "./asignaciones";
import type { Asignacion, Edificio } from "@/types";

beforeEach(() => {
  valuesGet.mockReset();
  valuesAppend.mockReset().mockResolvedValue({});
  valuesUpdate.mockReset().mockResolvedValue({});
  spreadsheetsGet.mockReset();
  batchUpdate.mockReset().mockResolvedValue({});
});
const rows = (v: string[][]) => valuesGet.mockResolvedValue({ data: { values: v } });

// Header real: edificio · edificio_cuit · email · creado_en
const HEADER = ["edificio", "edificio_cuit", "email", "creado_en"];
const asigRow = (edificio: string, email: string) => [edificio, "", email, ""];

describe("getAsignaciones", () => {
  it("lista todas y baja el email (por header)", async () => {
    rows([HEADER, asigRow("Belgrano 1429", "A@X.com"), asigRow("Garay 350", "b@x.com")]);
    const all = await getAsignaciones();
    expect(all).toEqual([
      { email: "a@x.com", edificio: "Belgrano 1429" },
      { email: "b@x.com", edificio: "Garay 350" },
    ]);
  });
  it("filtra por email", async () => {
    rows([HEADER, asigRow("Belgrano 1429", "a@x.com"), asigRow("Garay 350", "b@x.com")]);
    expect(await getAsignaciones("A@X.com")).toEqual([{ email: "a@x.com", edificio: "Belgrano 1429" }]);
  });
});

describe("addAsignacion", () => {
  it("escribe con update en la próxima fila libre (A:D), por header", async () => {
    rows([HEADER]); // solo header -> nextRow 2
    await addAsignacion("a@x.com", "Garay 350");
    expect(valuesAppend).not.toHaveBeenCalled();
    expect(valuesUpdate).toHaveBeenCalledWith(expect.objectContaining({ range: "Asignaciones!A2:D2" }));
    const values = valuesUpdate.mock.calls[0][0].requestBody.values[0];
    expect(values[0]).toBe("Garay 350"); // col edificio
    expect(values[2]).toBe("a@x.com"); // col email
  });
  it("escribe el edificio_cuit (col B) cuando se lo pasan", async () => {
    rows([HEADER]);
    await addAsignacion("a@x.com", "Garay 350", "30-11111111-1");
    const values = valuesUpdate.mock.calls[0][0].requestBody.values[0];
    expect(values[1]).toBe("30-11111111-1"); // col edificio_cuit
  });

  it("rechaza si el edificio ya está asignado a cualquier integrante (R2)", async () => {
    rows([HEADER, asigRow("Garay 350", "a@x.com")]);
    await expect(addAsignacion("b@x.com", "Garay 350")).rejects.toThrow(/ya está asignado/i);
    expect(valuesAppend).not.toHaveBeenCalled();
  });
});

describe("computeSinAsignar", () => {
  it("devuelve activos que no están en ninguna asignación (match normalizado)", () => {
    const activos: Edificio[] = [
      { nombre: "BELGRANO 1429" },
      { nombre: "GARAY 350" },
      { nombre: "NAZCA 2538" },
    ];
    const asignaciones: Asignacion[] = [{ email: "a@x.com", edificio: "Belgrano 1429" }];
    expect(computeSinAsignar(activos, asignaciones)).toEqual(["GARAY 350", "NAZCA 2538"]);
  });

  it("lista vacía si todos están asignados", () => {
    const activos: Edificio[] = [{ nombre: "GARAY 350" }];
    expect(computeSinAsignar(activos, [{ email: "a@x.com", edificio: "GARAY 350" }])).toEqual([]);
  });
});

describe("removeAsignacion", () => {
  it("borra la fila que matchea con deleteDimension", async () => {
    rows([HEADER, asigRow("Belgrano 1429", "a@x.com"), asigRow("Garay 350", "a@x.com")]);
    spreadsheetsGet.mockResolvedValue({ data: { sheets: [{ properties: { sheetId: 55, title: "Asignaciones" } }] } });
    await removeAsignacion("a@x.com", "Garay 350");
    const range = batchUpdate.mock.calls[0][0].requestBody.requests[0].deleteDimension.range;
    expect(range.sheetId).toBe(55);
    expect(range.startIndex).toBe(2); // idx 1 -> fila 3 -> 0-based 2
    expect(range.endIndex).toBe(3);
  });
});
