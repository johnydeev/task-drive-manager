import { describe, it, expect } from "vitest";
import { normalizar } from "./texto";

describe("normalizar", () => {
  it("quita acentos y baja a minúsculas", () => {
    expect(normalizar("Pintar TERRAZA")).toBe("pintar terraza");
    expect(normalizar("Ñandú Árbol")).toBe("nandu arbol");
    expect(normalizar("")).toBe("");
  });
});
