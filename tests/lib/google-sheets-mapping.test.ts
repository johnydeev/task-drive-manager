import { describe, expect, it } from "vitest";
import { rowToTarea, tareaToRow } from "@/lib/google-sheets";
import { buildHeaderMap } from "@/lib/sheets/headers";
import type { Tarea } from "@/types";

// Header real (snake_case) tal como está en la planilla.
const HEADER = [
  "id", "objetivo", "fecha_inicio", "fecha_estimada", "edificio", "edificio_cuit",
  "parte_comun", "dpto", "informe", "comentario_en_proceso", "comentario_realizado",
  "reporte_url", "proveedor", "estado", "presupuesto", "fecha_realizado", "prioridad",
  "supervisor", "creado_en", "actualizado_en",
];
const h = buildHeaderMap(HEADER);
const idx = (n: string) => HEADER.indexOf(n);

describe("rowToTarea (por header)", () => {
  it("lee reporte_url por header y NO trae media (vive en TareaArchivos)", () => {
    const row = new Array(HEADER.length).fill("");
    row[idx("id")] = "2026-06-14T10:00:00.000Z";
    row[idx("reporte_url")] = "https://drive.google.com/file/d/reporte/view";
    row[idx("estado")] = "Sin asignar";
    row[idx("prioridad")] = "Media";

    const t = rowToTarea(h, row, 2);
    expect(t.reporteUrl).toBe("https://drive.google.com/file/d/reporte/view");
    expect(t.imagenes).toEqual([]);
    expect(t.videos).toEqual([]);
    expect(t.documentos).toEqual([]);
  });

  it("reporte_url ausente -> undefined", () => {
    const row = new Array(HEADER.length).fill("");
    row[idx("id")] = "2026-06-14T10:00:00.000Z";
    row[idx("estado")] = "Sin asignar";
    row[idx("prioridad")] = "Media";
    const t = rowToTarea(h, row, 2);
    expect(t.reporteUrl).toBeUndefined();
  });
});

describe("tareaToRow (por header)", () => {
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
    estado: "Sin asignar",
    prioridad: "Media",
    supervisor: "a@b.com",
  };

  it("escribe reporte_url en su columna", () => {
    const row = tareaToRow(h, {
      ...baseTarea,
      estado: "Realizada",
      reporteUrl: "https://drive.google.com/file/d/reporte/view",
    });
    expect(row[idx("reporte_url")]).toBe("https://drive.google.com/file/d/reporte/view");
  });

  it("NO escribe media en la fila de Tareas (no hay columnas de media)", () => {
    const row = tareaToRow(h, {
      ...baseTarea,
      documentos: ["https://drive.google.com/file/d/doc/view"],
    });
    expect(row).not.toContain("https://drive.google.com/file/d/doc/view");
    expect(row).not.toContain(JSON.stringify(["https://drive.google.com/file/d/doc/view"]));
  });

  it("reporte_url ausente -> '' en su columna", () => {
    const row = tareaToRow(h, baseTarea);
    expect(row[idx("reporte_url")]).toBe("");
  });
});
