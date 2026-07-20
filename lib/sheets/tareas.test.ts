import { describe, it, expect } from "vitest";
import { parseTareasRows, tareaToRow } from "./tareas";
import { buildHeaderMap } from "./headers";

// Header NUEVO (snake_case, como está hoy en la planilla).
const headerNuevo = [
  "id", "objetivo", "fecha_inicio", "fecha_estimada", "edificio", "edificio_cuit",
  "parte_comun", "dpto", "informe", "comentario_en_proceso", "comentario_realizado",
  "reporte_url", "proveedor", "estado", "presupuesto", "fecha_realizado", "prioridad",
  "supervisor", "creado_en", "actualizado_en",
];
const filaNueva = [
  "2026-07-10T14:30:00.000Z", "Filtración", "2026-07-10", "2026-07-20", "Belgrano 1429",
  "30-54410451-5", "TRUE", "3A", "informe", "", "", "https://drive/r.pdf", "Prov",
  "Realizado", "1000", "2026-07-15", "Alta", "sup@x.com", "2026-07-10T14:30:00.000Z", "",
];

// Header VIEJO (por si quedara alguna hoja sin renombrar).
const headerViejo = [
  "rowId", "Objetivo", "Fecha inicio", "Fecha estimada", "Edificio", "Parte común",
  "Dpto / Parte común", "Informe", "comentario en proceso", "comentario realizado",
  "Proveedor", "Estado", "Presupuesto", "Fecha realizado", "Prioridad", "Supervisor",
];
const filaVieja = [
  "2026-07-11T09:00:00.000Z", "Pintura", "2026-07-11T00:00:00.000Z", "2026-07-21",
  "Nazca 2538", "SI", "HALL", "informe2", "", "", "ProvB", "Pendiente", "", "", "Media", "sup2@x.com",
];

describe("parseTareasRows — lectura por header", () => {
  it("mapea con headers NUEVOS (snake_case)", () => {
    const ts = parseTareasRows([headerNuevo, filaNueva]);
    expect(ts).toHaveLength(1);
    expect(ts[0].objetivo).toBe("Filtración");
    expect(ts[0].edificio).toBe("Belgrano 1429");
    expect(ts[0].parteComun).toBe(true);
    expect(ts[0].estado).toBe("Realizado");
    expect(ts[0].reporteUrl).toBe("https://drive/r.pdf");
    expect(ts[0].supervisor).toBe("sup@x.com");
    expect(ts[0].creadoEn).toBe("2026-07-10T14:30:00.000Z");
    // la media no vive en Tareas: arranca vacía (se puebla desde TareaArchivos)
    expect(ts[0].imagenes).toEqual([]);
  });

  it("mapea con headers VIEJOS (alias) — no requiere renombrar", () => {
    const ts = parseTareasRows([headerViejo, filaVieja]);
    expect(ts).toHaveLength(1);
    expect(ts[0].objetivo).toBe("Pintura");
    expect(ts[0].parteComun).toBe(true); // "SI" -> true
    expect(ts[0].dpto).toBe("HALL");
    expect(ts[0].fechaInicio).toBe("2026-07-11"); // truncado a YYYY-MM-DD
  });

  it("ignora filas que no son de datos (header/basura)", () => {
    const ts = parseTareasRows([headerNuevo, ["", "", ""], filaNueva]);
    expect(ts).toHaveLength(1);
    expect(ts[0].rowNumber).toBe(3); // fila 1 header, fila 2 vacía, fila 3 datos
  });
});

describe("tareaToRow — escritura por header", () => {
  it("coloca cada campo en la columna de su header", () => {
    const h = buildHeaderMap(headerNuevo);
    const row = tareaToRow(h, {
      rowId: "2026-07-10T14:30:00.000Z",
      objetivo: "Obj",
      edificio: "Belgrano 1429",
      parteComun: true,
      estado: "Pendiente",
      prioridad: "Alta",
      supervisor: "sup@x.com",
      creadoEn: "2026-07-10T14:30:00.000Z",
      actualizadoEn: "2026-07-12T00:00:00.000Z",
    });
    expect(row[headerNuevo.indexOf("id")]).toBe("2026-07-10T14:30:00.000Z");
    expect(row[headerNuevo.indexOf("objetivo")]).toBe("Obj");
    expect(row[headerNuevo.indexOf("parte_comun")]).toBe("TRUE");
    expect(row[headerNuevo.indexOf("creado_en")]).toBe("2026-07-10T14:30:00.000Z");
    expect(row[headerNuevo.indexOf("actualizado_en")]).toBe("2026-07-12T00:00:00.000Z");
    expect(row.length).toBe(headerNuevo.length);
  });

  it("normaliza fecha a YYYY-MM-DD al escribir", () => {
    const h = buildHeaderMap(headerNuevo);
    const row = tareaToRow(h, { rowId: "x", fechaInicio: "2026-07-10T14:30:00.000Z" });
    expect(row[headerNuevo.indexOf("fecha_inicio")]).toBe("2026-07-10");
  });
});
