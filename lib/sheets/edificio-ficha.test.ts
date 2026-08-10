import { describe, it, expect, vi, beforeEach } from "vitest";

const { valuesGet, valuesUpdate } = vi.hoisted(() => ({
  valuesGet: vi.fn(),
  valuesUpdate: vi.fn(),
}));

vi.mock("googleapis", () => ({
  google: {
    sheets: () => ({
      spreadsheets: {
        values: { get: valuesGet, update: valuesUpdate, append: vi.fn() },
        get: vi.fn(),
        batchUpdate: vi.fn(),
      },
    }),
  },
}));
vi.mock("../google-auth", () => ({ getGoogleAuth: () => ({}), getSheetId: () => "sheet-id" }));
vi.mock("../demo-mode", () => ({ isDemoMode: () => false }));

import { getEdificioFicha, guardarEdificioFicha } from "./edificio-ficha";

const HEADERS = [
  "edificio",
  "seguro_poliza",
  "ascensores",
  "fumigacion",
  "empresa_matafuego_venc",
  "encargado",
  "caldera_termotanque",
  "empresa_limpieza",
  "horario_trabajo",
  "encargado_limpieza_hs",
  "actualizado_en",
];

function mockRows(rows: string[][]) {
  valuesGet.mockResolvedValue({ data: { values: rows } });
}

beforeEach(() => {
  vi.clearAllMocks();
  valuesUpdate.mockResolvedValue({});
});

describe("getEdificioFicha", () => {
  it("devuelve la ficha del edificio pedido", async () => {
    mockRows([
      HEADERS,
      ["Otro", "p1", "", "", "", "", "", "", "", "", ""],
      [
        "Castro Barros 1310",
        "POL-123",
        "AscenSA",
        "FumiSRL",
        "2027-01-01",
        "Juan",
        "Caldera X",
        "LimpioSA",
        "8 a 12",
        "Ana 6hs",
        "2026-08-01",
      ],
    ]);
    const f = await getEdificioFicha("Castro Barros 1310");
    expect(f.seguroPoliza).toBe("POL-123");
    expect(f.encargado).toBe("Juan");
    expect(f.encargadoLimpiezaHs).toBe("Ana 6hs");
  });

  it("matchea el edificio de forma tolerante a mayúsculas y acentos", async () => {
    mockRows([HEADERS, ["Av. Belgrano 1429", "POL-9", "", "", "", "", "", "", "", "", ""]]);
    const f = await getEdificioFicha("AV. BELGRANO 1429");
    expect(f.seguroPoliza).toBe("POL-9");
  });

  it("devuelve una ficha vacía si el edificio no está cargado", async () => {
    mockRows([HEADERS]);
    const f = await getEdificioFicha("Nuevo 123");
    expect(f.edificio).toBe("Nuevo 123");
    expect(f.seguroPoliza).toBe("");
    expect(f.encargado).toBe("");
  });

  it("devuelve una ficha vacía si la hoja no existe todavía", async () => {
    valuesGet.mockRejectedValue(new Error("Unable to parse range"));
    const f = await getEdificioFicha("Nuevo 123");
    expect(f.seguroPoliza).toBe("");
  });
});

describe("guardarEdificioFicha", () => {
  it("agrega una fila nueva si el edificio no estaba", async () => {
    mockRows([HEADERS]);
    await guardarEdificioFicha("Nuevo 123", { encargado: "Pedro" });
    const call = valuesUpdate.mock.calls.at(-1)![0];
    expect(call.range).toBe("EdificioFicha!A2:K2");
    expect(call.requestBody.values[0][0]).toBe("Nuevo 123");
    expect(call.requestBody.values[0][5]).toBe("Pedro");
  });

  it("sobrescribe la fila existente del edificio", async () => {
    mockRows([
      HEADERS,
      ["Castro Barros 1310", "POL-123", "", "", "", "Juan", "", "", "", "", "2026-08-01"],
    ]);
    await guardarEdificioFicha("Castro Barros 1310", { encargado: "Pedro" });
    const call = valuesUpdate.mock.calls.at(-1)![0];
    expect(call.range).toBe("EdificioFicha!A2:K2");
    expect(call.requestBody.values[0][5]).toBe("Pedro");
    // Conserva lo que no se tocó
    expect(call.requestBody.values[0][1]).toBe("POL-123");
  });

  it("escribe la fecha de actualización", async () => {
    mockRows([HEADERS]);
    await guardarEdificioFicha("Nuevo 123", {});
    const fila = valuesUpdate.mock.calls.at(-1)![0].requestBody.values[0];
    expect(fila[10]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
