import { describe, it, expect, vi, beforeEach } from "vitest";

// Spies estables (hoisted) para el cliente de Sheets. getSheets() memoiza el objeto,
// pero como estos spies son estables, todas las funciones comparten los mismos.
const { valuesGet, valuesUpdate, valuesAppend, spreadsheetsGet, batchUpdate } = vi.hoisted(() => ({
  valuesGet: vi.fn(),
  valuesUpdate: vi.fn(),
  valuesAppend: vi.fn(),
  spreadsheetsGet: vi.fn(),
  batchUpdate: vi.fn(),
}));

vi.mock("googleapis", () => ({
  google: {
    sheets: () => ({
      spreadsheets: {
        values: { get: valuesGet, update: valuesUpdate, append: valuesAppend },
        get: spreadsheetsGet,
        batchUpdate,
      },
    }),
  },
}));
vi.mock("@/lib/google-auth", () => ({ getGoogleAuth: () => ({}), getSheetId: () => "sheet-id" }));
vi.mock("@/lib/demo-mode", () => ({ isDemoMode: () => false }));

import {
  getTareas,
  appendTarea,
  updateTarea,
  deleteTarea,
  getUsuarios,
  setUsuarioActivo,
  appendUsuario,
  getConfiguracion,
  getDptos,
  getEdificios,
} from "@/lib/google-sheets";

// Devuelve las filas segun el range pedido; el resto vacio.
function mockRanges(byRange: Record<string, string[][]>) {
  valuesGet.mockImplementation(({ range }: { range: string }) =>
    Promise.resolve({ data: { values: byRange[range] ?? [] } })
  );
}

const ROW_ID = "2026-07-16T10:00:00.000Z";
// Header de Tareas con los nombres (snake_case) en las posiciones que usa tareaRow.
// La lectura por header no necesita que las columnas sean contiguas.
const HEADER_22 = (() => {
  const h = new Array(22).fill("");
  h[0] = "id"; h[1] = "objetivo"; h[2] = "fecha_inicio"; h[3] = "fecha_estimada";
  h[4] = "edificio"; h[5] = "parte_comun"; h[6] = "dpto"; h[7] = "informe";
  h[17] = "estado"; h[20] = "prioridad"; h[21] = "supervisor";
  return h;
})();
// Fila de tarea valida (col A = rowId). Solo llenamos lo necesario para el mapping.
const tareaRow = (rowId: string, edificio = "Edif A", estado = "Sin asignar") => {
  const r = new Array(22).fill("");
  r[0] = rowId; r[1] = "obj"; r[2] = "2026-07-16"; r[3] = "2026-07-20";
  r[4] = edificio; r[5] = "FALSE"; r[6] = "1A"; r[7] = "informe";
  r[17] = estado; r[20] = "Media"; r[21] = "sup@x.com";
  return r as string[];
};

beforeEach(() => {
  valuesGet.mockReset();
  valuesUpdate.mockReset().mockResolvedValue({});
  valuesAppend.mockReset().mockResolvedValue({});
  spreadsheetsGet.mockReset();
  batchUpdate.mockReset().mockResolvedValue({});
});

describe("getTareas — estado derivado a 72h", () => {
  it("una tarea En Revisión con revision_en de hace >72h se lee como Realizada", async () => {
    const header = new Array(24).fill("");
    header[0] = "id"; header[1] = "objetivo"; header[2] = "fecha_inicio"; header[3] = "fecha_estimada";
    header[4] = "edificio"; header[5] = "parte_comun"; header[6] = "dpto"; header[7] = "informe";
    header[17] = "estado"; header[20] = "prioridad"; header[21] = "supervisor";
    header[22] = "asignado_a"; header[23] = "revision_en";
    const viejo = new Date(Date.now() - 4 * 24 * 3600 * 1000).toISOString(); // hace 4 días
    const row = new Array(24).fill("");
    row[0] = ROW_ID; row[1] = "obj"; row[2] = "2026-07-16"; row[3] = "2026-07-20";
    row[4] = "Edif A"; row[5] = "FALSE"; row[6] = "1A"; row[7] = "informe";
    row[17] = "En Revisión"; row[20] = "Media"; row[21] = "sup@x.com";
    row[22] = "juan@x.com"; row[23] = viejo;
    mockRanges({ "Tareas!A:Z": [header, row], "TareaArchivos!A:F": [] });
    const ts = await getTareas();
    expect(ts).toHaveLength(1);
    expect(ts[0].estado).toBe("Realizada");
  });
});

