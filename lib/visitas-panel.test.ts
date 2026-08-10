import { describe, it, expect } from "vitest";
import { UMBRAL_ATRASO_DIAS, resumenPorEdificio } from "./visitas-panel";
import type { Visita } from "@/types";

const visita = (edificio: string, fecha: string): Visita => ({
  id: `${edificio}-${fecha}`,
  edificio,
  fecha,
  pdfUrl: "https://drive.google.com/file/d/x/view",
  supervisor: "sup@x.com",
  creadoEn: fecha,
});

const HOY = new Date("2026-08-08T12:00:00-03:00").getTime();

describe("resumenPorEdificio", () => {
  it("toma la visita más reciente de cada edificio", () => {
    const r = resumenPorEdificio(
      [{ nombre: "A" }],
      [visita("A", "2026-07-01"), visita("A", "2026-08-01")],
      HOY
    );
    expect(r[0].ultima?.fecha).toBe("2026-08-01");
    expect(r[0].dias).toBe(7);
  });

  it("pone primero los edificios sin ninguna visita", () => {
    const r = resumenPorEdificio(
      [{ nombre: "Con" }, { nombre: "Sin" }],
      [visita("Con", "2026-08-07")],
      HOY
    );
    expect(r.map((x) => x.edificio)).toEqual(["Sin", "Con"]);
    expect(r[0].ultima).toBeNull();
    expect(r[0].dias).toBeNull();
  });

  it("ordena del más atrasado al más reciente", () => {
    const r = resumenPorEdificio(
      [{ nombre: "Nueva" }, { nombre: "Vieja" }, { nombre: "Media" }],
      [visita("Nueva", "2026-08-07"), visita("Vieja", "2026-05-01"), visita("Media", "2026-07-01")],
      HOY
    );
    expect(r.map((x) => x.edificio)).toEqual(["Vieja", "Media", "Nueva"]);
  });

  it("marca como atrasado al que supera el umbral", () => {
    const r = resumenPorEdificio(
      [{ nombre: "A" }, { nombre: "B" }],
      [visita("A", "2026-08-07"), visita("B", "2026-01-01")],
      HOY
    );
    const porNombre = Object.fromEntries(r.map((x) => [x.edificio, x]));
    expect(porNombre.A.atrasado).toBe(false);
    expect(porNombre.B.atrasado).toBe(true);
  });

  it("considera atrasado al que nunca fue visitado", () => {
    const r = resumenPorEdificio([{ nombre: "Sin" }], [], HOY);
    expect(r[0].atrasado).toBe(true);
  });

  it("matchea el edificio de forma tolerante a mayúsculas y acentos", () => {
    const r = resumenPorEdificio(
      [{ nombre: "Av. Belgrano 1429" }],
      [visita("AV. BELGRANO 1429", "2026-08-01")],
      HOY
    );
    expect(r[0].ultima?.fecha).toBe("2026-08-01");
  });

  it("el umbral es de 45 días", () => {
    expect(UMBRAL_ATRASO_DIAS).toBe(45);
  });
});
