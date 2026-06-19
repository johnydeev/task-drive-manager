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
  getDemoEdificios: vi.fn().mockReturnValue([{ nombre: "DEMO_EDIFICIO" }]),
}));

import { getConsorciosActivos, _resetCache } from "@/lib/consorcios";
import { readRangeFromSpreadsheet } from "@/lib/sheets-client";
import { isDemoMode } from "@/lib/demo-mode";

describe("getConsorciosActivos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isDemoMode).mockReturnValue(false);
    _resetCache();
  });

  it("filtra consorcios con ACTIVO=FALSE", async () => {
    vi.mocked(readRangeFromSpreadsheet).mockResolvedValueOnce([
      ["ACEVEDO 1079", "11-11111111-2", "", "", "TRUE"],
      ["BAJA 999", "11-11111111-0", "", "", "FALSE"],
      ["ACEVEDO 450", "30-71904840-0", "", "", "TRUE"],
    ]);
    const result = await getConsorciosActivos();
    expect(result.map((c) => c.nombre)).toEqual(["ACEVEDO 1079", "ACEVEDO 450"]);
  });

  it("trata como activo si la columna ACTIVO está vacía o falta", async () => {
    vi.mocked(readRangeFromSpreadsheet).mockResolvedValueOnce([
      ["ACEVEDO 1079", "11-11111111-2"],
      ["ARAOZ 192", "30-55007155-6", "", "", ""],
    ]);
    const result = await getConsorciosActivos();
    expect(result).toHaveLength(2);
  });

  it("expone cuit desde columna B", async () => {
    vi.mocked(readRangeFromSpreadsheet).mockResolvedValueOnce([
      ["ACEVEDO 1079", "11-11111111-2", "", "", "TRUE"],
    ]);
    const result = await getConsorciosActivos();
    expect(result[0]).toEqual({ nombre: "ACEVEDO 1079", cuit: "11-11111111-2" });
  });

  it("cachea la respuesta por 5 minutos", async () => {
    vi.mocked(readRangeFromSpreadsheet).mockResolvedValueOnce([
      ["ACEVEDO 1079", "11-11111111-2", "", "", "TRUE"],
    ]);
    await getConsorciosActivos();
    await getConsorciosActivos();
    expect(readRangeFromSpreadsheet).toHaveBeenCalledTimes(1);
  });

  it("devuelve cache stale si la red falla", async () => {
    vi.mocked(readRangeFromSpreadsheet).mockResolvedValueOnce([
      ["ACEVEDO 1079", "11-11111111-2", "", "", "TRUE"],
    ]);
    await getConsorciosActivos();
    _resetCache({ keepStale: true });
    vi.mocked(readRangeFromSpreadsheet).mockRejectedValueOnce(new Error("network down"));
    const result = await getConsorciosActivos();
    expect(result.map((c) => c.nombre)).toEqual(["ACEVEDO 1079"]);
  });

  it("propaga error si no hay cache y la red falla", async () => {
    vi.mocked(readRangeFromSpreadsheet).mockRejectedValueOnce(new Error("network down"));
    await expect(getConsorciosActivos()).rejects.toThrow("network");
  });

  it("retorna demo edificios si DEMO_MODE", async () => {
    vi.mocked(isDemoMode).mockReturnValue(true);
    const result = await getConsorciosActivos();
    expect(result.map((c) => c.nombre)).toEqual(["DEMO_EDIFICIO"]);
    expect(readRangeFromSpreadsheet).not.toHaveBeenCalled();
  });

  it("ignora filas vacías", async () => {
    vi.mocked(readRangeFromSpreadsheet).mockResolvedValueOnce([
      ["ACEVEDO 1079", "11-11111111-2", "", "", "TRUE"],
      ["", "", "", "", ""],
      ["ARAOZ 192", "30-55007155-6", "", "", "TRUE"],
    ]);
    const result = await getConsorciosActivos();
    expect(result.map((c) => c.nombre)).toEqual(["ACEVEDO 1079", "ARAOZ 192"]);
  });
});
