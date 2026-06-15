import { describe, expect, it } from "vitest";
import { rowToTarea, tareaToRow } from "@/lib/google-sheets";
import type { Tarea } from "@/types";

function emptyRow(): string[] {
  return new Array(22).fill("");
}

describe("rowToTarea", () => {
  it("parsea documentos desde columna 12", () => {
    const row = emptyRow();
    row[0] = "2026-06-14T10:00:00.000Z";
    row[1] = "Objetivo";
    row[10] = "[]";
    row[11] = "[]";
    row[12] = '["https://drive.google.com/file/d/abc/view"]';
    row[17] = "Pendiente";
    row[20] = "Media";

    const t = rowToTarea(row, 2);
    expect(t.documentos).toEqual(["https://drive.google.com/file/d/abc/view"]);
  });

  it("parsea reporteUrl desde columna 13", () => {
    const row = emptyRow();
    row[0] = "2026-06-14T10:00:00.000Z";
    row[10] = "[]";
    row[11] = "[]";
    row[13] = "https://drive.google.com/file/d/reporte/view";
    row[17] = "Pendiente";
    row[20] = "Media";

    const t = rowToTarea(row, 2);
    expect(t.reporteUrl).toBe("https://drive.google.com/file/d/reporte/view");
  });

  it("documentos vacío si columna 12 está vacía", () => {
    const row = emptyRow();
    row[0] = "2026-06-14T10:00:00.000Z";
    row[10] = "[]";
    row[11] = "[]";
    row[17] = "Pendiente";
    row[20] = "Media";

    const t = rowToTarea(row, 2);
    expect(t.documentos).toEqual([]);
    expect(t.reporteUrl).toBeUndefined();
  });
});

describe("tareaToRow", () => {
  const baseTarea: Tarea = {
    rowId: "2026-06-14T10:00:00.000Z",
    objetivo: "x",
    fechaInicio: "2026-06-14",
    fechaEstimada: "2026-06-20",
    edificio: "Edif",
    parteComun: false,
    dpto: "1A",
    informe: "y",
    imagenes: [],
    videos: [],
    documentos: [],
    estado: "Pendiente",
    prioridad: "Media",
    supervisor: "a@b.com",
  };

  it("escribe documentos como JSON en columna 12", () => {
    const row = tareaToRow({
      ...baseTarea,
      documentos: ["https://drive.google.com/file/d/abc/view"],
    });
    expect(row[12]).toBe(JSON.stringify(["https://drive.google.com/file/d/abc/view"]));
  });

  it("escribe reporteUrl en columna 13", () => {
    const row = tareaToRow({
      ...baseTarea,
      estado: "Realizado",
      reporteUrl: "https://drive.google.com/file/d/reporte/view",
    });
    expect(row[13]).toBe("https://drive.google.com/file/d/reporte/view");
  });

  it("documentos vacío genera '[]' en columna 12", () => {
    const row = tareaToRow(baseTarea);
    expect(row[12]).toBe("[]");
  });

  it("reporteUrl ausente genera '' en columna 13", () => {
    const row = tareaToRow(baseTarea);
    expect(row[13]).toBe("");
  });
});
