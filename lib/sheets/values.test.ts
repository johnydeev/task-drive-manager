import { describe, it, expect } from "vitest";
import { toDateOnly, toBool, boolToCell } from "./values";

describe("toDateOnly", () => {
  it("trunca un ISO datetime a YYYY-MM-DD", () => {
    expect(toDateOnly("2026-07-10T14:30:00.000Z")).toBe("2026-07-10");
  });
  it("deja una fecha ya en YYYY-MM-DD igual", () => {
    expect(toDateOnly("2026-07-10")).toBe("2026-07-10");
  });
  it("devuelve '' para vacío o formato no reconocido", () => {
    expect(toDateOnly("")).toBe("");
    expect(toDateOnly("no-es-fecha")).toBe("");
  });
});

describe("toBool", () => {
  it("interpreta TRUE/Sí como true y FALSE/'' como false (tolerante)", () => {
    expect(toBool("TRUE")).toBe(true);
    expect(toBool("true")).toBe(true);
    expect(toBool("Sí")).toBe(true);
    expect(toBool("FALSE")).toBe(false);
    expect(toBool("")).toBe(false);
  });
});

describe("boolToCell", () => {
  it("serializa a TRUE/FALSE canónico", () => {
    expect(boolToCell(true)).toBe("TRUE");
    expect(boolToCell(false)).toBe("FALSE");
  });
});
