import { describe, it, expect } from "vitest";
import { normalizeHeader, buildHeaderMap, colLetter } from "./headers";

describe("normalizeHeader", () => {
  it("baja a minúsculas, saca acentos, espacios y guiones bajos", () => {
    expect(normalizeHeader("Fecha inicio")).toBe("fechainicio");
    expect(normalizeHeader("fecha_inicio")).toBe("fechainicio");
    expect(normalizeHeader("Parte común")).toBe("partecomun");
    expect(normalizeHeader("  Reporte URL ")).toBe("reporteurl");
  });

  it("tolera basura de headers reales (tab adelante, espacio al final)", () => {
    expect(normalizeHeader("\tedificio_cuit")).toBe("edificiocuit");
    expect(normalizeHeader("asignado_a ")).toBe("asignadoa");
  });
});

describe("buildHeaderMap", () => {
  const header = ["rowId", "Objetivo", "Fecha inicio", "Parte común"];

  it("encuentra por nombre canónico normalizado", () => {
    const h = buildHeaderMap(header);
    expect(h.index("objetivo")).toBe(1);
    expect(h.get(["a", "b", "c", "d"], "fecha_inicio")).toBe("c");
  });

  it("encuentra por alias cuando el header está con el nombre viejo", () => {
    const h = buildHeaderMap(header);
    expect(h.index("id", ["rowId"])).toBe(0);
    expect(h.get(["ID-1", "obj", "c", "d"], "id", ["rowId"])).toBe("ID-1");
  });

  it("devuelve -1 y '' para columnas ausentes", () => {
    const h = buildHeaderMap(header);
    expect(h.index("no_existe")).toBe(-1);
    expect(h.get(["a"], "no_existe")).toBe("");
  });
});

describe("colLetter", () => {
  it("convierte índice de columna 1-based a letra A1", () => {
    expect(colLetter(1)).toBe("A");
    expect(colLetter(20)).toBe("T");
    expect(colLetter(22)).toBe("V");
    expect(colLetter(26)).toBe("Z");
    expect(colLetter(27)).toBe("AA");
  });
});
