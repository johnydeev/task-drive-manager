import { describe, it, expect } from "vitest";
import { rowsToConsorcios } from "./consorcios";

describe("rowsToConsorcios", () => {
  it("mapea nombre, cuit y nombres alternativos (cols C y D, separados por |)", () => {
    const rows = [
      ["BELGRANO 1429", "30-54410451-5", "Av. Belgrano 1429 | BELGRANO 1431", "", "TRUE"],
      ["GARAY 350", "30-11111111-1", "", "aliasX", "TRUE"],
    ];
    const cs = rowsToConsorcios(rows);
    expect(cs).toHaveLength(2);
    expect(cs[0]).toEqual({
      nombre: "BELGRANO 1429",
      cuit: "30-54410451-5",
      nombresAlternativos: ["Av. Belgrano 1429", "BELGRANO 1431"],
    });
    expect(cs[1].nombresAlternativos).toEqual(["aliasX"]);
  });

  it("filtra inactivos (col E = FALSE) y filas sin nombre", () => {
    const rows = [
      ["ACTIVO", "30-1", "", "", "TRUE"],
      ["INACTIVO", "30-2", "", "", "FALSE"],
      ["", "30-3", "", "", "TRUE"],
    ];
    const cs = rowsToConsorcios(rows);
    expect(cs.map((c) => c.nombre)).toEqual(["ACTIVO"]);
  });

  it("cuit vacío -> null", () => {
    expect(rowsToConsorcios([["X", "", "", "", "TRUE"]])[0].cuit).toBeNull();
  });
});
