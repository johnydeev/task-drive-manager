import { describe, it, expect, vi, beforeEach } from "vitest";

const { put, get, pendPut, pendGet, pendUpdate, pendDelete, pendFilter } = vi.hoisted(() => ({
  put: vi.fn(),
  get: vi.fn(),
  pendPut: vi.fn(),
  pendGet: vi.fn(),
  pendUpdate: vi.fn(),
  pendDelete: vi.fn(),
  pendFilter: vi.fn(),
}));
vi.mock("dexie", () => {
  class FakeDexie {
    cacheTareas = { put, get };
    tareasPendientes = { put: pendPut, get: pendGet, update: pendUpdate, delete: pendDelete, filter: pendFilter };
    version() {
      return { stores: () => this };
    }
  }
  return { default: FakeDexie, Table: class {} };
});

import {
  cacheTareas,
  readCachedTareas,
  isFresh,
  TTL_TAREAS_MS,
  listPendientes,
  marcarRechazada,
  reintentarPendiente,
  descartarPendiente,
} from "./offline-db";
import type { TareaPendiente } from "@/types";

beforeEach(() => {
  put.mockReset().mockResolvedValue(undefined);
  get.mockReset();
});

describe("isFresh", () => {
  it("usa 30 min por defecto y acepta un TTL custom", () => {
    const hace20min = new Date(Date.now() - 20 * 60_000).toISOString();
    const hace2h = new Date(Date.now() - 2 * 3_600_000).toISOString();
    expect(isFresh(hace20min)).toBe(true);
    expect(isFresh(hace2h)).toBe(false);
    expect(isFresh(hace2h, TTL_TAREAS_MS)).toBe(true);
    expect(isFresh("no-es-fecha")).toBe(false);
  });
});

describe("cacheTareas / readCachedTareas", () => {
  const tareas = [{ rowId: "1" }] as never;

  it("guarda bajo la key 'all' con timestamp", async () => {
    await cacheTareas(tareas);
    expect(put).toHaveBeenCalledWith(expect.objectContaining({ key: "all", value: tareas }));
  });

  it("devuelve el valor si tiene menos de 24 h", async () => {
    get.mockResolvedValue({
      key: "all",
      value: tareas,
      updatedAt: new Date(Date.now() - 23 * 3_600_000).toISOString(),
    });
    expect(await readCachedTareas()).toBe(tareas);
  });

  it("devuelve null si pasaron más de 24 h o no hay entrada", async () => {
    get.mockResolvedValue({
      key: "all",
      value: tareas,
      updatedAt: new Date(Date.now() - 25 * 3_600_000).toISOString(),
    });
    expect(await readCachedTareas()).toBeNull();
    get.mockResolvedValue(undefined);
    expect(await readCachedTareas()).toBeNull();
  });
});

describe("cola de pendientes", () => {
  const pend = (over: Partial<TareaPendiente>): TareaPendiente =>
    ({ localId: "L1", pendingSync: true, createdAt: "", retries: 0, objetivo: "x", ...over }) as TareaPendiente;

  beforeEach(() => {
    pendUpdate.mockReset().mockResolvedValue(1);
    pendDelete.mockReset().mockResolvedValue(undefined);
    pendFilter.mockReset();
  });

  it("listPendientes excluye las rechazadas (errorMsg) y las ya subidas", async () => {
    const filas = [
      pend({ localId: "a" }),
      pend({ localId: "b", errorMsg: "no" }),
      pend({ localId: "c", pendingSync: false }),
    ];
    pendFilter.mockImplementation((fn: (t: TareaPendiente) => boolean) => ({
      toArray: async () => filas.filter(fn),
    }));
    expect((await listPendientes()).map((t) => t.localId)).toEqual(["a"]);
  });

  it("marcarRechazada guarda el mensaje", async () => {
    await marcarRechazada("L1", "Edificio inválido");
    expect(pendUpdate).toHaveBeenCalledWith("L1", { errorMsg: "Edificio inválido" });
  });

  it("reintentarPendiente borra el mensaje", async () => {
    await reintentarPendiente("L1");
    expect(pendUpdate).toHaveBeenCalledWith("L1", { errorMsg: undefined });
  });

  it("descartarPendiente elimina la fila", async () => {
    await descartarPendiente("L1");
    expect(pendDelete).toHaveBeenCalledWith("L1");
  });
});
