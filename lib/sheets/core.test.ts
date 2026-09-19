// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { valuesGet, valuesUpdate, batchUpdate, spreadsheetsGet } = vi.hoisted(() => ({
  valuesGet: vi.fn(),
  valuesUpdate: vi.fn(),
  batchUpdate: vi.fn(),
  spreadsheetsGet: vi.fn(),
}));
vi.mock("googleapis", () => ({
  google: {
    sheets: () => ({
      spreadsheets: {
        values: { get: valuesGet, update: valuesUpdate },
        get: spreadsheetsGet,
        batchUpdate,
      },
    }),
  },
}));
vi.mock("@/lib/google-auth", () => ({ getGoogleAuth: () => ({}), getSheetId: () => "sheet-id" }));

import { readRange, writeRange, deleteRows, invalidarHoja, resetSheetsCache, hojaDeRango } from "./core";

const filas = (...v: string[]) => ({ data: { values: v.map((x) => [x]) } });
const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { code: String(status) });

beforeEach(() => {
  vi.stubEnv("SHEETS_CACHE_TTL_MS", "30000");
  resetSheetsCache();
  valuesGet.mockReset();
  valuesUpdate.mockReset().mockResolvedValue({});
  batchUpdate.mockReset().mockResolvedValue({});
  spreadsheetsGet.mockReset().mockResolvedValue({
    data: { sheets: [{ properties: { sheetId: 77, title: "Tareas" } }] },
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("hojaDeRango", () => {
  it("extrae el nombre sin comillas", () => {
    expect(hojaDeRango("Tareas!A:AD")).toBe("Tareas");
    expect(hojaDeRango("'Partes Comunes'!A:B")).toBe("Partes Comunes");
    expect(hojaDeRango("Partes Comunes!A2:B")).toBe("Partes Comunes");
  });
});

describe("readRange con cache", () => {
  it("la segunda lectura del mismo rango no llama a Google", async () => {
    valuesGet.mockResolvedValue(filas("a"));
    expect(await readRange("Tareas!A:B")).toEqual([["a"]]);
    expect(await readRange("Tareas!A:B")).toEqual([["a"]]);
    expect(valuesGet).toHaveBeenCalledTimes(1);
  });

  it("un rango distinto sí llama", async () => {
    valuesGet.mockResolvedValue(filas("a"));
    await readRange("Tareas!A:B");
    await readRange("Tareas!A:A");
    expect(valuesGet).toHaveBeenCalledTimes(2);
  });

  it("vencido el TTL vuelve a llamar", async () => {
    vi.useFakeTimers();
    valuesGet.mockResolvedValueOnce(filas("a")).mockResolvedValueOnce(filas("b"));
    await readRange("Tareas!A:B");
    vi.advanceTimersByTime(30_001);
    expect(await readRange("Tareas!A:B")).toEqual([["b"]]);
    expect(valuesGet).toHaveBeenCalledTimes(2);
  });

  it("dos lecturas concurrentes del mismo rango comparten una llamada", async () => {
    valuesGet.mockResolvedValue(filas("a"));
    const [x, y] = await Promise.all([readRange("Tareas!A:B"), readRange("Tareas!A:B")]);
    expect(x).toBe(y);
    expect(valuesGet).toHaveBeenCalledTimes(1);
  });

  it("con TTL 0 cada lectura llama a Google", async () => {
    vi.stubEnv("SHEETS_CACHE_TTL_MS", "0");
    valuesGet.mockResolvedValue(filas("a"));
    await readRange("Tareas!A:B");
    await readRange("Tareas!A:B");
    expect(valuesGet).toHaveBeenCalledTimes(2);
  });

  it("devuelve [] cuando Google no manda values", async () => {
    valuesGet.mockResolvedValue({ data: {} });
    expect(await readRange("Tareas!A:B")).toEqual([]);
  });
});

describe("writeRange", () => {
  it("llama a update con USER_ENTERED e invalida solo su hoja", async () => {
    valuesGet.mockResolvedValue(filas("a"));
    await readRange("Tareas!A:B");
    await readRange("Usuarios!A:G");
    await writeRange("Tareas!A5:B5", [["x", "y"]]);
    expect(valuesUpdate).toHaveBeenCalledWith({
      spreadsheetId: "sheet-id",
      range: "Tareas!A5:B5",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [["x", "y"]] },
    });
    await readRange("Tareas!A:B"); // miss
    await readRange("Usuarios!A:G"); // hit
    expect(valuesGet).toHaveBeenCalledTimes(3);
  });

  it("si la escritura falla, el cache queda intacto", async () => {
    valuesGet.mockResolvedValue(filas("a"));
    await readRange("Tareas!A:B");
    valuesUpdate.mockRejectedValue(httpError(400));
    await expect(writeRange("Tareas!A5:B5", [["x"]])).rejects.toThrow("HTTP 400");
    await readRange("Tareas!A:B");
    expect(valuesGet).toHaveBeenCalledTimes(1);
  });
});

describe("deleteRows", () => {
  it("arma un deleteDimension por fila, en orden descendente, e invalida la hoja", async () => {
    valuesGet.mockResolvedValue(filas("a"));
    await readRange("Tareas!A:B");
    await deleteRows("Tareas", [3, 10, 5]);
    const requests = batchUpdate.mock.calls[0][0].requestBody.requests;
    expect(
      requests.map((r: { deleteDimension: { range: { startIndex: number } } }) => r.deleteDimension.range.startIndex)
    ).toEqual([9, 4, 2]);
    expect(requests[0].deleteDimension.range).toEqual({
      sheetId: 77,
      dimension: "ROWS",
      startIndex: 9,
      endIndex: 10,
    });
    await readRange("Tareas!A:B");
    expect(valuesGet).toHaveBeenCalledTimes(2);
  });

  it("con lista vacía no llama a Google", async () => {
    await deleteRows("Tareas", []);
    expect(batchUpdate).not.toHaveBeenCalled();
    expect(spreadsheetsGet).not.toHaveBeenCalled();
  });
});

describe("invalidarHoja", () => {
  it("borra todas las keys de esa hoja y deja las demás", async () => {
    valuesGet.mockResolvedValue(filas("a"));
    await readRange("Tareas!A:B");
    await readRange("Tareas!A1:AD1");
    await readRange("Usuarios!A:G");
    invalidarHoja("Tareas");
    await readRange("Tareas!A:B");
    await readRange("Tareas!A1:AD1");
    await readRange("Usuarios!A:G");
    expect(valuesGet).toHaveBeenCalledTimes(5);
  });
});

describe("conReintentos (vía readRange)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("429 → reintenta con 500 ms y resuelve", async () => {
    valuesGet.mockRejectedValueOnce(httpError(429)).mockResolvedValueOnce(filas("ok"));
    const p = readRange("Tareas!A:B");
    await vi.advanceTimersByTimeAsync(500);
    expect(await p).toEqual([["ok"]]);
    expect(valuesGet).toHaveBeenCalledTimes(2);
  });

  it("503 también reintenta", async () => {
    valuesGet.mockRejectedValueOnce(httpError(503)).mockResolvedValueOnce(filas("ok"));
    const p = readRange("Tareas!A:B");
    await vi.advanceTimersByTimeAsync(500);
    expect(await p).toEqual([["ok"]]);
  });

  it("400 no reintenta", async () => {
    valuesGet.mockRejectedValue(httpError(400));
    await expect(readRange("Tareas!A:B")).rejects.toThrow("HTTP 400");
    expect(valuesGet).toHaveBeenCalledTimes(1);
  });

  it("4 fallos seguidos → lanza el último tras 500+1500+4000 ms", async () => {
    valuesGet.mockRejectedValue(httpError(429));
    const p = readRange("Tareas!A:B");
    const rechazo = expect(p).rejects.toThrow("HTTP 429");
    await vi.advanceTimersByTimeAsync(6000);
    await rechazo;
    expect(valuesGet).toHaveBeenCalledTimes(4);
  });

  it("reintenta también en escrituras", async () => {
    valuesUpdate.mockRejectedValueOnce(httpError(429)).mockResolvedValueOnce({});
    const p = writeRange("Tareas!A1:A1", [["x"]]);
    await vi.advanceTimersByTimeAsync(500);
    await p;
    expect(valuesUpdate).toHaveBeenCalledTimes(2);
  });
});
