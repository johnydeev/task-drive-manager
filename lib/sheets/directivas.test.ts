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

import { getDirectivas, appendDirectiva, deleteDirectiva, updateDirectiva } from "./directivas";

// Header real (snake_case), la fila 1 SIEMPRE es el header.
const HEADER = [
  "id", "descripcion", "fecha", "asignado_a", "creado_por", "creado_en", "estado",
  "aceptada_en", "realizada_en", "nota_cierre", "objetada_en", "nota_objecion", "actualizado_en",
];
const row = (id: string, asignadoA = "op@x.com") =>
  [id, "desc", "2026-07-17", asignadoA, "admin@x.com", id, "Asignada"];

beforeEach(() => {
  valuesGet.mockReset();
  valuesAppend.mockReset().mockResolvedValue({});
  valuesUpdate.mockReset().mockResolvedValue({});
  spreadsheetsGet.mockReset();
  batchUpdate.mockReset().mockResolvedValue({});
});
const rows = (v: string[][]) => valuesGet.mockResolvedValue({ data: { values: [HEADER, ...v] } });

describe("getDirectivas", () => {
  it("mapea filas por header y filtra por asignadoA", async () => {
    rows([row("2026-07-17T10:00:00.000Z", "op@x.com"), row("2026-07-17T11:00:00.000Z", "otro@x.com")]);
    const mias = await getDirectivas("OP@X.com");
    expect(mias).toHaveLength(1);
    expect(mias[0].asignadoA).toBe("op@x.com");
    expect(mias[0].estado).toBe("Asignada");
  });
});

describe("appendDirectiva", () => {
  it("crea con id/creadoEn y escribe con update en la próxima fila libre (A:M)", async () => {
    rows([]); // col A: solo header -> nextRow 2
    const d = await appendDirectiva({ descripcion: "x", fecha: "2026-07-17", asignadoA: "OP@X.com" }, "ADMIN@X.com");
    expect(d.asignadoA).toBe("op@x.com");
    expect(d.creadoPor).toBe("admin@x.com");
    expect(d.estado).toBe("Asignada");
    expect(d.actualizadoEn).toBeTruthy();
    expect(valuesAppend).not.toHaveBeenCalled();
    expect(valuesUpdate).toHaveBeenCalledWith(expect.objectContaining({ range: "Directivas!A2:M2" }));
  });
});

describe("getDirectivas — estado efectivo", () => {
  const rowFull = (over: Record<string, string> = {}) => [
    over.id ?? "2026-07-17T10:00:00.000Z", "desc", "2026-07-17", "op@x.com", "admin@x.com",
    "2026-07-17T10:00:00.000Z", over.estado ?? "Aceptada",
    over.aceptadaEn ?? "", over.realizadaEn ?? "", over.notaCierre ?? "", "", "",
  ];
  it("aplica Cerrada si Realizada venció las 72h", async () => {
    const viejo = new Date(Date.now() - 100 * 60 * 60 * 1000).toISOString();
    rows([rowFull({ estado: "Realizada", realizadaEn: viejo, notaCierre: "listo" })]);
    const [d] = await getDirectivas();
    expect(d.notaCierre).toBe("listo");
    expect(d.estado).toBe("Cerrada");
  });
  it("Realizada reciente sigue Realizada", async () => {
    rows([rowFull({ estado: "Realizada", realizadaEn: new Date().toISOString() })]);
    const [d] = await getDirectivas();
    expect(d.estado).toBe("Realizada");
  });
});

describe("updateDirectiva", () => {
  it("mergea el patch y escribe la fila A–M con update", async () => {
    rows([row("2026-07-17T10:00:00.000Z")]); // Asignada en fila 2
    const upd = await updateDirectiva("2026-07-17T10:00:00.000Z", {
      estado: "Aceptada",
      aceptadaEn: "2026-07-18T00:00:00.000Z",
    });
    expect(upd?.estado).toBe("Aceptada");
    expect(valuesUpdate).toHaveBeenCalledWith(expect.objectContaining({ range: "Directivas!A2:M2" }));
  });
  it("devuelve null si el id no existe", async () => {
    rows([]);
    expect(await updateDirectiva("nope", { estado: "Aceptada" })).toBeNull();
  });
  it("rechaza un estado inválido al escribir (defensa enum)", async () => {
    rows([row("2026-07-17T10:00:00.000Z")]);
    await expect(
      updateDirectiva("2026-07-17T10:00:00.000Z", { estado: "Trucho" as never })
    ).rejects.toThrow();
    expect(valuesUpdate).not.toHaveBeenCalled();
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
