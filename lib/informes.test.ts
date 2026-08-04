import { describe, it, expect } from "vitest";
import { agruparParaInforme, comentarioMasReciente, nombreArchivoInforme } from "./informes";
import type { Tarea } from "@/types";

const tarea = (over: Partial<Tarea> = {}): Tarea => ({
  rowId: "2026-07-01T10:00:00.000Z",
  objetivo: "x",
  fechaInicio: "2026-07-01",
  fechaEstimada: "",
  edificio: "Castro Barros 1310",
  parteComun: false,
  dpto: "1A",
  informe: "algo",
  imagenes: [],
  videos: [],
  documentos: [],
  estado: "Sin asignar",
  prioridad: "Media",
  supervisor: "sup@x.com",
  ...over,
});

describe("agruparParaInforme", () => {
  it("devuelve siempre los tres grupos en orden fijo", () => {
    const grupos = agruparParaInforme([]);
    expect(grupos.map((g) => g.grupo)).toEqual(["Pendientes", "En Proceso", "Realizadas"]);
  });

  it("mapea cada estado a su grupo", () => {
    const grupos = agruparParaInforme([
      tarea({ rowId: "1", estado: "Sin asignar" }),
      tarea({ rowId: "2", estado: "Asignada" }),
      tarea({ rowId: "3", estado: "Aceptada" }),
      tarea({ rowId: "4", estado: "En Proceso" }),
      tarea({ rowId: "5", estado: "En Revisión" }),
      tarea({ rowId: "6", estado: "Objetada" }),
      tarea({ rowId: "7", estado: "Realizada" }),
    ]);
    expect(grupos[0].tareas.map((t) => t.rowId)).toEqual(["1", "2", "3"]);
    expect(grupos[1].tareas.map((t) => t.rowId)).toEqual(["4", "5", "6"]);
    expect(grupos[2].tareas.map((t) => t.rowId)).toEqual(["7"]);
  });

  it("ordena por prioridad y, a igual prioridad, por fechaInicio ascendente", () => {
    const grupos = agruparParaInforme([
      tarea({ rowId: "baja", prioridad: "Baja", fechaInicio: "2026-01-01" }),
      tarea({ rowId: "alta-nueva", prioridad: "Alta", fechaInicio: "2026-06-01" }),
      tarea({ rowId: "alta-vieja", prioridad: "Alta", fechaInicio: "2026-02-01" }),
      tarea({ rowId: "media", prioridad: "Media", fechaInicio: "2026-01-01" }),
    ]);
    expect(grupos[0].tareas.map((t) => t.rowId)).toEqual([
      "alta-vieja",
      "alta-nueva",
      "media",
      "baja",
    ]);
  });

  it("no muta el array recibido", () => {
    const entrada = [
      tarea({ rowId: "b", prioridad: "Baja" }),
      tarea({ rowId: "a", prioridad: "Alta" }),
    ];
    agruparParaInforme(entrada);
    expect(entrada.map((t) => t.rowId)).toEqual(["b", "a"]);
  });
});

describe("comentarioMasReciente", () => {
  it("prioriza la objeción sobre revisión y proceso", () => {
    const c = comentarioMasReciente(
      tarea({
        notaObjecion: "falta foto",
        comentarioRevision: "listo",
        comentarioEnProceso: "arranco",
      })
    );
    expect(c).toEqual({ texto: "falta foto", origen: "objecion" });
  });

  it("cae a revisión cuando no hay objeción", () => {
    const c = comentarioMasReciente(
      tarea({ comentarioRevision: "listo", comentarioEnProceso: "arranco" })
    );
    expect(c).toEqual({ texto: "listo", origen: "revision" });
  });

  it("cae a en proceso cuando es lo único cargado", () => {
    const c = comentarioMasReciente(tarea({ comentarioEnProceso: "arranco" }));
    expect(c).toEqual({ texto: "arranco", origen: "proceso" });
  });

  it("ignora los campos que son solo espacios", () => {
    const c = comentarioMasReciente(tarea({ notaObjecion: "   ", comentarioEnProceso: "arranco" }));
    expect(c).toEqual({ texto: "arranco", origen: "proceso" });
  });

  it("devuelve vacío cuando no hay ningún comentario", () => {
    expect(comentarioMasReciente(tarea())).toEqual({ texto: "", origen: null });
  });
});

describe("nombreArchivoInforme", () => {
  it("normaliza acentos y espacios del edificio e incluye el rango", () => {
    expect(nombreArchivoInforme("Av. Belgrano 1429", "2026-06-01", "2026-06-30")).toBe(
      "informe-av-belgrano-1429-2026-06-01_2026-06-30.pdf"
    );
  });

  it("omite el rango cuando no hay fechas", () => {
    expect(nombreArchivoInforme("Castro Barros 1310")).toBe("informe-castro-barros-1310.pdf");
  });
});