describe("getTareas (real)", () => {
  it("parsea filas validas (ignorando header/basura) y aplica filtros", async () => {
    mockRanges({
      "Tareas!A:Z": [
        HEADER_22, // fila 1 = header
        tareaRow(ROW_ID, "Edif A"),
        tareaRow("2026-07-16T11:00:00.000Z", "Edif B"),
      ],
    });
    const all = await getTareas();
    expect(all).toHaveLength(2);
    const soloA = await getTareas({ edificio: "Edif A" });
    expect(soloA).toHaveLength(1);
    expect(soloA[0].rowId).toBe(ROW_ID);
    expect(soloA[0].rowNumber).toBe(2); // fila real en la Sheet (1-indexed)
  });
});

describe("appendTarea (real)", () => {
  it("escribe con update en la proxima fila libre (A:V), no con append", async () => {
    mockRanges({ "Tareas!A1:Z1": [HEADER_22], "Tareas!A:A": [["h"], ["x"], ["y"]] }); // 3 filas -> nextRow = 4
    const tarea = await appendTarea(
      {
        rowId: ROW_ID, objetivo: "obj", fechaInicio: "2026-07-16", fechaEstimada: "2026-07-20",
        edificio: "Edif A", parteComun: false, dpto: "1A", informe: "x",
        estado: "Sin asignar", prioridad: "Media",
        imagenes: [], videos: [], documentos: [],
      },
      "sup@x.com"
    );
    expect(valuesAppend).not.toHaveBeenCalled();
    expect(valuesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ range: "Tareas!A4:V4" })
    );
    expect(tarea.rowId).toBe(ROW_ID);
    expect(tarea.rowNumber).toBe(4);
    expect(tarea.supervisor).toBe("sup@x.com");
  });
});

describe("updateTarea (real)", () => {
  it("mergea sobre la tarea existente y escribe en su fila", async () => {
    mockRanges({
      "Tareas!A:Z": [HEADER_22, tareaRow(ROW_ID, "Edif A", "Sin asignar")],
      "Tareas!A1:Z1": [HEADER_22],
    });
    const updated = await updateTarea({ rowId: ROW_ID, estado: "Realizada" });
    expect(updated.estado).toBe("Realizada");
    expect(updated.edificio).toBe("Edif A"); // preservado del current
    expect(valuesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ range: "Tareas!A2:V2" })
    );
  });

  it("lanza si la tarea no existe", async () => {
    mockRanges({ "Tareas!A:Z": [] });
    await expect(updateTarea({ rowId: "no-existe", estado: "Realizada" })).rejects.toThrow();
  });
});

describe("deleteTarea (real)", () => {
  it("borra la fila con batchUpdate/deleteDimension usando el gid", async () => {
    mockRanges({ "Tareas!A:Z": [HEADER_22, tareaRow(ROW_ID)] });
    spreadsheetsGet.mockResolvedValue({
      data: { sheets: [{ properties: { sheetId: 999, title: "Tareas" } }] },
    });
    await deleteTarea(ROW_ID);
    const arg = batchUpdate.mock.calls[0][0];
    const range = arg.requestBody.requests[0].deleteDimension.range;
    expect(range.sheetId).toBe(999);
    expect(range.startIndex).toBe(1); // rowNumber(2) - 1
    expect(range.endIndex).toBe(2);
  });
});

