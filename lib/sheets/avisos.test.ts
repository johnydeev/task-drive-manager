import { describe, it, expect, vi, beforeEach } from "vitest";

const { valuesGet, valuesUpdate, valuesBatchUpdate, batchUpdate, spreadsheetsGet } = vi.hoisted(
  () => ({
    valuesGet: vi.fn(),
    valuesUpdate: vi.fn(),
    valuesBatchUpdate: vi.fn(),
    batchUpdate: vi.fn(),
    spreadsheetsGet: vi.fn(),
  })
);
vi.mock("googleapis", () => ({
  google: {
    sheets: () => ({
      spreadsheets: {
        values: { get: valuesGet, update: valuesUpdate, batchUpdate: valuesBatchUpdate },
        get: spreadsheetsGet,
        batchUpdate,
      },
    }),
  },
}));
vi.mock("@/lib/google-auth", () => ({ getGoogleAuth: () => ({}), getSheetId: () => "sheet-id" }));
const { isDemoMode } = vi.hoisted(() => ({ isDemoMode: vi.fn(() => false) }));
vi.mock("@/lib/demo-mode", () => ({ isDemoMode }));

import {
  getAvisos,
  appendAvisos,
  reemplazarRecordatorios,
  marcarLeidos,
  purgarAvisos,
} from "./avisos";

const HEADER = ["id", "email", "titulo", "cuerpo", "url", "tipo", "creado_en", "leido_en"];
const T0 = Date.parse("2026-09-20T12:00:00.000Z");
const DIA = 24 * 3600 * 1000;
const iso = (t: number) => new Date(t).toISOString();
const fila = (id: string, email: string, creado: string, leido = "", tipo = "asignar") => [
  id,
  email,
  `Título ${id}`,
  "cuerpo",
  `/tareas/${id}`,
  tipo,
  creado,
  leido,
];
function rows(data: string[][]) {
  valuesGet.mockResolvedValue({ data: { values: data } });
}
const filasBorradas = () =>
  (batchUpdate.mock.calls[0][0].requestBody.requests as { deleteDimension: { range: { startIndex: number } } }[]).map(
    (r) => r.deleteDimension.range.startIndex + 1
  );

beforeEach(() => {
  isDemoMode.mockReturnValue(false);
  valuesGet.mockReset();
  valuesUpdate.mockReset().mockResolvedValue({});
  valuesBatchUpdate.mockReset().mockResolvedValue({});
  batchUpdate.mockReset().mockResolvedValue({});
  spreadsheetsGet.mockReset().mockResolvedValue({
    data: { sheets: [{ properties: { sheetId: 9, title: "Avisos" } }] },
  });
});

describe("getAvisos", () => {
  it("filtra por email y desde, ordena más nuevos primero, ignora filas sin email/título", async () => {
    rows([
      HEADER,
      fila("a", "s@x.com", iso(T0 - DIA)),
      fila("b", "otro@x.com", iso(T0 - DIA)),
      fila("c", "s@x.com", iso(T0 - 40 * DIA)),
      fila("d", "S@x.com", iso(T0 - 2 * 3600_000), iso(T0 - 3600_000)),
      ["e", "", "sin email", "", "", "asignar", iso(T0), ""],
      ["f", "s@x.com", "", "", "", "asignar", iso(T0), ""],
    ]);
    const r = await getAvisos("s@x.com", { desde: T0 - 30 * DIA });
    expect(r.map((a) => a.id)).toEqual(["d", "a"]);
    expect(r[0].leidoEn).toBe(iso(T0 - 3600_000));
    expect(r[1].leidoEn).toBeNull();
    expect(r[1].url).toBe("/tareas/a");
  });

  it("hoja vacía → []", async () => {
    rows([]);
    expect(await getAvisos("s@x.com", { desde: 0 })).toEqual([]);
  });

  it("demo → [] sin leer", async () => {
    isDemoMode.mockReturnValue(true);
    expect(await getAvisos("s@x.com", { desde: 0 })).toEqual([]);
    expect(valuesGet).not.toHaveBeenCalled();
  });
});

describe("appendAvisos", () => {
  it("escribe todas las filas en un solo update a partir de la fila libre", async () => {
    rows([HEADER, fila("a", "s@x.com", iso(T0)), fila("b", "s@x.com", iso(T0))]);
    await appendAvisos([
      { email: "S@x.com", titulo: "T1", cuerpo: "c", url: "/tareas/1", tipo: "asignar" },
      { email: "o@x.com", titulo: "T2", cuerpo: "c", url: "/tareas/2", tipo: "revisar" },
    ]);
    expect(valuesUpdate).toHaveBeenCalledTimes(1);
    const call = valuesUpdate.mock.calls[0][0];
    expect(call.range).toBe("Avisos!A4:H5");
    expect(call.requestBody.values).toHaveLength(2);
    expect(call.requestBody.values[0][1]).toBe("s@x.com");
    expect(call.requestBody.values[0][5]).toBe("asignar");
    expect(call.requestBody.values[0][7]).toBe("");
  });

  it("vacío → no escribe", async () => {
    await appendAvisos([]);
    expect(valuesGet).not.toHaveBeenCalled();
    expect(valuesUpdate).not.toHaveBeenCalled();
  });
});

