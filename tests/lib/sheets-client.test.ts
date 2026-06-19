import { describe, expect, it, vi, beforeEach } from "vitest";

const valuesGet = vi.fn();

vi.mock("googleapis", () => ({
  google: {
    sheets: () => ({ spreadsheets: { values: { get: valuesGet } } }),
    auth: { JWT: vi.fn() },
  },
}));

vi.mock("@/lib/google-auth", () => ({
  getGoogleAuth: () => ({}),
  getSheetId: () => "main-sheet-id",
  getConsorciosSheetId: () => "consorcios-sheet-id",
}));

describe("readRangeFromSpreadsheet", () => {
  beforeEach(() => valuesGet.mockReset());

  it("usa el spreadsheetId pasado como parámetro", async () => {
    const { readRangeFromSpreadsheet } = await import("@/lib/sheets-client");
    valuesGet.mockResolvedValueOnce({
      data: { values: [["ACEVEDO 1079", "11-11111111-2"]] },
    });
    const rows = await readRangeFromSpreadsheet("master-sheet-id", "_Consorcios!A2:E");
    expect(valuesGet).toHaveBeenCalledWith(
      expect.objectContaining({
        spreadsheetId: "master-sheet-id",
        range: "_Consorcios!A2:E",
      })
    );
    expect(rows).toEqual([["ACEVEDO 1079", "11-11111111-2"]]);
  });

  it("retorna array vacío si values es undefined", async () => {
    const { readRangeFromSpreadsheet } = await import("@/lib/sheets-client");
    valuesGet.mockResolvedValueOnce({ data: {} });
    const rows = await readRangeFromSpreadsheet("any-id", "any!A:Z");
    expect(rows).toEqual([]);
  });
});
