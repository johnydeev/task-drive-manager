import { describe, expect, it } from "vitest";
import {
  LIMITE_INFRA_MB,
  limiteMB,
  mensajeArchivoPesado,
  mensajeErrorSubida,
} from "./upload-limits";
import { CONFIGURACION_DEFAULT } from "@/types";

const MB = 1024 * 1024;
const config = (over: Partial<typeof CONFIGURACION_DEFAULT> = {}) => ({
  ...CONFIGURACION_DEFAULT,
  ...over,
});

describe("limiteMB", () => {
  it("usa el valor de la hoja Configuracion cuando está por debajo del techo", () => {
    expect(limiteMB("video", config({ maxSizeVideoMB: 50 }))).toBe(50);
    expect(limiteMB("imagen", config({ maxSizeImagenMB: 8 }))).toBe(8);
    expect(limiteMB("documento", config({ maxSizePdfMB: 20 }))).toBe(20);
  });

  it("nunca supera el techo de infraestructura, aunque la hoja diga más", () => {
    expect(limiteMB("video", config({ maxSizeVideoMB: 500 }))).toBe(LIMITE_INFRA_MB);
  });

  it("el techo deja margen bajo el límite de 100 MB de Cloudflare", () => {
    expect(LIMITE_INFRA_MB).toBeLessThan(100);
  });
});

describe("mensajeArchivoPesado", () => {
  it("dice el máximo y cuánto pesa el archivo", () => {
    const msg = mensajeArchivoPesado("video", 187 * MB, 95);
    expect(msg).toContain("95 MB");
    expect(msg).toContain("187 MB");
    expect(msg).toMatch(/video/i);
  });

  it("adapta el texto al tipo de archivo", () => {
    expect(mensajeArchivoPesado("imagen", 20 * MB, 10)).toMatch(/imagen/i);
    expect(mensajeArchivoPesado("documento", 30 * MB, 20)).toMatch(/documento/i);
  });

  it("no redondea a 0 un archivo chico", () => {
    expect(mensajeArchivoPesado("imagen", 1.4 * MB, 1)).toContain("1.4 MB");
  });
});

describe("mensajeErrorSubida", () => {
  it("traduce el 'Failed to fetch' del navegador a algo accionable", () => {
    const msg = mensajeErrorSubida(new TypeError("Failed to fetch"), "video", 90 * MB);
    expect(msg).not.toMatch(/failed to fetch/i);
    expect(msg).toMatch(/conexión|señal/i);
    expect(msg).toContain("90 MB"); // que el usuario vea cuánto pesaba
  });

  it("traduce también el 'Load failed' de Safari/iOS", () => {
    const msg = mensajeErrorSubida(new TypeError("Load failed"), "video", 90 * MB);
    expect(msg).not.toMatch(/load failed/i);
  });

  it("deja pasar los errores que ya vienen con mensaje del servidor", () => {
    const msg = mensajeErrorSubida(new Error("Tipo de archivo no permitido: video/3gpp"), "video", 2 * MB);
    expect(msg).toBe("Tipo de archivo no permitido: video/3gpp");
  });
});
