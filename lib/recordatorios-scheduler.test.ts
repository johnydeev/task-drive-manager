// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { getTareas, getUsuarios, getConfigValor, setConfigValor, avisarLote, purgarAvisos, isDemoMode } =
  vi.hoisted(() => ({
    getTareas: vi.fn(),
    getUsuarios: vi.fn(),
    getConfigValor: vi.fn(),
    setConfigValor: vi.fn(),
    avisarLote: vi.fn(),
    purgarAvisos: vi.fn(),
    isDemoMode: vi.fn(() => false),
  }));
vi.mock("./sheets/tareas", () => ({ getTareas }));
vi.mock("./sheets/usuarios", () => ({ getUsuarios }));
vi.mock("./sheets/config", () => ({ getConfigValor, setConfigValor }));
vi.mock("./avisos", () => ({ avisarLote, RETENCION_AVISOS_MS: 30 * 24 * 3600 * 1000 }));
vi.mock("./sheets/avisos", () => ({ purgarAvisos }));
vi.mock("./demo-mode", () => ({ isDemoMode }));

import {
  correrRecordatoriosSiCorresponde,
  iniciarSchedulerRecordatorios,
  _resetScheduler,
  CLAVE_ULTIMO_ENVIO,
} from "./recordatorios-scheduler";

// Lunes 2026-09-21 08:00 ART = 11:00Z. Domingo 2026-09-20.
const LUNES_0800 = Date.parse("2026-09-21T11:00:00.000Z");
const LUNES_0759 = Date.parse("2026-09-21T10:59:00.000Z");
const DOMINGO_1000 = Date.parse("2026-09-20T13:00:00.000Z");

const tareaTrabada = {
  rowId: "r", objetivo: "x", edificio: "E", estado: "En Revisión",
  revisionEn: new Date(LUNES_0800 - 30 * 3600_000).toISOString(),
  imagenes: [], videos: [], documentos: [],
};
const admin = { email: "admin@x.com", nombre: "A", rol: "admin", activo: true };

beforeEach(() => {
  vi.clearAllMocks();
  _resetScheduler();
  isDemoMode.mockReturnValue(false);
  getConfigValor.mockResolvedValue(undefined);
  setConfigValor.mockResolvedValue(undefined);
  getTareas.mockResolvedValue([tareaTrabada]);
  getUsuarios.mockResolvedValue([admin]);
  avisarLote.mockResolvedValue(undefined);
  purgarAvisos.mockResolvedValue(0);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("correrRecordatoriosSiCorresponde", () => {
  it("domingo → omitido sin leer nada", async () => {
    expect(await correrRecordatoriosSiCorresponde(DOMINGO_1000)).toBe("omitido");
    expect(getConfigValor).not.toHaveBeenCalled();
  });

  it("antes de las 08:00 ART → omitido", async () => {
    expect(await correrRecordatoriosSiCorresponde(LUNES_0759)).toBe("omitido");
    expect(getTareas).not.toHaveBeenCalled();
  });

  it("lunes 08:00 sin envío hoy → envía y guarda la fecha", async () => {
    expect(await correrRecordatoriosSiCorresponde(LUNES_0800)).toBe("enviado");
    expect(avisarLote).toHaveBeenCalledWith([
      {
        email: "admin@x.com",
        aviso: expect.objectContaining({ tag: "recordatorio-revision" }),
        tipo: "recordatorio-revision",
      },
    ]);
    expect(setConfigValor).toHaveBeenCalledWith(CLAVE_ULTIMO_ENVIO, "2026-09-21");
  });

  it("purga los avisos de más de 30 días DESPUÉS de guardar la marca", async () => {
    purgarAvisos.mockResolvedValue(3);
    expect(await correrRecordatoriosSiCorresponde(LUNES_0800)).toBe("enviado");
    expect(purgarAvisos).toHaveBeenCalledWith(LUNES_0800 - 30 * 24 * 3600 * 1000);
    expect(setConfigValor.mock.invocationCallOrder[0]).toBeLessThan(purgarAvisos.mock.invocationCallOrder[0]);
  });

  it("si la purga lanza, igual devuelve enviado", async () => {
    purgarAvisos.mockRejectedValue(new Error("boom"));
    expect(await correrRecordatoriosSiCorresponde(LUNES_0800)).toBe("enviado");
    expect(setConfigValor).toHaveBeenCalled();
  });

  it("ya enviado hoy → omitido", async () => {
    getConfigValor.mockResolvedValue("2026-09-21");
    expect(await correrRecordatoriosSiCorresponde(LUNES_0800)).toBe("omitido");
    expect(avisarLote).not.toHaveBeenCalled();
  });

  it("si avisarLote lanza, no guarda la fecha (reintenta en el próximo tick)", async () => {
    avisarLote.mockRejectedValue(new Error("boom"));
    await expect(correrRecordatoriosSiCorresponde(LUNES_0800)).rejects.toThrow("boom");
    expect(setConfigValor).not.toHaveBeenCalled();
  });
});

describe("iniciarSchedulerRecordatorios", () => {
  it("sin NODE_ENV=production ni RECORDATORIOS_ENABLED no programa nada", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("RECORDATORIOS_ENABLED", "");
    expect(iniciarSchedulerRecordatorios()).toBe(false);
  });

  it("habilitado: programa una sola vez aunque se llame dos veces", () => {
    vi.useFakeTimers();
    vi.stubEnv("RECORDATORIOS_ENABLED", "1");
    expect(iniciarSchedulerRecordatorios()).toBe(true);
    expect(iniciarSchedulerRecordatorios()).toBe(false);
    expect(vi.getTimerCount()).toBe(2); // setTimeout inicial + setInterval
  });

  it("en demo no arranca", () => {
    vi.stubEnv("RECORDATORIOS_ENABLED", "1");
    isDemoMode.mockReturnValue(true);
    expect(iniciarSchedulerRecordatorios()).toBe(false);
  });
});
