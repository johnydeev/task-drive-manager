// @vitest-environment node
import { describe, it, expect } from "vitest";
import { estaReferenciado, type ReferenciasArchivos } from "./archivo-referencias";
import type { Tarea, Usuario, Visita } from "@/types";

const drive = (id: string) => `https://drive.google.com/file/d/${id}/view`;

const tarea = (extra: Partial<Tarea> = {}): Tarea =>
  ({
    rowId: "t1",
    objetivo: "x",
    fechaInicio: "2026-01-01",
    fechaEstimada: "",
    edificio: "E",
    parteComun: false,
    dpto: "1A",
    informe: "",
    imagenes: [],
    videos: [],
    documentos: [],
    estado: "Sin asignar",
    prioridad: "Media",
    supervisor: "s@x.com",
    ...extra,
  }) as Tarea;

const visita = (pdfUrl: string): Visita => ({
  id: "v1",
  edificio: "E",
  fecha: "2026-01-01",
  pdfUrl,
  supervisor: "s@x.com",
  creadoEn: "2026-01-01T00:00:00.000-03:00",
});

const usuario = (firmaUrl?: string): Usuario => ({
  email: "u@x.com",
  nombre: "U",
  rol: "supervisor",
  activo: true,
  creadoEn: "2026-01-01T00:00:00.000-03:00",
  firmaUrl,
});

const vacio: ReferenciasArchivos = { tareas: [], visitas: [], usuarios: [] };

describe("estaReferenciado", () => {
  it("refs vacías → false", () => {
    expect(estaReferenciado("abc", vacio)).toBe(false);
  });

  it.each([
    ["imagen", tarea({ imagenes: [drive("abc")] })],
    ["video", tarea({ videos: [drive("abc")] })],
    ["documento", tarea({ documentos: [drive("abc")] })],
    ["reporteUrl", tarea({ reporteUrl: drive("abc") })],
  ])("referenciado como %s de una tarea → true", (_campo, t) => {
    expect(estaReferenciado("abc", { ...vacio, tareas: [t] })).toBe(true);
  });

  it("referenciado como pdfUrl de una visita → true", () => {
    expect(estaReferenciado("abc", { ...vacio, visitas: [visita(drive("abc"))] })).toBe(true);
  });

  it("referenciado como firmaUrl de un usuario → true", () => {
    expect(estaReferenciado("abc", { ...vacio, usuarios: [usuario(drive("abc"))] })).toBe(true);
  });

  it("id distinto → false", () => {
    const refs: ReferenciasArchivos = {
      tareas: [tarea({ imagenes: [drive("otro")], reporteUrl: drive("otro2") })],
      visitas: [visita(drive("otro3"))],
      usuarios: [usuario(drive("otro4"))],
    };
    expect(estaReferenciado("abc", refs)).toBe(false);
  });

  it("matchea por id aunque la URL tenga ?usp=sharing", () => {
    const refs = { ...vacio, usuarios: [usuario(`${drive("abc")}?usp=sharing`)] };
    expect(estaReferenciado("abc", refs)).toBe(true);
  });

  it("ignora URLs sin id de Drive y firmas ausentes", () => {
    const refs: ReferenciasArchivos = {
      tareas: [tarea({ imagenes: ["https://otro.host/abc"] })],
      visitas: [visita("")],
      usuarios: [usuario(undefined)],
    };
    expect(estaReferenciado("abc", refs)).toBe(false);
  });
});
