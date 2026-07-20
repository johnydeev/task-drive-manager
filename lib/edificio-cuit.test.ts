import { describe, it, expect } from "vitest";
import { resolveCuit, planBackfill } from "./edificio-cuit";
import type { Consorcio } from "./consorcios";

const consorcios: Consorcio[] = [
  {
    nombre: "BELGRANO 1429",
    cuit: "30-54410451-5",
    nombresAlternativos: ["Av. Belgrano 1429", "BELGRANO 1431"],
  },
  { nombre: "GARAY 350", cuit: "30-11111111-1", nombresAlternativos: [] },
  { nombre: "SIN CUIT", cuit: null, nombresAlternativos: [] },
];

describe("resolveCuit", () => {
  it("matchea por nombre canónico (tolerante a mayúsculas/acentos)", () => {
    expect(resolveCuit("Belgrano 1429", consorcios)).toBe("30-54410451-5");
    expect(resolveCuit("GARAY 350", consorcios)).toBe("30-11111111-1");
  });

  it("matchea por nombre alternativo", () => {
    expect(resolveCuit("BELGRANO 1431", consorcios)).toBe("30-54410451-5");
    expect(resolveCuit("av. belgrano 1429", consorcios)).toBe("30-54410451-5");
  });

  it("devuelve null si no matchea ningún consorcio", () => {
    expect(resolveCuit("Inexistente 999", consorcios)).toBeNull();
  });

  it("devuelve null si el consorcio matcheado no tiene CUIT", () => {
    expect(resolveCuit("SIN CUIT", consorcios)).toBeNull();
  });

  it("devuelve null para nombre vacío", () => {
    expect(resolveCuit("", consorcios)).toBeNull();
    expect(resolveCuit("   ", consorcios)).toBeNull();
  });
});

describe("planBackfill", () => {
  it("clasifica en aEscribir / yaOk / sinMatch", () => {
    const items = [
      { rowNumber: 2, edificio: "Belgrano 1429", cuitActual: "" }, // resolvible -> aEscribir
      { rowNumber: 3, edificio: "GARAY 350", cuitActual: "30-99-ya" }, // ya tiene -> yaOk
      { rowNumber: 4, edificio: "Fantasma 1", cuitActual: "" }, // no matchea -> sinMatch
    ];
    const plan = planBackfill(items, consorcios);
    expect(plan.aEscribir).toEqual([
      { rowNumber: 2, edificio: "Belgrano 1429", cuit: "30-54410451-5" },
    ]);
    expect(plan.yaOk).toBe(1);
    expect(plan.sinMatch).toEqual([{ rowNumber: 4, edificio: "Fantasma 1" }]);
  });

  it("no sobrescribe los que ya tienen cuit (idempotente)", () => {
    const items = [{ rowNumber: 2, edificio: "Belgrano 1429", cuitActual: "algo" }];
    const plan = planBackfill(items, consorcios);
    expect(plan.aEscribir).toEqual([]);
    expect(plan.yaOk).toBe(1);
  });

  it("filas con edificio vacío caen en sinMatch (no rompen)", () => {
    const items = [{ rowNumber: 2, edificio: "", cuitActual: "" }];
    expect(planBackfill(items, consorcios).sinMatch).toHaveLength(1);
  });
});
