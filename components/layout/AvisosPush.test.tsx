import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const { useAvisosPush } = vi.hoisted(() => ({ useAvisosPush: vi.fn() }));
vi.mock("@/hooks/useAvisosPush", () => ({ useAvisosPush }));

import { AvisosPush } from "./AvisosPush";

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

beforeEach(() => vi.clearAllMocks());

describe("AvisosPush", () => {
  it("sin clave configurada no renderiza", () => {
    useAvisosPush.mockReturnValue({ ...base, claveConfigurada: false });
    const { container } = render(<AvisosPush />);
    expect(container).toBeEmptyDOMElement();
  });

  it("sin soporte no renderiza", () => {
    useAvisosPush.mockReturnValue({ ...base, soporte: "sin-soporte" });
    const { container } = render(<AvisosPush />);
    expect(container).toBeEmptyDOMElement();
  });

  it("iPhone sin instalar: pide instalar la app", () => {
    useAvisosPush.mockReturnValue({ ...base, soporte: "ios-sin-instalar" });
    render(<AvisosPush />);
    expect(screen.getByText(/instalá la app/i)).toBeInTheDocument();
  });

  it("permiso bloqueado: lo dice", () => {
    useAvisosPush.mockReturnValue({ ...base, permiso: "denied" });
    render(<AvisosPush />);
    expect(screen.getByText(/bloqueados en el navegador/i)).toBeInTheDocument();
  });

  it("no suscripto: botón Activar avisos llama a activar", () => {
    useAvisosPush.mockReturnValue(base);
    render(<AvisosPush />);
    fireEvent.click(screen.getByRole("button", { name: /activar avisos/i }));
    expect(base.activar).toHaveBeenCalled();
  });

  it("suscripto: muestra activados y Desactivar llama a desactivar", () => {
    useAvisosPush.mockReturnValue({ ...base, suscripto: true, permiso: "granted" });
    render(<AvisosPush />);
    expect(screen.getByText(/avisos activados/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /desactivar/i }));
    expect(base.desactivar).toHaveBeenCalled();
  });

  it("muestra el error si lo hay", () => {
    useAvisosPush.mockReturnValue({ ...base, error: "No se pudo" });
    render(<AvisosPush />);
    expect(screen.getByText("No se pudo")).toBeInTheDocument();
  });
});
