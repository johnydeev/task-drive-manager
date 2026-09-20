import { describe, it, expect } from "vitest";
import { avisoDeTarea } from "./avisos-tarea";
import type { Tarea } from "@/types";

const t = (over: Partial<Tarea> = {}): Tarea =>
  ({
    rowId: "2026-09-20T10:00:00.000-03:00",
    objetivo: "Pintar pasillo",
    fechaInicio: "2026-09-20",
    fechaEstimada: "",
    edificio: "Garay 350",
    parteComun: false,
    dpto: "3B",
    informe: "",
    imagenes: [],
    videos: [],
    documentos: [],
    estado: "Asignada",
    prioridad: "Media",
    supervisor: "s@x.com",
    ...over,
  }) as Tarea;

describe("avisoDeTarea", () => {
  it("asignar: título, lugar y url del detalle", () => {
    const a = avisoDeTarea("asignar", t());
    expect(a.titulo).toBe("Te asignaron una tarea");
    expect(a.cuerpo).toBe("Pintar pasillo · Garay 350 · 3B");
    expect(a.url).toBe(`/tareas/${encodeURIComponent("2026-09-20T10:00:00.000-03:00")}`);
  });

  it("sin dpto no deja el separador colgado", () => {
    expect(avisoDeTarea("asignar", t({ dpto: "" })).cuerpo).toBe("Pintar pasillo · Garay 350");
  });

  it("revisar incluye el nombre del asignado si se pasa", () => {
    const a = avisoDeTarea("revisar", t(), { asignadoNombre: "Juan" });
    expect(a.titulo).toBe("Tarea lista para revisar");
    expect(a.cuerpo).toBe("Pintar pasillo · Garay 350 · 3B — Juan");
  });

  it("objetar recorta la nota a 120 caracteres con puntos suspensivos", () => {
    const nota = "x".repeat(200);
    const a = avisoDeTarea("objetar", t({ notaObjecion: nota }));
    expect(a.titulo).toBe("Tu tarea fue objetada");
    expect(a.cuerpo.length).toBe(120);
    expect(a.cuerpo.endsWith("…")).toBe(true);
    expect(a.cuerpo.startsWith("Pintar pasillo: xxx")).toBe(true);
  });
});
