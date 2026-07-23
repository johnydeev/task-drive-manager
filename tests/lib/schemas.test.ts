import { describe, expect, it } from "vitest";
import {
  tareaNuevaSchema,
  tareaFormSchema,
  tareaUpdateSchema,
  configuracionSchema,
  directivaNuevaSchema,
  directivaPatchSchema,
  asignacionSchema,
} from "@/lib/schemas";

describe("tareaNuevaSchema", () => {
  const base = {
    objetivo: "x",
    fechaInicio: "2026-01-01",
    fechaEstimada: "2026-01-10",
    edificio: "Av. 123",
    parteComun: true,
    dpto: "Terraza",
    informe: "test",
    prioridad: "Media" as const,
  };

  it("rechaza parteComun=true sin parte común seleccionada", () => {
    const { dpto, ...sinDpto } = base;
    void dpto;
    expect(() => tareaNuevaSchema.parse({ ...sinDpto, parteComun: true })).toThrow();
  });

  it("rechaza parteComun=false sin dpto", () => {
    const { dpto, ...sinDpto } = base;
    void dpto;
    expect(() => tareaNuevaSchema.parse({ ...sinDpto, parteComun: false })).toThrow();
  });

  it("acepta parteComun=true con parte común seleccionada", () => {
    const result = tareaNuevaSchema.parse({ ...base, parteComun: true, dpto: "Hall de entrada" });
    expect(result.dpto).toBe("Hall de entrada");
  });

  it("acepta fechaEstimada vacía (opcional)", () => {
    expect(tareaNuevaSchema.safeParse({ ...base, fechaEstimada: "" }).success).toBe(true);
  });

  it("acepta documentos como array de URLs", () => {
    const result = tareaNuevaSchema.parse({
      ...base,
      documentos: ["https://drive.google.com/file/d/abc/view"],
    });
    expect(result.documentos).toEqual(["https://drive.google.com/file/d/abc/view"]);
  });

  it("documentos default vacío cuando no se pasa", () => {
    const result = tareaNuevaSchema.parse(base);
    expect(result.documentos).toEqual([]);
  });

  it("rechaza documentos que no son URLs", () => {
    expect(() =>
      tareaNuevaSchema.parse({ ...base, documentos: ["no-es-url"] })
    ).toThrow();
  });
});

// El form del cliente comparte la regla del dpto con el servidor (misma fuente).
describe("tareaFormSchema", () => {
  const base = {
    objetivo: "x",
    fechaInicio: "2026-01-01",
    fechaEstimada: "2026-01-10",
    edificio: "Av. 123",
    parteComun: false,
    dpto: "1A",
    informe: "test",
    estado: "Sin asignar" as const,
    prioridad: "Media" as const,
  };

  it("rechaza parteComun=false sin dpto (misma regla que el servidor)", () => {
    const { dpto, ...sinDpto } = base;
    void dpto;
    expect(tareaFormSchema.safeParse({ ...sinDpto, parteComun: false }).success).toBe(false);
  });

  it("rechaza parteComun=true sin parte común", () => {
    const { dpto, ...sinDpto } = base;
    void dpto;
    expect(tareaFormSchema.safeParse({ ...sinDpto, parteComun: true }).success).toBe(false);
  });

  it("acepta una tarea válida", () => {
    expect(tareaFormSchema.safeParse(base).success).toBe(true);
  });

  it("acepta los comentarios de edición (no están en el schema del servidor)", () => {
    const r = tareaFormSchema.safeParse({
      ...base,
      comentarioEnProceso: "en curso",
      comentarioRealizado: "listo",
    });
    expect(r.success).toBe(true);
  });
});

