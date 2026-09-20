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
        values: { get: valuesGet, update: valuesUpdate },
        get: spreadsheetsGet,
        batchUpdate,
      },
    }),
  },
}));
vi.mock("@/lib/google-auth", () => ({ getGoogleAuth: () => ({}), getSheetId: () => "sheet-id" }));
vi.mock("@/lib/demo-mode", () => ({ isDemoMode: () => false }));

import { getSuscripciones, upsertSuscripcion, deleteSuscripcion } from "./suscripciones";

const HEADER = ["id", "email", "endpoint", "p256dh", "auth", "user_agent", "creado_en"];
const fila = (email: string, endpoint: string, auth = "a1") => [
  "x",
  email,
  endpoint,
  "p",
  auth,
  "ua",
  "2026",
];
function rows(data: string[][]) {
  valuesGet.mockResolvedValue({ data: { values: data } });
}

beforeEach(() => {
  valuesGet.mockReset();
  valuesUpdate.mockReset().mockResolvedValue({});
  batchUpdate.mockReset().mockResolvedValue({});
  spreadsheetsGet.mockReset().mockResolvedValue({
    data: { sheets: [{ properties: { sheetId: 5, title: "Suscripciones" } }] },
  });
});

describe("getSuscripciones", () => {
  it("filtra por emails en minúsculas", async () => {
    rows([HEADER, fila("a@x.com", "https://p/1"), fila("b@x.com", "https://p/2")]);
    const r = await getSuscripciones(["A@X.com"]);
    expect(r.map((s) => s.endpoint)).toEqual(["https://p/1"]);
  });
  it("sin filtro devuelve todas", async () => {
    rows([HEADER, fila("a@x.com", "https://p/1"), fila("b@x.com", "https://p/2")]);
    expect(await getSuscripciones()).toHaveLength(2);
  });
});

describe("upsertSuscripcion", () => {
  const input = { email: "A@X.com", endpoint: "https://p/1", p256dh: "p", auth: "a1", userAgent: "ua" };

  it("nueva → escribe en la fila libre", async () => {
    rows([HEADER, fila("b@x.com", "https://p/2")]);
    expect(await upsertSuscripcion(input)).toBe("creada");
    expect(valuesUpdate).toHaveBeenCalledWith(expect.objectContaining({ range: "Suscripciones!A3:G3" }));
    const row = valuesUpdate.mock.calls[0][0].requestBody.values[0];
    expect(row[1]).toBe("a@x.com");
    expect(row[2]).toBe("https://p/1");
  });

  it("existente igual → no escribe", async () => {
    rows([HEADER, fila("a@x.com", "https://p/1", "a1")]);
    expect(await upsertSuscripcion(input)).toBe("sin-cambios");
    expect(valuesUpdate).not.toHaveBeenCalled();
  });

  it("existente con otras claves → actualiza su fila", async () => {
    rows([HEADER, fila("b@x.com", "https://p/2"), fila("a@x.com", "https://p/1", "viejo")]);
    expect(await upsertSuscripcion(input)).toBe("actualizada");
    expect(valuesUpdate).toHaveBeenCalledWith(expect.objectContaining({ range: "Suscripciones!A3:G3" }));
  });
});

describe("deleteSuscripcion", () => {
  it("borra la fila del endpoint", async () => {
    rows([HEADER, fila("a@x.com", "https://p/1"), fila("b@x.com", "https://p/2")]);
    await deleteSuscripcion("https://p/2");
    const req = batchUpdate.mock.calls[0][0].requestBody.requests[0].deleteDimension.range;
    expect(req).toMatchObject({ sheetId: 5, startIndex: 2, endIndex: 3 });
  });
  it("endpoint desconocido → no llama", async () => {
    rows([HEADER, fila("a@x.com", "https://p/1")]);
    await deleteSuscripcion("https://p/zzz");
    expect(batchUpdate).not.toHaveBeenCalled();
  });
});
