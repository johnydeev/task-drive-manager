import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiFetch }));

import { useAvisosPush } from "./useAvisosPush";

// Stubs mínimos del navegador: Notification, PushManager vía serviceWorker.ready, matchMedia.
const subscribe = vi.fn();
const unsubscribe = vi.fn();
const getSubscription = vi.fn();
const requestPermission = vi.fn();
const fakeSub = {
  endpoint: "https://push/abc",
  toJSON: () => ({ endpoint: "https://push/abc", keys: { p256dh: "p", auth: "a" } }),
  unsubscribe,
};

function stubNavegador(opts: { permiso?: NotificationPermission; ios?: boolean; standalone?: boolean; soporte?: boolean } = {}) {
  const { permiso = "default", ios = false, standalone = false, soporte = true } = opts;
  vi.stubGlobal("Notification", soporte ? { permission: permiso, requestPermission } : undefined);
  vi.stubGlobal("PushManager", soporte ? function PushManager() {} : undefined);
  Object.defineProperty(window.navigator, "userAgent", {
    value: ios ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" : "Mozilla/5.0 (Linux; Android 14) Chrome/120",
    configurable: true,
  });
  Object.defineProperty(window.navigator, "serviceWorker", {
    value: soporte ? { ready: Promise.resolve({ pushManager: { getSubscription, subscribe } }) } : undefined,
    configurable: true,
  });
  Object.defineProperty(window, "matchMedia", {
    value: () => ({ matches: standalone }),
    configurable: true,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "BPUBLICKEY");
  getSubscription.mockResolvedValue(null);
  subscribe.mockResolvedValue(fakeSub);
  unsubscribe.mockResolvedValue(true);
  requestPermission.mockResolvedValue("granted");
  apiFetch.mockResolvedValue({ ok: true });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("useAvisosPush", () => {
  it("sin soporte → soporte 'sin-soporte'", async () => {
    stubNavegador({ soporte: false });
    const { result } = renderHook(() => useAvisosPush());
    await waitFor(() => expect(result.current.soporte).toBe("sin-soporte"));
  });

  it("iPhone sin la PWA instalada → 'ios-sin-instalar'", async () => {
    stubNavegador({ ios: true, standalone: false });
    const { result } = renderHook(() => useAvisosPush());
    await waitFor(() => expect(result.current.soporte).toBe("ios-sin-instalar"));
  });

  it("activar: pide permiso, suscribe con la clave y guarda en el server", async () => {
    stubNavegador();
    const { result } = renderHook(() => useAvisosPush());
    await waitFor(() => expect(result.current.soporte).toBe("ok"));
    await act(async () => {
      await result.current.activar();
    });
    expect(requestPermission).toHaveBeenCalled();
    expect(subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true, applicationServerKey: expect.any(Uint8Array) })
    );
    expect(apiFetch).toHaveBeenCalledWith("/api/push/suscribir", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(apiFetch.mock.calls[0][1].body)).toMatchObject({ endpoint: "https://push/abc" });
    expect(result.current.suscripto).toBe(true);
    expect(result.current.permiso).toBe("granted");
  });

  it("activar con una suscripción creada con otra clave VAPID la reemplaza", async () => {
    stubNavegador();
    const vieja = { ...fakeSub, options: { applicationServerKey: new Uint8Array([1, 2, 3]).buffer } };
    getSubscription.mockResolvedValue(vieja);
    const { result } = renderHook(() => useAvisosPush());
    await waitFor(() => expect(result.current.soporte).toBe("ok"));
    await act(async () => {
      await result.current.activar();
    });
    expect(unsubscribe).toHaveBeenCalled();
    expect(subscribe).toHaveBeenCalled();
  });

  it("activar con una suscripción de la misma clave la reutiliza", async () => {
    stubNavegador();
    const { result } = renderHook(() => useAvisosPush());
    await waitFor(() => expect(result.current.soporte).toBe("ok"));
    // Misma clave: la que subscribe() acaba de generar en el primer activar.
    await act(async () => {
      await result.current.activar();
    });
    const clave = subscribe.mock.calls[0][0].applicationServerKey as Uint8Array;
    getSubscription.mockResolvedValue({ ...fakeSub, options: { applicationServerKey: clave.buffer } });
    subscribe.mockClear();
    unsubscribe.mockClear();
    await act(async () => {
      await result.current.activar();
    });
    expect(unsubscribe).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("permiso denegado → no suscribe", async () => {
    stubNavegador();
    requestPermission.mockResolvedValue("denied");
    const { result } = renderHook(() => useAvisosPush());
    await waitFor(() => expect(result.current.soporte).toBe("ok"));
    await act(async () => {
      await result.current.activar();
    });
    expect(subscribe).not.toHaveBeenCalled();
    expect(result.current.permiso).toBe("denied");
    expect(result.current.suscripto).toBe(false);
  });

  it("desactivar: DELETE en el server y unsubscribe", async () => {
    stubNavegador({ permiso: "granted" });
    getSubscription.mockResolvedValue(fakeSub);
    const { result } = renderHook(() => useAvisosPush());
    await waitFor(() => expect(result.current.suscripto).toBe(true));
    await act(async () => {
      await result.current.desactivar();
    });
    expect(apiFetch).toHaveBeenCalledWith(
      `/api/push/suscribir?endpoint=${encodeURIComponent("https://push/abc")}`,
      { method: "DELETE" }
    );
    expect(unsubscribe).toHaveBeenCalled();
    expect(result.current.suscripto).toBe(false);
  });

  it("al montar con suscripción y permiso granted re-sincroniza con el server", async () => {
    stubNavegador({ permiso: "granted" });
    getSubscription.mockResolvedValue(fakeSub);
    renderHook(() => useAvisosPush());
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/api/push/suscribir", expect.objectContaining({ method: "POST" }))
    );
  });

  it("sin clave pública → claveConfigurada false", async () => {
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "");
    stubNavegador();
    const { result } = renderHook(() => useAvisosPush());
    expect(result.current.claveConfigurada).toBe(false);
  });
});