// El form de edición manda SIEMPRE todos los campos, incluidas las fechas opcionales
// vacías (`<input type="date">` sin valor = ""). El schema de update tiene que aceptar
// ese "" igual que el de alta, o editar una tarea sin fecha estimada tira "Datos inválidos".
describe("tareaUpdateSchema", () => {
  it("acepta fechaEstimada vacía (tarea sin fecha estimada en edición)", () => {
    const r = tareaUpdateSchema.safeParse({ objetivo: "nuevo objetivo", fechaEstimada: "" });
    expect(r.success).toBe(true);
  });

  it("preserva el vacío tal cual (permite borrar una fecha ya cargada)", () => {
    const r = tareaUpdateSchema.parse({ objetivo: "x", fechaEstimada: "" });
    expect(r.fechaEstimada).toBe("");
  });

  it("acepta fechaRealizado vacía", () => {
    expect(tareaUpdateSchema.safeParse({ fechaRealizado: "" }).success).toBe(true);
  });

  it("sigue rechazando una fecha con formato inválido", () => {
    expect(tareaUpdateSchema.safeParse({ fechaEstimada: "13/07/2026" }).success).toBe(false);
  });

  it("acepta el payload completo del form de edición", () => {
    const r = tareaUpdateSchema.safeParse({
      objetivo: "Cambiar luminaria",
      fechaInicio: "2026-07-23",
      fechaEstimada: "",
      edificio: "BOEDO 414",
      parteComun: false,
      dpto: "1H",
      informe: "detalle",
      proveedor: "ACOSTA ROMERO DANIEL",
      presupuesto: undefined,
      prioridad: "Media",
      comentarioEnProceso: "",
      comentarioRealizado: "",
      imagenes: [],
      videos: [],
      documentos: [],
    });
    expect(r.success).toBe(true);
  });
});

describe("directivaPatchSchema", () => {
  it("acepta una acción válida", () => {
    expect(directivaPatchSchema.safeParse({ id: "1", accion: "aceptar" }).success).toBe(true);
  });
  it("rechaza acción inválida", () => {
    expect(directivaPatchSchema.safeParse({ id: "1", accion: "xx" }).success).toBe(false);
  });
  it("acepta nota opcional", () => {
    const r = directivaPatchSchema.parse({ id: "1", accion: "cerrar", nota: "listo" });
    expect(r.nota).toBe("listo");
  });
});

describe("configuracionSchema", () => {
  const validConfig = {
    maxImagenes: 10,
    maxVideos: 3,
    maxDocumentos: 5,
    maxSizeImagenMB: 10,
    maxSizeVideoMB: 100,
    maxSizePdfMB: 20,
  };

  it("acepta config completa con maxDocumentos y maxSizePdfMB", () => {
    const result = configuracionSchema.parse(validConfig);
    expect(result.maxDocumentos).toBe(5);
    expect(result.maxSizePdfMB).toBe(20);
  });

  it("rechaza maxSizePdfMB negativo", () => {
    expect(() =>
      configuracionSchema.parse({ ...validConfig, maxSizePdfMB: -1 })
    ).toThrow();
  });

  it("rechaza maxDocumentos negativo", () => {
    expect(() =>
      configuracionSchema.parse({ ...validConfig, maxDocumentos: -1 })
    ).toThrow();
  });
});

describe("directivaNuevaSchema", () => {
  const base = { descripcion: "Visitar edificio X", fecha: "2026-07-17", asignadoA: "OP@X.com" };
  it("acepta una directiva válida y baja el email", () => {
    const r = directivaNuevaSchema.parse(base);
    expect(r.asignadoA).toBe("op@x.com");
  });
  it("rechaza descripcion vacía", () => {
    expect(directivaNuevaSchema.safeParse({ ...base, descripcion: "" }).success).toBe(false);
  });
  it("rechaza asignadoA no-email", () => {
    expect(directivaNuevaSchema.safeParse({ ...base, asignadoA: "x" }).success).toBe(false);
  });
});

describe("asignacionSchema", () => {
  it("acepta email+edificio y baja el email", () => {
    const r = asignacionSchema.parse({ email: "A@X.com", edificio: "Belgrano 1429" });
    expect(r.email).toBe("a@x.com");
    expect(r.edificio).toBe("Belgrano 1429");
  });
  it("rechaza edificio vacío", () => {
    expect(asignacionSchema.safeParse({ email: "a@x.com", edificio: "" }).success).toBe(false);
  });
});
