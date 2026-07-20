import { describe, expect, it } from "vitest";
import { parseTareasRows } from "@/lib/google-sheets";

// Header snake_case en las posiciones que usa rowFor. Con la lectura por header,
// la fila 1 SIEMPRE es el header (la planilla real siempre lo tiene).
function header(): string[] {
  const h = new Array(22).fill("");
  h[0] = "id";
  h[1] = "objetivo";
  h[17] = "estado";
  h[20] = "prioridad";
  return h;
}

function rowFor(rowId: string, objetivo = "x"): string[] {
  const r = new Array(22).fill("");
  r[0] = rowId;
  r[1] = objetivo;
  r[17] = "Pendiente";
  r[20] = "Media";
  return r;
}

describe("parseTareasRows", () => {
  it("mapea datos usando el header de la fila 1", () => {
    const rows = [header(), rowFor("2026-06-19T03:00:00.000Z", "Real")];
    const tareas = parseTareasRows(rows);
    expect(tareas).toHaveLength(1);
    expect(tareas[0].objetivo).toBe("Real");
    expect(tareas[0].rowNumber).toBe(2); // fila 1 es header, datos desde la 2
  });

  it("ignora filas vacías intercaladas", () => {
    const rows = [
      header(),
      rowFor("2026-06-01T00:00:00.000Z", "Primera"),
      new Array(22).fill(""), // vacía
      rowFor("2026-06-05T00:00:00.000Z", "Segunda"),
    ];
    const tareas = parseTareasRows(rows);
    expect(tareas.map((t) => t.objetivo)).toEqual(["Primera", "Segunda"]);
    expect(tareas[1].rowNumber).toBe(4); // fila real de la Sheet
  });

  it("descarta filas cuya columna A no parece un timestamp ISO", () => {
    const rows = [
      header(),
      ["no-es-fecha", "basura"],
      rowFor("2026-06-10T12:00:00.000Z", "Válida"),
    ];
    const tareas = parseTareasRows(rows);
    expect(tareas).toHaveLength(1);
    expect(tareas[0].objetivo).toBe("Válida");
  });
});
