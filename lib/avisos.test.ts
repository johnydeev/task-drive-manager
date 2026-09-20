import { describe, it, expect, vi, beforeEach } from "vitest";

const { appendAvisos, reemplazarRecordatorios, notificar, isDemoMode } = vi.hoisted(() => ({
  appendAvisos: vi.fn(),
  reemplazarRecordatorios: vi.fn(),
  notificar: vi.fn(),
  isDemoMode: vi.fn(() => false),
}));
vi.mock("./sheets/avisos", () => ({ appendAvisos, reemplazarRecordatorios }));
vi.mock("./push", () => ({ notificar }));
vi.mock("./demo-mode", () => ({ isDemoMode }));

import { avisar, avisarLote } from "./avisos";

const aviso = { titulo: "Te asignaron una tarea", cuerpo: "x", url: "/tareas/1" };
const recordatorio = { titulo: "Tenés tareas", cuerpo: "y", url: "/tareas", tag: "recordatorio-mias" };

beforeEach(() => {
  vi.clearAllMocks();
  isDemoMode.mockReturnValue(false);
  appendAvisos.mockResolvedValue(undefined);
  reemplazarRecordatorios.mockResolvedValue(undefined);
  notificar.mockResolvedValue({ enviados: 1, borradas: 0 });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("avisar", () => {
  it("guarda una fila por email (normalizados, sin duplicados) y después manda el push", async () => {
    await avisar([" A@x.com", "a@x.com", "b@x.com", ""], aviso, "asignar");
    expect(appendAvisos).toHaveBeenCalledWith([
      { email: "a@x.com", titulo: aviso.titulo, cuerpo: "x", url: "/tareas/1", tipo: "asignar" },
      { email: "b@x.com", titulo: aviso.titulo, cuerpo: "x", url: "/tareas/1", tipo: "asignar" },
    ]);
    expect(notificar).toHaveBeenCalledWith(["a@x.com", "b@x.com"], aviso);
    expect(appendAvisos.mock.invocationCallOrder[0]).toBeLessThan(notificar.mock.invocationCallOrder[0]);
  });

  it("sin destinatarios → no guarda ni manda", async () => {
    await avisar([], aviso, "asignar");
    expect(appendAvisos).not.toHaveBeenCalled();
    expect(notificar).not.toHaveBeenCalled();
  });

  it("si guardar falla, igual manda el push y no lanza", async () => {
    appendAvisos.mockRejectedValue(new Error("sin hoja"));
    await expect(avisar(["a@x.com"], aviso, "objetar")).resolves.toBeUndefined();
    expect(notificar).toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith("[avisos] error guardando:", expect.any(Error));
  });

  it("si notificar lanza, no lanza", async () => {
    notificar.mockRejectedValue(new Error("boom"));
    await expect(avisar(["a@x.com"], aviso, "revisar")).resolves.toBeUndefined();
  });

  it("demo → nada", async () => {
    isDemoMode.mockReturnValue(true);
    await avisar(["a@x.com"], aviso, "asignar");
    expect(appendAvisos).not.toHaveBeenCalled();
    expect(notificar).not.toHaveBeenCalled();
  });
});

describe("avisarLote", () => {
  it("recordatorios por reemplazarRecordatorios, el resto por appendAvisos, un push por ítem", async () => {
    await avisarLote([
      { email: "A@x.com", aviso: recordatorio, tipo: "recordatorio-mias" },
      { email: "b@x.com", aviso: recordatorio, tipo: "recordatorio-revision" },
      { email: "c@x.com", aviso, tipo: "asignar" },
      { email: " ", aviso, tipo: "asignar" },
    ]);
    expect(reemplazarRecordatorios).toHaveBeenCalledTimes(1);
    expect(reemplazarRecordatorios.mock.calls[0][0]).toEqual([
      expect.objectContaining({ email: "a@x.com", tipo: "recordatorio-mias" }),
      expect.objectContaining({ email: "b@x.com", tipo: "recordatorio-revision" }),
    ]);
    expect(appendAvisos).toHaveBeenCalledWith([expect.objectContaining({ email: "c@x.com", tipo: "asignar" })]);
    expect(notificar).toHaveBeenCalledTimes(3);
    expect(notificar).toHaveBeenCalledWith(["a@x.com"], recordatorio);
    expect(notificar).toHaveBeenCalledWith(["c@x.com"], aviso);
  });

  it("vacío → nada", async () => {
    await avisarLote([]);
    expect(reemplazarRecordatorios).not.toHaveBeenCalled();
    expect(appendAvisos).not.toHaveBeenCalled();
    expect(notificar).not.toHaveBeenCalled();
  });

  it("demo → nada", async () => {
    isDemoMode.mockReturnValue(true);
    await avisarLote([{ email: "a@x.com", aviso, tipo: "asignar" }]);
    expect(notificar).not.toHaveBeenCalled();
  });
});
