import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const { useAvisosPush } = vi.hoisted(() => ({ useAvisosPush: vi.fn() }));
vi.mock("@/hooks/useAvisosPush", () => ({ useAvisosPush }));

import { BannerAvisos } from "./BannerAvisos";

const base = {
  soporte: "ok" as const,
  permiso: "default" as const,
  suscripto: false,
  ocupado: false,
  error: null,
  claveConfigurada: true,
  activar: vi.fn(),
  desactivar: vi.fn(),
};

// En este entorno `localStorage` es un objeto plano sin API de Storage: se stubea uno real.
function storageFalso() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("localStorage", storageFalso());
  useAvisosPush.mockReturnValue(base);
});

describe("BannerAvisos", () => {
  it("se muestra con permiso default y sin suscripción; Activar llama a activar", () => {
    render(<BannerAvisos />);
    fireEvent.click(screen.getByRole("button", { name: /^activar$/i }));
    expect(base.activar).toHaveBeenCalled();
  });

  it("«Ahora no» lo oculta y lo persiste", () => {
    const { unmount } = render(<BannerAvisos />);
    fireEvent.click(screen.getByRole("button", { name: /ahora no/i }));
    expect(screen.queryByText(/activá los avisos/i)).not.toBeInTheDocument();
    expect(localStorage.getItem("avisos-banner-cerrado")).toBe("1");
    unmount();
    const { container } = render(<BannerAvisos />);
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ["suscripto", { suscripto: true }],
    ["permiso denegado", { permiso: "denied" as const }],
    ["sin soporte", { soporte: "sin-soporte" as const }],
    ["sin clave", { claveConfigurada: false }],
  ])("no aparece si %s", (_n, over) => {
    useAvisosPush.mockReturnValue({ ...base, ...over });
    const { container } = render(<BannerAvisos />);
    expect(container).toBeEmptyDOMElement();
  });
});
