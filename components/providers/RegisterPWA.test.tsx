import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { RegisterPWA } from "./RegisterPWA";

type Listener = (ev: MessageEvent) => void;
const listeners = new Map<string, Listener>();

beforeEach(() => {
  listeners.clear();
  vi.stubEnv("NODE_ENV", "production");
  Object.defineProperty(window.navigator, "serviceWorker", {
    configurable: true,
    value: {
      ready: new Promise(() => {}), // nunca resuelve: no nos interesa el flujo de update acá
      controller: null,
      addEventListener: (tipo: string, cb: Listener) => listeners.set(tipo, cb),
      removeEventListener: (tipo: string) => listeners.delete(tipo),
    },
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("RegisterPWA — mensajes del SW", () => {
  it("AVISO_NUEVO → evento 'aviso-nuevo' en window", () => {
    const spy = vi.fn();
    window.addEventListener("aviso-nuevo", spy);
    render(<RegisterPWA />);
    listeners.get("message")?.({ data: { type: "AVISO_NUEVO" } } as MessageEvent);
    expect(spy).toHaveBeenCalledTimes(1);
    window.removeEventListener("aviso-nuevo", spy);
  });

  it("TAREAS_SYNCED → evento 'tareas-synced' en window", () => {
    const spy = vi.fn();
    window.addEventListener("tareas-synced", spy);
    render(<RegisterPWA />);
    listeners.get("message")?.({ data: { type: "TAREAS_SYNCED" } } as MessageEvent);
    expect(spy).toHaveBeenCalledTimes(1);
    window.removeEventListener("tareas-synced", spy);
  });

  it("al desmontar saca el listener", () => {
    const { unmount } = render(<RegisterPWA />);
    expect(listeners.has("message")).toBe(true);
    unmount();
    expect(listeners.has("message")).toBe(false);
  });
});