describe("reemplazarRecordatorios", () => {
  it("borra las existentes del mismo email+tipo y agrega las nuevas", async () => {
    rows([
      HEADER,
      fila("a", "s@x.com", iso(T0 - DIA), "", "recordatorio-mias"),
      fila("b", "s@x.com", iso(T0 - DIA), "", "recordatorio-revision"),
      fila("c", "s@x.com", iso(T0 - DIA), "", "asignar"),
      fila("d", "o@x.com", iso(T0 - DIA), "", "recordatorio-mias"),
    ]);
    valuesGet.mockResolvedValueOnce({
      data: {
        values: [
          HEADER,
          fila("a", "s@x.com", iso(T0 - DIA), "", "recordatorio-mias"),
          fila("b", "s@x.com", iso(T0 - DIA), "", "recordatorio-revision"),
          fila("c", "s@x.com", iso(T0 - DIA), "", "asignar"),
          fila("d", "o@x.com", iso(T0 - DIA), "", "recordatorio-mias"),
        ],
      },
    });
    // Segunda lectura (post-borrado): quedan b, c.
    rows([
      HEADER,
      fila("b", "s@x.com", iso(T0 - DIA), "", "recordatorio-revision"),
      fila("c", "s@x.com", iso(T0 - DIA), "", "asignar"),
    ]);
    await reemplazarRecordatorios([
      { email: "s@x.com", titulo: "Hoy", cuerpo: "c", url: "/tareas", tipo: "recordatorio-mias" },
      { email: "o@x.com", titulo: "Hoy", cuerpo: "c", url: "/tareas", tipo: "recordatorio-mias" },
    ]);
    expect(filasBorradas()).toEqual([5, 2]);
    expect(valuesUpdate).toHaveBeenCalledTimes(1);
    expect(valuesUpdate.mock.calls[0][0].range).toBe("Avisos!A4:H5");
  });

  it("sin existentes → solo agrega", async () => {
    rows([HEADER]);
    await reemplazarRecordatorios([
      { email: "s@x.com", titulo: "Hoy", cuerpo: "c", url: "/tareas", tipo: "recordatorio-mias" },
    ]);
    expect(batchUpdate).not.toHaveBeenCalled();
    expect(valuesUpdate.mock.calls[0][0].range).toBe("Avisos!A2:H2");
  });
});

describe("marcarLeidos", () => {
  it("un solo values.batchUpdate con H{n} de las no leídas del email", async () => {
    rows([
      HEADER,
      fila("a", "s@x.com", iso(T0 - DIA)),
      fila("b", "s@x.com", iso(T0 - DIA), iso(T0)),
      fila("c", "o@x.com", iso(T0 - DIA)),
      fila("d", "s@x.com", iso(T0 - 2 * DIA)),
      fila("e", "s@x.com", iso(T0 + DIA)),
    ]);
    const n = await marcarLeidos("S@x.com", T0);
    expect(n).toBe(2);
    expect(valuesBatchUpdate).toHaveBeenCalledTimes(1);
    const data = valuesBatchUpdate.mock.calls[0][0].requestBody.data as { range: string }[];
    expect(data.map((d) => d.range)).toEqual(["Avisos!H2", "Avisos!H5"]);
  });

  it("sin no leídas → no escribe y devuelve 0", async () => {
    rows([HEADER, fila("b", "s@x.com", iso(T0 - DIA), iso(T0))]);
    expect(await marcarLeidos("s@x.com", T0)).toBe(0);
    expect(valuesBatchUpdate).not.toHaveBeenCalled();
  });
});

describe("purgarAvisos", () => {
  it("borra las viejas y las de fecha inválida; devuelve la cantidad", async () => {
    rows([
      HEADER,
      fila("a", "s@x.com", iso(T0 - DIA)),
      fila("b", "s@x.com", iso(T0 - 31 * DIA)),
      fila("c", "s@x.com", "no-es-fecha"),
      fila("d", "o@x.com", iso(T0 - 29 * DIA)),
    ]);
    expect(await purgarAvisos(T0 - 30 * DIA)).toBe(2);
    expect(filasBorradas()).toEqual([4, 3]);
  });

  it("nada viejo → no llama a Google y devuelve 0", async () => {
    rows([HEADER, fila("a", "s@x.com", iso(T0))]);
    expect(await purgarAvisos(T0 - 30 * DIA)).toBe(0);
    expect(batchUpdate).not.toHaveBeenCalled();
  });
});
