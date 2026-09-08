import { describe, it, expect } from "vitest";
import { contarPendientesPorEdificio, pendientesDe } from "./pendientes-por-edificio";
import type { Tarea } from "@/types";

function tarea(over: Partial<Tarea>): Tarea {
  return {
    rowId: "2026-01-01T00:00:00.000Z",
    objetivo: "x",
    fechaInicio: "2026-01-10",
    fechaEstimada: "2026-01-20",
    edificio: "BELGRANO 2458",
    parteComun: false,
    dpto: "1A",
    informe: "",
    imagenes: [],
    videos: [],
    documentos: [],
    estado: "Sin asignar",
    prioridad: "Media",
    supervisor: "sup@x.com",
    ...over,
  };
}

describe("contarPendientesPorEdificio", () => {
  it("cuenta todo lo que no está Realizada", () => {
    const mapa = contarPendientesPorEdificio([
      tarea({ estado: "Sin asignar" }),
      tarea({ estado: "Asignada" }),
      tarea({ estado: "Aceptada" }),
      tarea({ estado: "En Proceso" }),
      tarea({ estado: "En Revisión" }),
      tarea({ estado: "Objetada" }),
      tarea({ estado: "Realizada" }),
    ]);
    expect(pendientesDe(mapa, "BELGRANO 2458")).toBe(6);
  });

  it("separa por edificio", () => {
    const mapa = contarPendientesPorEdificio([
      tarea({ edificio: "BELGRANO 2458", estado: "Sin asignar" }),
      tarea({ edificio: "BARTOLOME MITRE 1225", estado: "En Proceso" }),
      tarea({ edificio: "BARTOLOME MITRE 1225", estado: "Objetada" }),
    ]);
    expect(pendientesDe(mapa, "BELGRANO 2458")).toBe(1);
    expect(pendientesDe(mapa, "BARTOLOME MITRE 1225")).toBe(2);
  });

  it("matchea aunque cambien mayúsculas, acentos o espacios", () => {
    const mapa = contarPendientesPorEdificio([
      tarea({ edificio: "Bartolomé  Mitre 1225", estado: "Asignada" }),
    ]);
    expect(pendientesDe(mapa, "BARTOLOME MITRE 1225")).toBe(1);
  });

  it("devuelve 0 para un edificio sin tareas", () => {
    const mapa = contarPendientesPorEdificio([]);
    expect(pendientesDe(mapa, "GARAY 350")).toBe(0);
  });

  it("ignora las tareas sin edificio", () => {
    const mapa = contarPendientesPorEdificio([tarea({ edificio: "   ", estado: "Asignada" })]);
    expect(pendientesDe(mapa, "")).toBe(0);
    expect(mapa.size).toBe(0);
  });
});
