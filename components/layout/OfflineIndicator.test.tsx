import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OfflineIndicator } from "./OfflineIndicator";

vi.mock("@/hooks/useOnlineStatus", () => ({ useOnlineStatus: vi.fn() }));
vi.mock("@/hooks/usePendingTareas", () => ({ usePendingCount: vi.fn() }));

import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { usePendingCount } from "@/hooks/usePendingTareas";

const mockOnline = (v: boolean) => vi.mocked(useOnlineStatus).mockReturnValue(v);
const mockPending = (n: number) => vi.mocked(usePendingCount).mockReturnValue(n);

beforeEach(() => vi.clearAllMocks());

describe("OfflineIndicator", () => {
  it("online sin pendientes: punto verde, sin número", () => {
    mockOnline(true);
    mockPending(0);
    render(<OfflineIndicator />);
    const btn = screen.getByRole("button", { name: /conexión|conectado|al día/i });
    expect(btn.querySelector(".bg-emerald-500")).toBeTruthy();
    expect(screen.queryByText(/^\d+$/)).not.toBeInTheDocument();
  });

  it("online con pendientes: punto ámbar con el número", () => {
    mockOnline(true);
    mockPending(3);
    render(<OfflineIndicator />);
    expect(screen.getByText("3")).toBeInTheDocument();
    const btn = screen.getByRole("button", { name: /pendiente/i });
    expect(btn.querySelector(".bg-amber-500")).toBeTruthy();
  });

  it("offline: punto rojo y el modal se abre automáticamente", () => {
    mockOnline(false);
    mockPending(0);
    render(<OfflineIndicator />);
    const btn = screen.getByRole("button", { name: /sin conexión/i });
    expect(btn.querySelector(".bg-red-500")).toBeTruthy();
    // Auto-open al primer offline de la sesión:
    expect(screen.getByText(/modo sin conexión/i)).toBeInTheDocument();
  });

  it("tocar el punto abre el modal (estando online)", () => {
    mockOnline(true);
    mockPending(0);
    render(<OfflineIndicator />);
    expect(screen.queryByText(/modo sin conexión/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText(/modo sin conexión/i)).toBeInTheDocument();
    // Cierra con "Entendido"
    fireEvent.click(screen.getByRole("button", { name: /entendido/i }));
    expect(screen.queryByText(/modo sin conexión/i)).not.toBeInTheDocument();
  });
});