describe("validación de enums al escribir (E)", () => {
  it("appendTarea rechaza un estado inválido y no escribe", async () => {
    mockRanges({ "Tareas!A1:Z1": [HEADER_22], "Tareas!A:A": [["h"]] });
    await expect(
      appendTarea(
        {
          rowId: ROW_ID, objetivo: "o", fechaInicio: "2026-07-16", fechaEstimada: "2026-07-20",
          edificio: "E", parteComun: false, dpto: "1A", informe: "i",
          estado: "Trucho" as never, prioridad: "Media",
          imagenes: [], videos: [], documentos: [],
        },
        "sup@x.com"
      )
    ).rejects.toThrow();
    expect(valuesUpdate).not.toHaveBeenCalled();
  });

  it("appendUsuario rechaza un rol inválido y no escribe", async () => {
    await expect(
      appendUsuario({ email: "x@x.com", nombre: "X", rol: "trucho" as never, activo: true })
    ).rejects.toThrow();
    expect(valuesAppend).not.toHaveBeenCalled();
  });
});

describe("getUsuarios (real)", () => {
  it("normaliza rol y trata activo por defecto en true", async () => {
    mockRanges({
      "Usuarios!A:F": [
        ["email", "nombre", "rol", "activo", "creado_en", "actualizado_en"],
        ["Admin@X.com", "Admin", "ADMIN", "", "2026-01-01", ""],
        ["sup@x.com", "Sup", "supervisor", "false", "2026-01-01", ""],
      ],
    });
    const us = await getUsuarios();
    expect(us[0].email).toBe("admin@x.com"); // lowercased
    expect(us[0].rol).toBe("admin");
    expect(us[0].activo).toBe(true); // vacio -> activo
    expect(us[1].activo).toBe(false); // "false" -> inactivo
  });
});

describe("setUsuarioActivo (real)", () => {
  it("encuentra la fila por email y actualiza la columna D", async () => {
    mockRanges({
      "Usuarios!A:F": [
        ["email", "nombre", "rol", "activo", "creado_en", "actualizado_en"],
        ["a@x.com", "A", "admin", "true", "", ""],
        ["b@x.com", "B", "supervisor", "true", "", ""],
      ],
    });
    await setUsuarioActivo("b@x.com", false);
    expect(valuesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ range: "Usuarios!D3" }) // activo en col D, idx 1 -> fila 3
    );
  });

  it("lanza si el usuario no existe", async () => {
    mockRanges({ "Usuarios!A:F": [["email", "nombre", "rol", "activo", "creado_en", "actualizado_en"]] });
    await expect(setUsuarioActivo("nope@x.com", true)).rejects.toThrow();
  });
});

describe("getConfiguracion (real)", () => {
  it("parsea los valores y cae al default si falta una clave", async () => {
    mockRanges({
      "Configuracion!A2:B": [
        ["max_imagenes", "7"],
        ["max_size_video_mb", "50"],
      ],
    });
    const cfg = await getConfiguracion();
    expect(cfg.maxImagenes).toBe(7);
    expect(cfg.maxSizeVideoMB).toBe(50);
    // max_videos no vino -> default
    expect(cfg.maxVideos).toBeGreaterThan(0);
  });
});

describe("getDptos (real)", () => {
  it("filtra por edificio de forma tolerante a acentos/mayusculas", async () => {
    mockRanges({
      "Dptos!A:C": [
        ["id_dpto", "dpto", "edificio_ref"],
        ["1", "1A", "Belgrano 1429"],
        ["2", "2B", "OTRO EDIFICIO"],
      ],
    });
    const dptos = await getDptos("BELGRANO 1429");
    expect(dptos).toHaveLength(1);
    expect(dptos[0].dpto).toBe("1A");
  });
});

describe("getEdificios (real)", () => {
  it("lee la columna A y descarta vacios", async () => {
    mockRanges({ "Edificios!A2:A": [["Edif A"], [""], ["Edif B"]] });
    const es = await getEdificios();
    expect(es.map((e) => e.nombre)).toEqual(["Edif A", "Edif B"]);
  });
});
