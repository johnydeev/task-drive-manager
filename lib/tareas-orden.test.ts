import { describe, it, expect } from "vitest";
import { buscarTareas, ordenarTareas } from "./tareas-orden";
import type { Tarea } from "@/types";

const t = (over: Partial<Tarea>): Tarea =>
  ({
    rowId: "2026-09-10T10:00:00.000-03:00", objetivo: "x", fechaInicio: "2026-09-10", fechaEstimada: "",
    edificio: "E", parteComun: false, dpto: "1A", informe: "", imagenes: [], videos: [], documentos: [],
    estado: "Sin asignar", prioridad: "Media", supervisor: "s@x.com", ...over,
  }) as Tarea;

describe("buscarTareas", () => {
  const lista = [
    t({ rowId: "a", objetivo: "Pintar pasillo" }),
    t({ rowId: "b", edificio: "Garay 350" }),
    t({ rowId: "c", dpto: "Terraza" }),
    t({ rowId: "d", proveedor: "Plomería López" }),
    t({ rowId: "e", informe: "Filtración en el baño" }),
  ];
  it("q vacío devuelve todo", () => expect(buscarTareas(lista, "  ")).toBe(lista));
  it.each([
    ["pasillo", "a"], ["garay", "b"], ["terraza", "c"], ["lopez", "d"], ["filtracion", "e"],
  ])("coincide por %s", (q, id) => {
    expect(buscarTareas(lista, q).map((x) => x.rowId)).toEqual([id]);
  });
  it("ignora acentos y mayúsculas en ambos lados", () => {
    expect(buscarTareas(lista, "PLOMERÍA").map((x) => x.rowId)).toEqual(["d"]);
  });
  it("sin coincidencia → []", () => expect(buscarTareas(lista, "zzz")).toEqual([]));
});

describe("ordenarTareas", () => {
  const r = (iso: string) => `${iso}T10:00:00.000-03:00`;
  const abiertaBaja = t({ rowId: r("2026-09-01"), prioridad: "Baja" });
  const cerradaAlta = t({ rowId: r("2026-09-02"), prioridad: "Alta", estado: "Realizada" });
  const abiertaAlta = t({ rowId: r("2026-09-03"), prioridad: "Alta" });
  const abiertaMedia = t({ rowId: r("2026-09-04"), prioridad: "Media" });
  const abiertaAltaVieja = t({ rowId: r("2026-08-01"), prioridad: "Alta" });
  const lista = [abiertaBaja, cerradaAlta, abiertaAlta, abiertaMedia, abiertaAltaVieja];
  const ids = (l: Tarea[]) => l.map((x) => x.rowId.slice(0, 10));

  it("prioridad: abiertas antes que cerradas, Alta→Media→Baja, más reciente primero", () => {
    expect(ids(ordenarTareas(lista, "prioridad"))).toEqual([
      "2026-09-03", "2026-08-01", "2026-09-04", "2026-09-01", "2026-09-02",
    ]);
  });
  it("recientes / antiguas por fecha de creación (rowId)", () => {
    expect(ids(ordenarTareas(lista, "recientes"))[0]).toBe("2026-09-04");
    expect(ids(ordenarTareas(lista, "antiguas"))[0]).toBe("2026-08-01");
  });
  it("estimada: con fecha ascendente, sin fecha al final", () => {
    const l = [
      t({ rowId: r("2026-09-01"), fechaEstimada: "" }),
      t({ rowId: r("2026-09-02"), fechaEstimada: "2026-10-05" }),
      t({ rowId: r("2026-09-03"), fechaEstimada: "2026-09-25" }),
    ];
    expect(ids(ordenarTareas(l, "estimada"))).toEqual(["2026-09-03", "2026-09-02", "2026-09-01"]);
  });
  it("rowId no parseable va al final y no muta el array", () => {
    const raro = t({ rowId: "sin-fecha" });
    const l = [raro, abiertaAlta];
    const out = ordenarTareas(l, "recientes");
    expect(out[out.length - 1]).toBe(raro);
    expect(l[0]).toBe(raro);
  });
});
