import { describe, it, expect, vi, beforeEach } from "vitest";

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
        values: { get: valuesGet, update: valuesUpdate, append: vi.fn() },
        get: spreadsheetsGet,
        batchUpdate,
      },
    }),
  },
}));
vi.mock("../google-auth", () => ({ getGoogleAuth: () => ({}), getSheetId: () => "sheet-id" }));
vi.mock("../demo-mode", () => ({ isDemoMode: () => false }));

import { getVisitas, appendVisita, getVisitaById, deleteVisita } from "./visitas";

const HEADERS = ["id", "edificio", "fecha", "pdf_url", "supervisor", "creado_en"];
const URL_A = "https://drive.google.com/file/d/a/view";
const URL_B = "https://drive.google.com/file/d/b/view";

function mockRows(rows: string[][]) {
  valuesGet.mockResolvedValue({ data: { values: rows } });
}

beforeEach(() => {
  vi.clearAllMocks();
  valuesUpdate.mockResolvedValue({});
  batchUpdate.mockResolvedValue({});
  spreadsheetsGet.mockResolvedValue({
    data: { sheets: [{ properties: { sheetId: 77, title: "Visitas" } }] },
  });
});

describe("getVisitas", () => {
  it("mapea las filas e ignora las que no tienen id", async () => {
    mockRows([
      HEADERS,
      [
        "2026-08-01T10:00:00-03:00",
        "Castro Barros 1310",
        "2026-08-01",
        URL_A,
        "sup@x.com",
        "2026-08-01T10:00:00-03:00",
      ],
      ["", "", "", "", "", ""],
    ]);
    const v = await getVisitas();
    expect(v).toHaveLength(1);
    expect(v[0].edificio).toBe("Castro Barros 1310");
    expect(v[0].pdfUrl).toBe(URL_A);
  });

  it("filtra por edificio de forma tolerante a mayúsculas", async () => {
    mockRows([
      HEADERS,
      ["1", "Castro Barros 1310", "2026-08-01", URL_A, "s@x.com", "2026-08-01"],
      ["2", "Av. Belgrano 1429", "2026-08-02", URL_B, "s@x.com", "2026-08-02"],
    ]);
    const v = await getVisitas("CASTRO BARROS 1310");
    expect(v).toHaveLength(1);
    expect(v[0].id).toBe("1");
  });

  it("devuelve vacío si la hoja todavía no existe", async () => {
    valuesGet.mockRejectedValue(new Error("Unable to parse range"));
    expect(await getVisitas()).toEqual([]);
  });
});

describe("appendVisita", () => {
  it("escribe la fila en la primera libre y devuelve la visita", async () => {
    mockRows([HEADERS]);
    const v = await appendVisita({
      edificio: "Castro Barros 1310",
      pdfUrl: URL_A,
      supervisor: "SUP@X.com",
    });
    expect(v.edificio).toBe("Castro Barros 1310");
    expect(v.supervisor).toBe("sup@x.com");
    expect(v.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const call = valuesUpdate.mock.calls.at(-1)![0];
    expect(call.range).toBe("Visitas!A2:F2");
    expect(call.requestBody.values[0][3]).toBe(URL_A);
  });
});

describe("deleteVisita", () => {
  it("borra la fila de la visita pedida", async () => {
    mockRows([
      HEADERS,
      ["1", "A", "2026-08-01", URL_A, "s@x.com", "2026-08-01"],
      ["2", "B", "2026-08-02", URL_B, "s@x.com", "2026-08-02"],
    ]);
    await deleteVisita("2");
    const req = batchUpdate.mock.calls.at(-1)![0].requestBody.requests[0].deleteDimension.range;
    expect(req.sheetId).toBe(77);
    expect(req.startIndex).toBe(2); // fila 3 (0-based)
  });

  it("es un no-op si el id no existe", async () => {
    mockRows([HEADERS]);
    await deleteVisita("nope");
    expect(batchUpdate).not.toHaveBeenCalled();
  });
});

describe("getVisitaById", () => {
  it("encuentra la visita por id", async () => {
    mockRows([HEADERS, ["1", "A", "2026-08-01", URL_A, "s@x.com", "2026-08-01"]]);
    expect((await getVisitaById("1"))?.pdfUrl).toBe(URL_A);
  });

  it("devuelve null si no está", async () => {
    mockRows([HEADERS]);
    expect(await getVisitaById("nope")).toBeNull();
  });
});
