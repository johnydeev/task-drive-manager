import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FirmaCanvas } from "./FirmaCanvas";

// jsdom no implementa el contexto 2D del canvas: se mockea lo que usa el componente.
const ctx = {
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  clearRect: vi.fn(),
  lineWidth: 0,
  lineCap: "",
  strokeStyle: "",
};

beforeEach(() => {
  Object.values(ctx).forEach((v) => {
    if (typeof v === "function") (v as ReturnType<typeof vi.fn>).mockClear();
  });
  HTMLCanvasElement.prototype.getContext = vi.fn(
    () => ctx
  ) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.toBlob = vi.fn((cb: BlobCallback) =>
    cb(new Blob(["x"], { type: "image/png" }))
  ) as unknown as typeof HTMLCanvasElement.prototype.toBlob;
});

describe("FirmaCanvas", () => {
  it("arranca con Guardar deshabilitado porque no hay trazo", () => {
    render(<FirmaCanvas onGuardar={vi.fn()} guardando={false} />);
    expect(screen.getByRole("button", { name: /guardar firma/i })).toBeDisabled();
  });

  it("habilita Guardar después de dibujar", () => {
    render(<FirmaCanvas onGuardar={vi.fn()} guardando={false} />);
    const canvas = screen.getByTestId("firma-canvas");
    fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10 });
    fireEvent.pointerMove(canvas, { clientX: 30, clientY: 20 });
    fireEvent.pointerUp(canvas);
    expect(screen.getByRole("button", { name: /guardar firma/i })).toBeEnabled();
  });

  it("Borrar vuelve a dejar Guardar deshabilitado", () => {
    render(<FirmaCanvas onGuardar={vi.fn()} guardando={false} />);
    const canvas = screen.getByTestId("firma-canvas");
    fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10 });
    fireEvent.pointerUp(canvas);
    fireEvent.click(screen.getByRole("button", { name: /borrar/i }));
    expect(screen.getByRole("button", { name: /guardar firma/i })).toBeDisabled();
  });

  it("entrega un Blob PNG al guardar", () => {
    const onGuardar = vi.fn();
    render(<FirmaCanvas onGuardar={onGuardar} guardando={false} />);
    const canvas = screen.getByTestId("firma-canvas");
    fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10 });
    fireEvent.pointerUp(canvas);
    fireEvent.click(screen.getByRole("button", { name: /guardar firma/i }));
    expect(onGuardar).toHaveBeenCalledWith(expect.any(Blob));
  });

  it("bloquea el botón mientras guarda", () => {
    render(<FirmaCanvas onGuardar={vi.fn()} guardando />);
    expect(screen.getByRole("button", { name: /guardar firma/i })).toBeDisabled();
  });

  // El canvas se muestra estirado (`w-full`) pero su buffer es 480x160: sin convertir,
  // el trazo aparece corrido respecto del cursor.
  it("convierte las coordenadas del puntero a la escala del canvas", () => {
    render(<FirmaCanvas onGuardar={vi.fn()} guardando={false} />);
    const canvas = screen.getByTestId("firma-canvas");
    // Mostrado al doble de ancho y a la mitad de alto que su buffer, con offset.
    canvas.getBoundingClientRect = () =>
      ({ left: 100, top: 50, width: 960, height: 80 }) as DOMRect;

    fireEvent.pointerDown(canvas, { clientX: 340, clientY: 90 });
    // x: (340-100) * 480/960 = 120 · y: (90-50) * 160/80 = 80
    expect(ctx.moveTo).toHaveBeenCalledWith(120, 80);

    fireEvent.pointerMove(canvas, { clientX: 580, clientY: 70 });
    // x: (580-100) * 0.5 = 240 · y: (70-50) * 2 = 40
    expect(ctx.lineTo).toHaveBeenCalledWith(240, 40);
  });

  it("no rompe si el canvas todavía no tiene tamaño en pantalla", () => {
    render(<FirmaCanvas onGuardar={vi.fn()} guardando={false} />);
    const canvas = screen.getByTestId("firma-canvas");
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 0, height: 0 }) as DOMRect;
    fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10 });
    expect(ctx.moveTo).toHaveBeenCalledWith(10, 10);
  });
});
