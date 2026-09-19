import { describe, it, expect, vi, beforeEach } from "vitest";

const { put, get } = vi.hoisted(() => ({ put: vi.fn(), get: vi.fn() }));
vi.mock("dexie", () => {
  class FakeDexie {
    cacheTareas = { put, get };
    version() {
      return { stores: () => this };
    }
  }
  return { default: FakeDexie, Table: class {} };
});

import { cacheTareas, readCachedTareas, isFresh, TTL_TAREAS_MS } from "./offline-db";

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
