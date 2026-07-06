import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/sheets-client", () => ({
  readRangeFromSpreadsheet: vi.fn(),
}));

vi.mock("@/lib/google-auth", () => ({
  getConsorciosSheetId: () => "consorcios-id",
}));

vi.mock("@/lib/demo-mode", () => ({
  isDemoMode: vi.fn().mockReturnValue(false),
}));

vi.mock("@/lib/demo-data", () => ({
  getDemoProveedores: vi.fn().mockReturnValue(["DEMO_PROVEEDOR"]),
}));

import { getProveedores, _resetProveedoresCache } from "@/lib/proveedores";
import { readRangeFromSpreadsheet } from "@/lib/sheets-client";
import { isDemoMode } from "@/lib/demo-mode";

describe("getProveedores", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isDemoMode).mockReturnValue(false);
    _resetProveedoresCache();
  });

  it("lee la primera columna de _Proveedores y ordena alfabéticamente", async () => {
    vi.mocked(readRangeFromSpreadsheet).mockResolvedValueOnce([
      ["Termo Service SRL"],
      ["Ascensores Cóndor"],
      ["Plomería 24h"],
    ]);
    const result = await getProveedores();
    expect(result).toEqual(["Ascensores Cóndor", "Plomería 24h", "Termo Service SRL"]);
    expect(readRangeFromSpreadsheet).toHaveBeenCalledWith("consorcios-id", "_Proveedores!A2:A");
  });

  it("ignora filas vacías y deduplica (case-insensitive)", async () => {
    vi.mocked(readRangeFromSpreadsheet).mockResolvedValueOnce([
      ["Pinturería del Centro"],
      [""],
      ["  Pinturería del Centro  "],
      ["PINTURERÍA DEL CENTRO"],
      ["Plomería 24h"],
    ]);
    const result = await getProveedores();
    expect(result).toEqual(["Pinturería del Centro", "Plomería 24h"]);
  });

  it("cachea la respuesta por 5 minutos", async () => {
    vi.mocked(readRangeFromSpreadsheet).mockResolvedValueOnce([["Proveedor A"]]);
    await getProveedores();
    await getProveedores();
    expect(readRangeFromSpreadsheet).toHaveBeenCalledTimes(1);
  });

  it("devuelve cache stale si la red falla", async () => {
    vi.mocked(readRangeFromSpreadsheet).mockResolvedValueOnce([["Proveedor A"]]);
    await getProveedores();
    _resetProveedoresCache({ keepStale: true });
    vi.mocked(readRangeFromSpreadsheet).mockRejectedValueOnce(new Error("network down"));
    const result = await getProveedores();
    expect(result).toEqual(["Proveedor A"]);
  });

  it("propaga error si no hay cache y la red falla", async () => {
    vi.mocked(readRangeFromSpreadsheet).mockRejectedValueOnce(new Error("network down"));
    await expect(getProveedores()).rejects.toThrow("network");
  });

  it("retorna proveedores demo si DEMO_MODE", async () => {
    vi.mocked(isDemoMode).mockReturnValue(true);
    const result = await getProveedores();
    expect(result).toEqual(["DEMO_PROVEEDOR"]);
    expect(readRangeFromSpreadsheet).not.toHaveBeenCalled();
  });
});
