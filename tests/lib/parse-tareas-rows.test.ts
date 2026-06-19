import { describe, expect, it } from "vitest";
import { parseTareasRows } from "@/lib/google-sheets";

function rowFor(rowId: string, objetivo = "x"): string[] {
  const r = new Array(22).fill("");
  r[0] = rowId;
  r[1] = objetivo;
  r[10] = "[]"; // imagenes
  r[11] = "[]"; // videos
  r[12] = "[]"; // documentos
  r[17] = "Pendiente";
  r[20] = "Media";
  return r;
}

describe("parseTareasRows", () => {
  it("incluye una tarea cuando NO hay header (datos en fila 1)", () => {
    const rows = [rowFor("2026-06-19T03:00:00.000Z", "Tarea de prueba")];
    const tareas = parseTareasRows(rows);
    expect(tareas).toHaveLength(1);
    expect(tareas[0].objetivo).toBe("Tarea de prueba");
    expect(tareas[0].rowNumber).toBe(1); // fila real de la Sheet
  });

  it("saltea una fila de header (columna A no es un rowId)", () => {
    const header = new Array(22).fill("");
    header[0] = "id";
    header[1] = "objetivo";
    const rows = [header, rowFor("2026-06-19T03:00:00.000Z", "Real")];
    const tareas = parseTareasRows(rows);
    expect(tareas).toHaveLength(1);
    expect(tareas[0].objetivo).toBe("Real");
    expect(tareas[0].rowNumber).toBe(2); // fila 2 de la Sheet
  });

  it("ignora filas vacías intercaladas", () => {
    const rows = [
      rowFor("2026-06-01T00:00:00.000Z", "Primera"),
      new Array(22).fill(""), // vacía
      rowFor("2026-06-05T00:00:00.000Z", "Segunda"),
    ];
    const tareas = parseTareasRows(rows);
    expect(tareas.map((t) => t.objetivo)).toEqual(["Primera", "Segunda"]);
    // rowNumber refleja la fila real, no el índice consecutivo
    expect(tareas[1].rowNumber).toBe(3);
  });

  it("descarta filas cuya columna A no parece un timestamp ISO", () => {
    const rows = [
      ["no-es-fecha", "basura"],
      rowFor("2026-06-10T12:00:00.000Z", "Válida"),
    ];
    const tareas = parseTareasRows(rows);
    expect(tareas).toHaveLength(1);
    expect(tareas[0].objetivo).toBe("Válida");
  });
});
