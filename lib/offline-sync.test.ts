import { describe, it, expect, vi, beforeEach } from "vitest";

const { create, listPendientes, markSynced, incrementRetries, marcarRechazada } = vi.hoisted(() => ({
  create: vi.fn(),
  listPendientes: vi.fn(),
  markSynced: vi.fn(),
  incrementRetries: vi.fn(),
  marcarRechazada: vi.fn(),
}));
vi.mock("./api-client", async (orig) => {
  const real = await orig<typeof import("./api-client")>();
  return { ...real, api: { tareas: { create } } };
});
vi.mock("./offline-db", () => ({
  getDb: vi.fn(),
  listPendientes,
  markSynced,
  incrementRetries,
  marcarRechazada,
}));

import { syncPendingTareas } from "./offline-sync";
import { ApiClientError } from "./api-client";
import type { TareaPendiente } from "@/types";

const pend = (over: Partial<TareaPendiente> = {}): TareaPendiente =>
  ({
    localId: "L1",
    rowId: "R1",
    pendingSync: true,
    createdAt: "",
    retries: 0,
    objetivo: "x",
    fechaInicio: "2026-09-19",
    fechaEstimada: "",
    edificio: "E",
    parteComun: false,
    dpto: "1A",
    informe: "",
    prioridad: "Media",
    imagenes: [],
    videos: [],
    documentos: [],
    ...over,
  }) as TareaPendiente;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("navigator", { onLine: true });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("syncPendingTareas", () => {
  it("manda el rowId y marca synced con el rowId devuelto", async () => {
    listPendientes.mockResolvedValue([pend()]);
    create.mockResolvedValue({ rowId: "R1" });
    const r = await syncPendingTareas();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ rowId: "R1", objetivo: "x" }));
    expect(markSynced).toHaveBeenCalledWith("L1", "R1");
    expect(r).toEqual({ ok: 1, failed: 0, rechazadas: 0 });
  });

  it("rechazo (4xx) → marcarRechazada con el mensaje, sin incrementRetries", async () => {
    listPendientes.mockResolvedValue([pend()]);
    create.mockRejectedValue(new ApiClientError('Edificio "E" no es válido', 400));
    const r = await syncPendingTareas();
    expect(marcarRechazada).toHaveBeenCalledWith("L1", 'Edificio "E" no es válido');
    expect(incrementRetries).not.toHaveBeenCalled();
    expect(r.rechazadas).toBe(1);
  });

  it("fallo de red → incrementRetries, sin marcar", async () => {
    listPendientes.mockResolvedValue([pend()]);
    create.mockRejectedValue(new Error("Failed to fetch"));
    const r = await syncPendingTareas();
    expect(incrementRetries).toHaveBeenCalledWith("L1");
    expect(marcarRechazada).not.toHaveBeenCalled();
    expect(r.failed).toBe(1);
  });

  it("429 cuenta como red", async () => {
    listPendientes.mockResolvedValue([pend()]);
    create.mockRejectedValue(new ApiClientError("cuota", 429));
    await syncPendingTareas();
    expect(incrementRetries).toHaveBeenCalled();
    expect(marcarRechazada).not.toHaveBeenCalled();
  });

  it("una pendiente con muchos retries se intenta igual (sin tope)", async () => {
    listPendientes.mockResolvedValue([pend({ retries: 50 })]);
    create.mockResolvedValue({ rowId: "R1" });
    const r = await syncPendingTareas();
    expect(create).toHaveBeenCalledTimes(1);
    expect(r.ok).toBe(1);
  });

  it("sin red no hace nada", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    listPendientes.mockResolvedValue([pend()]);
    const r = await syncPendingTareas();
    expect(create).not.toHaveBeenCalled();
    expect(r).toEqual({ ok: 0, failed: 0, rechazadas: 0 });
  });
});
