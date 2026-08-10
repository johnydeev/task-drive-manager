import { describe, it, expect } from "vitest";
import { BLOQUES_VISITA, ITEMS_VISITA, esClaveItem } from "./visitas-items";

describe("ítems de la visita", () => {
  it("tiene 15 ítems repartidos en dos bloques", () => {
    expect(ITEMS_VISITA).toHaveLength(15);
    expect(BLOQUES_VISITA).toHaveLength(2);
    expect(BLOQUES_VISITA[0].items).toHaveLength(8);
    expect(BLOQUES_VISITA[1].items).toHaveLength(7);
  });

  it("respeta el orden del formulario en papel", () => {
    expect(BLOQUES_VISITA[0].items.map((i) => i.label)).toEqual([
      "Hall",
      "Vereda",
      "Palieres",
      "Sótano",
      "Terraza",
      "Ascensores",
      "Escaleras",
      "Cochera",
    ]);
    expect(BLOQUES_VISITA[1].items.map((i) => i.label)).toEqual([
      "Sala de Medidores",
      "Amenities",
      "Luz de Palieres",
      "Luces de Emergencia",
      "Matafuegos",
      "Termotanque",
      "Obleas",
    ]);
  });

  it("no repite claves", () => {
    const claves = ITEMS_VISITA.map((i) => i.clave);
    expect(new Set(claves).size).toBe(claves.length);
  });

  it("reconoce una clave válida y rechaza una inventada", () => {
    expect(esClaveItem("hall")).toBe(true);
    expect(esClaveItem("pileta")).toBe(false);
  });
});
