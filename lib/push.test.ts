// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { setVapidDetails, sendNotification, getSuscripciones, deleteSuscripcion, isDemoMode } =
  vi.hoisted(() => ({
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
    getSuscripciones: vi.fn(),
    deleteSuscripcion: vi.fn(),
    isDemoMode: vi.fn(() => false),
  }));
vi.mock("web-push", () => ({ default: { setVapidDetails, sendNotification } }));
vi.mock("./sheets/suscripciones", () => ({ getSuscripciones, deleteSuscripcion }));
vi.mock("./demo-mode", () => ({ isDemoMode }));

import { notificar, _resetPush } from "./push";

const sub = (email: string, endpoint: string) => ({
  id: "x",
  email,
  endpoint,
  p256dh: "p",
  auth: "a",
  userAgent: "",
  creadoEn: "",
});
const aviso = { titulo: "T", cuerpo: "C", url: "/tareas/1" };

beforeEach(() => {
  vi.clearAllMocks();
  _resetPush();
  vi.stubEnv("VAPID_PUBLIC_KEY", "pub");
  vi.stubEnv("VAPID_PRIVATE_KEY", "priv");
  vi.stubEnv("VAPID_SUBJECT", "mailto:x@y.com");
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  sendNotification.mockResolvedValue({});
  deleteSuscripcion.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("notificar", () => {
  it("sin claves VAPID → no envía y devuelve ceros", async () => {
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    getSuscripciones.mockResolvedValue([sub("a@x.com", "e1")]);
    expect(await notificar(["a@x.com"], aviso)).toEqual({ enviados: 0, borradas: 0 });
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("envía a cada suscripción de los emails (normalizados y sin duplicados)", async () => {
    getSuscripciones.mockResolvedValue([sub("a@x.com", "e1"), sub("a@x.com", "e2")]);
    const r = await notificar(["A@X.com ", "a@x.com"], aviso);
    expect(getSuscripciones).toHaveBeenCalledWith(["a@x.com"]);
    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(sendNotification).toHaveBeenCalledWith(
      { endpoint: "e1", keys: { p256dh: "p", auth: "a" } },
      JSON.stringify(aviso),
      { TTL: 86400 }
    );
    expect(setVapidDetails).toHaveBeenCalledWith("mailto:x@y.com", "pub", "priv");
    expect(r).toEqual({ enviados: 2, borradas: 0 });
  });

  it("410 → borra esa suscripción y sigue con las demás", async () => {
    getSuscripciones.mockResolvedValue([sub("a@x.com", "muerta"), sub("a@x.com", "viva")]);
    sendNotification.mockImplementation(async (s: { endpoint: string }) => {
      if (s.endpoint === "muerta") throw Object.assign(new Error("gone"), { statusCode: 410 });
      return {};
    });
    const r = await notificar(["a@x.com"], aviso);
    expect(deleteSuscripcion).toHaveBeenCalledWith("muerta");
    expect(r).toEqual({ enviados: 1, borradas: 1 });
  });

  it("un error genérico se loguea y no lanza", async () => {
    getSuscripciones.mockResolvedValue([sub("a@x.com", "e1")]);
    sendNotification.mockRejectedValue(new Error("boom"));
    await expect(notificar(["a@x.com"], aviso)).resolves.toEqual({ enviados: 0, borradas: 0 });
    expect(deleteSuscripcion).not.toHaveBeenCalled();
  });

  it("emails vacíos → no lee nada", async () => {
    expect(await notificar([], aviso)).toEqual({ enviados: 0, borradas: 0 });
    expect(getSuscripciones).not.toHaveBeenCalled();
  });

  it("en demo no envía", async () => {
    isDemoMode.mockReturnValue(true);
    expect(await notificar(["a@x.com"], aviso)).toEqual({ enviados: 0, borradas: 0 });
    expect(getSuscripciones).not.toHaveBeenCalled();
    isDemoMode.mockReturnValue(false);
  });
});
