import { describe, expect, it } from "vitest";
import { tareaFolderName, sanitizeSegment } from "@/lib/google-drive";

describe("sanitizeSegment", () => {
  it("reemplaza caracteres problemáticos por espacios y colapsa", () => {
    expect(sanitizeSegment("a/b:c")).toBe("a b c");
    expect(sanitizeSegment("Pintura/exterior")).toBe("Pintura exterior");
  });

  it("colapsa espacios y recorta bordes", () => {
    expect(sanitizeSegment("  hola   mundo  ")).toBe("hola mundo");
  });

  it("mantiene mayúsculas y acentos", () => {
    expect(sanitizeSegment("HALL Príncipe")).toBe("HALL Príncipe");
  });

  it("recorta a la longitud máxima", () => {
    expect(sanitizeSegment("x".repeat(80), 60)).toHaveLength(60);
  });
});

describe("tareaFolderName", () => {
  it("arma {fecha} · {ubicación} · {objetivo} con la fecha en horario Argentina", () => {
    const name = tareaFolderName({
      rowId: "2026-07-05T12:00:00.000Z", // AR: 09:00 del 05/07
      ubicacion: "3A",
      objetivo: "Pintura exterior",
    });
    expect(name).toBe("2026-07-05 · 3A · Pintura exterior");
  });

  it("usa el valor de parte común como ubicación", () => {
    const name = tareaFolderName({
      rowId: "2026-07-05T12:00:00.000Z",
      ubicacion: "HALL",
      objetivo: "Limpieza",
    });
    expect(name).toBe("2026-07-05 · HALL · Limpieza");
  });

  it("aplica el offset -3: una hora UTC temprana cae el día anterior en AR", () => {
    const name = tareaFolderName({
      rowId: "2026-07-05T02:00:00.000Z", // AR: 23:00 del 04/07
      ubicacion: "1B",
      objetivo: "Test",
    });
    expect(name).toBe("2026-07-04 · 1B · Test");
  });

  it("tolera rowId inválido sin romper", () => {
    const name = tareaFolderName({ rowId: "no-es-fecha", ubicacion: "1A", objetivo: "X" });
    expect(name).toMatch(/^\d{4}-\d{2}-\d{2} · 1A · X$/);
  });
});
