import { describe, it, expect } from "vitest";
import { filterTareas } from "./tareas-filter";
import type { Tarea } from "@/types";

function tarea(over: Partial<Tarea>): Tarea {
  return {
    rowId: "2026-01-01T00:00:00.000Z",
    objetivo: "x",
    fechaInicio: "2026-01-10",
    fechaEstimada: "2026-01-20",
    edificio: "Edif A",
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

const data: Tarea[] = [
  tarea({ edificio: "Edif A", estado: "Sin asignar", prioridad: "Alta", supervisor: "a@x.com", fechaInicio: "2026-01-05" }),
  tarea({ edificio: "Edif B", estado: "Realizada", prioridad: "Baja", supervisor: "b@x.com", fechaInicio: "2026-02-15" }),
  tarea({ edificio: "Edif A", estado: "En Proceso", prioridad: "Media", supervisor: "a@x.com", fechaInicio: "2026-03-01" }),
];

describe("filterTareas", () => {
  it("sin filtros devuelve todo", () => {
    expect(filterTareas(data, {})).toHaveLength(3);
  });

  it("filtra por edificio", () => {
    expect(filterTareas(data, { edificio: "Edif A" })).toHaveLength(2);
  });

  it("filtra por estado", () => {
    expect(filterTareas(data, { estado: "Realizada" })).toHaveLength(1);
  });

  it("filtra por prioridad", () => {
    expect(filterTareas(data, { prioridad: "Alta" })).toHaveLength(1);
  });

  it("filtra por supervisor", () => {
    expect(filterTareas(data, { supervisor: "a@x.com" })).toHaveLength(2);
  });

  it("filtra por rango de fechas (desde/hasta sobre fechaInicio)", () => {
    expect(filterTareas(data, { desde: "2026-02-01", hasta: "2026-02-28" })).toHaveLength(1);
  });

  it("combina filtros", () => {
    expect(filterTareas(data, { edificio: "Edif A", estado: "Sin asignar" })).toHaveLength(1);
  });
});
