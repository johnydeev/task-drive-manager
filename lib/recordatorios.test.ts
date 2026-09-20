import { describe, it, expect } from "vitest";
import { armarRecordatorios } from "./recordatorios";
import type { Tarea, Usuario } from "@/types";

const NOW = Date.parse("2026-09-21T11:00:00.000Z");
const hace = (horas: number) => new Date(NOW - horas * 3600_000).toISOString();

const t = (over: Partial<Tarea> = {}): Tarea =>
  ({
    rowId: "r", objetivo: "Pintar", fechaInicio: "2026-09-01", fechaEstimada: "", edificio: "Garay 350",
    parteComun: false, dpto: "1A", informe: "", imagenes: [], videos: [], documentos: [],
    estado: "Sin asignar", prioridad: "Media", supervisor: "s@x.com", ...over,
  }) as Tarea;

const u = (email: string, rol: "admin" | "supervisor", activo = true): Usuario =>
  ({ email, nombre: email, rol, activo, creadoEn: "" }) as Usuario;

const usuarios = [u("admin@x.com", "admin"), u("ex@x.com", "admin", false), u("op@x.com", "supervisor")];

describe("armarRecordatorios", () => {
  it("En Revisión > 24 h → un aviso por admin activo, ninguno al inactivo", () => {
    const r = armarRecordatorios([t({ estado: "En Revisión", revisionEn: hace(30) })], usuarios, NOW);
    expect(r).toHaveLength(1);
    expect(r[0].email).toBe("admin@x.com");
    expect(r[0].aviso.titulo).toBe("Tareas esperando tu revisión");
    expect(r[0].aviso.cuerpo).toBe("Pintar · Garay 350 espera tu revisión");
    expect(r[0].aviso.url).toBe("/tareas?estado=En+Revisi%C3%B3n&orden=antiguas");
  });

  it("En Revisión < 24 h → nada", () => {
    expect(armarRecordatorios([t({ estado: "En Revisión", revisionEn: hace(5) })], usuarios, NOW)).toEqual([]);
  });

  it("varias En Revisión → texto con el conteo", () => {
    const tareas = [t({ estado: "En Revisión", revisionEn: hace(30) }), t({ estado: "En Revisión", revisionEn: hace(50) })];
    expect(armarRecordatorios(tareas, usuarios, NOW)[0].aviso.cuerpo).toBe("2 tareas en revisión hace más de un día");
  });

  it.each([
    ["Asignada", "asignadaEn", "sin aceptar"],
    ["Aceptada", "aceptadaEn", "sin empezar"],
    ["Objetada", "objetadaEn", "objetada"],
  ] as const)("%s > 24 h → aviso al asignado con el motivo", (estado, campo, motivo) => {
    const r = armarRecordatorios([t({ estado, asignadoA: "op@x.com", [campo]: hace(26) })], usuarios, NOW);
    expect(r).toHaveLength(1);
    expect(r[0].email).toBe("op@x.com");
    expect(r[0].aviso.titulo).toBe("Tenés tareas sin avanzar");
    expect(r[0].aviso.cuerpo).toBe(`Pintar · Garay 350: ${motivo}`);
    expect(r[0].aviso.url).toBe("/tareas?mias=1&orden=antiguas");
  });

  it("varias del mismo asignado → una sola con el conteo", () => {
    const tareas = [
      t({ estado: "Asignada", asignadoA: "op@x.com", asignadaEn: hace(30) }),
      t({ estado: "Aceptada", asignadoA: "OP@x.com", aceptadaEn: hace(40) }),
    ];
    const r = armarRecordatorios(tareas, usuarios, NOW);
    expect(r).toHaveLength(1);
    expect(r[0].aviso.cuerpo).toBe("2 tareas esperan tu acción");
  });

  it("asignado inactivo o desconocido → nada", () => {
    const tareas = [
      t({ estado: "Asignada", asignadoA: "ex@x.com", asignadaEn: hace(30) }),
      t({ estado: "Asignada", asignadoA: "nadie@x.com", asignadaEn: hace(30) }),
    ];
    expect(armarRecordatorios(tareas, usuarios, NOW)).toEqual([]);
  });

  it("Sin asignar, En Proceso y Realizada no generan recordatorio", () => {
    const tareas = [
      t({ estado: "Sin asignar", actualizadoEn: hace(100) }),
      t({ estado: "En Proceso", asignadoA: "op@x.com", actualizadoEn: hace(100) }),
      t({ estado: "Realizada", asignadoA: "op@x.com", realizadaEn: hace(100), actualizadoEn: hace(100) }),
    ];
    expect(armarRecordatorios(tareas, usuarios, NOW)).toEqual([]);
  });

  it("sin timestamp del estado usa actualizadoEn; sin ninguno se ignora", () => {
    const conFallback = t({ estado: "Asignada", asignadoA: "op@x.com", actualizadoEn: hace(30) });
    const sinNada = t({ estado: "Asignada", asignadoA: "op@x.com" });
    expect(armarRecordatorios([conFallback], usuarios, NOW)).toHaveLength(1);
    expect(armarRecordatorios([sinNada], usuarios, NOW)).toEqual([]);
  });

  it("un admin que además es asignado recibe dos avisos", () => {
    const tareas = [
      t({ estado: "En Revisión", revisionEn: hace(30) }),
      t({ estado: "Asignada", asignadoA: "admin@x.com", asignadaEn: hace(30) }),
    ];
    const r = armarRecordatorios(tareas, usuarios, NOW);
    expect(r.map((x) => x.aviso.tag).sort()).toEqual(["recordatorio-mias", "recordatorio-revision"]);
    expect(r.every((x) => x.email === "admin@x.com")).toBe(true);
  });
});
