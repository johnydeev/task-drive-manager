import { describe, expect, it } from "vitest";
import { tareaNuevaSchema, configuracionSchema } from "@/lib/schemas";

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
