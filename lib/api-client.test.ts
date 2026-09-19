import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api, apiFetch } from "./api-client";

const fetchMock = vi.fn();
const assign = vi.fn();
const location = { assign, pathname: "/tareas", search: "?edificio=X" };

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  assign.mockReset();
  location.pathname = "/tareas";
  location.search = "?edificio=X";
  Object.defineProperty(window, "location", { value: location, writable: true, configurable: true });
});
afterEach(() => vi.unstubAllGlobals());

const respuesta = (status: number, body?: unknown) =>
  ({ ok: status < 400, status, json: async () => body }) as unknown as Response;

describe("apiFetch", () => {
  it("con 401 redirige a /login?from=<ruta actual> y devuelve la respuesta", async () => {
    fetchMock.mockResolvedValue(respuesta(401, { error: "No autenticado" }));
    const res = await apiFetch("/api/tareas");
    expect(res.status).toBe(401);
    expect(assign).toHaveBeenCalledWith("/login?from=%2Ftareas%3Fedificio%3DX");
  });

  it("con 401 estando en /login no redirige (evita loops)", async () => {
    location.pathname = "/login";
    location.search = "";
    fetchMock.mockResolvedValue(respuesta(401));
    await apiFetch("/api/tareas");
    expect(assign).not.toHaveBeenCalled();
  });

  it("con 200 no redirige", async () => {
    fetchMock.mockResolvedValue(respuesta(200, []));
    await apiFetch("/api/tareas");
    expect(assign).not.toHaveBeenCalled();
  });
});

describe("request (vía api.*)", () => {
  it("un 500 con ref arma el mensaje 'Error interno (ref …)'", async () => {
    fetchMock.mockResolvedValue(respuesta(500, { error: "Error interno", ref: "k3x9abcd" }));
    await expect(api.tareas.list()).rejects.toThrow("Error interno (ref k3x9abcd)");
  });

  it("un 4xx sin ref conserva el mensaje del server", async () => {
    fetchMock.mockResolvedValue(respuesta(403, { error: "Solo el admin puede asignar" }));
    await expect(api.tareas.list()).rejects.toThrow("Solo el admin puede asignar");
  });

  it("un 401 lanza además de redirigir", async () => {
    fetchMock.mockResolvedValue(respuesta(401, { error: "No autenticado" }));
    await expect(api.tareas.list()).rejects.toThrow("No autenticado");
    expect(assign).toHaveBeenCalled();
  });
});
