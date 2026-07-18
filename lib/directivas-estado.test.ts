import { describe, it, expect } from "vitest";
import { estadoEfectivo, HORAS_72_MS } from "./directivas-estado";
import type { Directiva } from "@/types";

const base: Directiva = {
  id: "1", descripcion: "x", fecha: "2026-07-17", asignadoA: "op@x.com",
  creadoPor: "a@x.com", creadoEn: "2026-07-17T00:00:00.000Z", estado: "Realizada",
};
const NOW = new Date("2026-07-20T12:00:00.000Z").getTime();

describe("estadoEfectivo", () => {
  it("Realizada + >72h desde realizadaEn => Cerrada", () => {
    const d = { ...base, realizadaEn: new Date(NOW - HORAS_72_MS - 1000).toISOString() };
    expect(estadoEfectivo(d, NOW)).toBe("Cerrada");
  });
  it("Realizada dentro de 72h => sigue Realizada", () => {
    const d = { ...base, realizadaEn: new Date(NOW - 1000).toISOString() };
    expect(estadoEfectivo(d, NOW)).toBe("Realizada");
  });
  it("no-Realizada nunca se cierra por tiempo", () => {
    expect(estadoEfectivo({ ...base, estado: "Aceptada", aceptadaEn: new Date(0).toISOString() }, NOW)).toBe("Aceptada");
    expect(estadoEfectivo({ ...base, estado: "Asignada" }, NOW)).toBe("Asignada");
  });
  it("Realizada sin realizadaEn => no cierra (defensivo)", () => {
    expect(estadoEfectivo({ ...base, realizadaEn: undefined }, NOW)).toBe("Realizada");
  });
});
