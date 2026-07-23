import { describe, it, expect } from "vitest";
import type { Tarea } from "@/types";
import { buildKpis, groupByEdificio, groupByProveedor, timelinePorMes, tareasToCsv } from "./dashboard";

function tarea(over: Partial<Tarea>): Tarea {
  return {
    rowId: "2026-01-01T00:00:00.000Z",
    objetivo: "x", fechaInicio: "2026-01-10", fechaEstimada: "2026-01-20",
    edificio: "Edif A", parteComun: false, dpto: "1A", informe: "",
    imagenes: [], videos: [], documentos: [],
    estado: "Sin asignar", prioridad: "Media", supervisor: "s@x.com",
    ...over,
  };
}

describe("buildKpis", () => {
  it("cuenta total, por estado y por prioridad", () => {
    const k = buildKpis([
      tarea({ estado: "Sin asignar", prioridad: "Alta" }),
      tarea({ estado: "Realizada", prioridad: "Alta" }),
      tarea({ estado: "Sin asignar", prioridad: "Baja" }),
    ]);
    expect(k.total).toBe(3);
    expect(k.porEstado["Sin asignar"]).toBe(2);
    expect(k.porEstado.Realizada).toBe(1);
    expect(k.porPrioridad.Alta).toBe(2);
    expect(k.porPrioridad.Baja).toBe(1);
  });
});

describe("groupByEdificio", () => {
  it("agrupa por edificio y ordena por total desc", () => {
    const g = groupByEdificio([
      tarea({ edificio: "A", estado: "Sin asignar" }),
      tarea({ edificio: "A", estado: "Realizada" }),
      tarea({ edificio: "B", estado: "En Proceso" }),
    ]);
    expect(g[0].edificio).toBe("A");
    expect(g[0].total).toBe(2);
    expect(g[0].pendiente).toBe(1);
    expect(g[0].realizado).toBe(1);
    expect(g[1].edificio).toBe("B");
    expect(g[1].enProceso).toBe(1);
  });
});

describe("groupByProveedor", () => {
  it("ignora tareas sin proveedor y suma presupuesto", () => {
    const g = groupByProveedor([
      tarea({ proveedor: "P1", presupuesto: 100 }),
      tarea({ proveedor: "P1", presupuesto: 50 }),
      tarea({ proveedor: "", presupuesto: 999 }),
    ]);
    expect(g).toHaveLength(1);
    expect(g[0].proveedor).toBe("P1");
    expect(g[0].total).toBe(2);
    expect(g[0].presupuestoTotal).toBe(150);
  });
});

describe("timelinePorMes", () => {
  it("cuenta abiertas por mes y cerradas por fechaRealizado", () => {
    const tl = timelinePorMes([
      tarea({ fechaInicio: "2026-01-05", estado: "Sin asignar" }),
      tarea({ fechaInicio: "2026-02-10", estado: "Realizada", fechaRealizado: "2026-03-01" }),
    ]);
    const ene = tl.find((m) => m.mes === "2026-01");
    const feb = tl.find((m) => m.mes === "2026-02");
    const mar = tl.find((m) => m.mes === "2026-03");
    expect(ene?.abiertas).toBe(1);
    expect(feb?.abiertas).toBe(1);
    expect(mar?.cerradas).toBe(1);
  });
});

describe("tareasToCsv", () => {
  it("incluye header y escapa valores con comas", () => {
    const csv = tareasToCsv([tarea({ objetivo: "Hola, mundo", edificio: "A" })]);
    const [header, row] = csv.split("\n");
    expect(header.startsWith("rowId,objetivo")).toBe(true);
    expect(row).toContain('"Hola, mundo"');
  });
});
