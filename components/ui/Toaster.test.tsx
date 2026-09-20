import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act, fireEvent, renderHook } from "@testing-library/react";
import { ToastProvider, useToast } from "./Toaster";

function Disparador({ n = 1, tipo = "success" }: { n?: number; tipo?: "success" | "error" }) {
  const toast = useToast();
  return (
    <button
      onClick={() => {
        for (let i = 0; i < n; i++) toast[tipo](`Aviso ${i + 1}`);
      }}
    >
      disparar
    </button>
  );
}

afterEach(() => vi.useRealTimers());

describe("Toaster", () => {
  it("success renderiza con role=status y desaparece a los 4 s", () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <Disparador />
      </ToastProvider>
    );
    fireEvent.click(screen.getByText("disparar"));
    expect(screen.getByRole("status")).toHaveTextContent("Aviso 1");
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.queryByText("Aviso 1")).not.toBeInTheDocument();
  });

  it("tocar el toast lo cierra", () => {
    render(
      <ToastProvider>
        <Disparador tipo="error" />
      </ToastProvider>
    );
    fireEvent.click(screen.getByText("disparar"));
    fireEvent.click(screen.getByText("Aviso 1"));
    expect(screen.queryByText("Aviso 1")).not.toBeInTheDocument();
  });

  it("más de 3 descarta el más viejo", () => {
    render(
      <ToastProvider>
        <Disparador n={4} />
      </ToastProvider>
    );
    fireEvent.click(screen.getByText("disparar"));
    expect(screen.queryByText("Aviso 1")).not.toBeInTheDocument();
    expect(screen.getByText("Aviso 4")).toBeInTheDocument();
  });

  it("useToast sin provider no lanza", () => {
    const { result } = renderHook(() => useToast());
    expect(() => result.current.success("x")).not.toThrow();
  });
});
