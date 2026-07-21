import { describe, it, expect } from "vitest";
import { toBuenosAiresISO } from "./fecha-ar";

describe("toBuenosAiresISO", () => {
  it("convierte un instante UTC a hora de pared de Buenos Aires (-03:00)", () => {
    // 2026-07-21T09:51:11.858Z == 06:51 en Buenos Aires
    expect(toBuenosAiresISO(new Date("2026-07-21T09:51:11.858Z"))).toBe(
      "2026-07-21T06:51:11.858-03:00"
    );
  });

  it("maneja el cruce de día (00:30 UTC = 21:30 del día anterior en ARG)", () => {
    expect(toBuenosAiresISO(new Date("2026-07-21T00:30:00.000Z"))).toBe(
      "2026-07-20T21:30:00.000-03:00"
    );
  });

  it("representa el MISMO instante que el original (parseable de vuelta)", () => {
    const orig = new Date("2026-07-21T09:51:11.858Z");
    expect(new Date(toBuenosAiresISO(orig)).getTime()).toBe(orig.getTime());
  });
});
