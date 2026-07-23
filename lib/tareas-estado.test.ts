import { describe, it, expect } from "vitest";
import { estadoEfectivoTarea, HORAS_72_MS } from "./tareas-estado";
import type { Tarea } from "@/types";

const base = (over: Partial<Tarea>): Tarea => ({
  rowId: "2026-07-23T10:00:00.000Z",
  objetivo: "o",
  fechaInicio: "2026-07-23",
  fechaEstimada: "2026-07-24",
  edificio: "E",
  parteComun: false,
  dpto: "1A",
  informe: "i",
  imagenes: [],
  videos: [],
  documentos: [],
  estado: "En Revisión",
  prioridad: "Media",
  supervisor: "s@x.com",
  ...over,
});

describe("estadoEfectivoTarea", () => {
  it("En Revisión + >72h desde revisionEn → Realizada (derivado)", () => {
    const rev = new Date("2026-07-20T10:00:00.000Z").getTime();
    const now = rev + HORAS_72_MS + 1000;
    expect(estadoEfectivoTarea(base({ revisionEn: new Date(rev).toISOString() }), now)).toBe("Realizada");
  });

  it("En Revisión + <72h → sigue En Revisión", () => {
    const rev = Date.now();
    expect(estadoEfectivoTarea(base({ revisionEn: new Date(rev).toISOString() }), rev + 1000)).toBe("En Revisión");
  });

  it("En Revisión sin revisionEn → no deriva", () => {
    expect(estadoEfectivoTarea(base({ revisionEn: undefined }))).toBe("En Revisión");
  });

  it("otros estados no se derivan aunque haya revisionEn viejo", () => {
    const viejo = new Date(Date.now() - HORAS_72_MS - 1000).toISOString();
    expect(estadoEfectivoTarea(base({ estado: "En Proceso", revisionEn: viejo }))).toBe("En Proceso");
  });
});
