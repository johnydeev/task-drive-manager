import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TareaPendiente } from "@/types";

const { usePendingTareas, useOnlineStatus, syncPendingTareas, reintentarPendiente, descartarPendiente } =
  vi.hoisted(() => ({
    usePendingTareas: vi.fn(),
    useOnlineStatus: vi.fn(),
    syncPendingTareas: vi.fn(),
    reintentarPendiente: vi.fn(),
    descartarPendiente: vi.fn(),
  }));
vi.mock("@/hooks/usePendingTareas", () => ({ usePendingTareas }));
vi.mock("@/hooks/useOnlineStatus", () => ({ useOnlineStatus }));
vi.mock("@/lib/offline-sync", () => ({ syncPendingTareas }));
vi.mock("@/lib/offline-db", () => ({ reintentarPendiente, descartarPendiente }));

import { PendientesDeSubir } from "./PendientesDeSubir";

const pend = (over: Partial<TareaPendiente> = {}): TareaPendiente =>
  ({
    localId: "L1",
    rowId: "R1",
    pendingSync: true,
    createdAt: "2026-09-19T10:00:00.000-03:00",
    retries: 0,
    objetivo: "Pintar pasillo",
    fechaInicio: "2026-09-19",
    fechaEstimada: "",
    edificio: "Garay 350",
    parteComun: false,
    dpto: "3B",
    informe: "",
    prioridad: "Media",
    imagenes: [],
    videos: [],
    documentos: [],
    ...over,
  }) as TareaPendiente;

beforeEach(() => {
  vi.clearAllMocks();
  useOnlineStatus.mockReturnValue(true);
  syncPendingTareas.mockResolvedValue({ ok: 1, failed: 0, rechazadas: 0 });
  reintentarPendiente.mockResolvedValue(undefined);
  descartarPendiente.mockResolvedValue(undefined);
});

describe("PendientesDeSubir", () => {
  it("sin pendientes no renderiza nada", () => {
    usePendingTareas.mockReturnValue([]);
    const { container } = render(<PendientesDeSubir />);
    expect(container).toBeEmptyDOMElement();
  });

  it("pendiente sin error: badge ámbar, sin botones", () => {
    usePendingTareas.mockReturnValue([pend()]);
    render(<PendientesDeSubir />);
    expect(screen.getByText("Pendientes de subir (1)")).toBeInTheDocument();
    expect(screen.getByText("Pintar pasillo")).toBeInTheDocument();
    expect(screen.getByText(/Garay 350 · 3B/)).toBeInTheDocument();
    expect(screen.getByText("Pendiente de subir")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reintentar/i })).not.toBeInTheDocument();
  });

  it("rechazada: badge rojo, mensaje y botones", () => {
    usePendingTareas.mockReturnValue([pend({ errorMsg: 'Edificio "Garay 350" no es válido' })]);
    render(<PendientesDeSubir />);
    expect(screen.getByText("No se pudo subir")).toBeInTheDocument();
    expect(screen.getByText('Edificio "Garay 350" no es válido')).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reintentar/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /descartar/i })).toBeInTheDocument();
  });

  it("Reintentar limpia el error, dispara el sync y avisa con tareas-synced", async () => {
    usePendingTareas.mockReturnValue([pend({ errorMsg: "no" })]);
    const user = userEvent.setup();
    const evento = vi.fn();
    window.addEventListener("tareas-synced", evento);
    render(<PendientesDeSubir />);
    await user.click(screen.getByRole("button", { name: /reintentar/i }));
    await waitFor(() => expect(syncPendingTareas).toHaveBeenCalled());
    expect(reintentarPendiente).toHaveBeenCalledWith("L1");
    await waitFor(() => expect(evento).toHaveBeenCalled());
    window.removeEventListener("tareas-synced", evento);
  });

  it("Descartar pide confirmación y borra", async () => {
    usePendingTareas.mockReturnValue([pend({ errorMsg: "no" })]);
    const user = userEvent.setup();
    render(<PendientesDeSubir />);
    await user.click(screen.getByRole("button", { name: /^descartar$/i }));
    expect(screen.getByText(/descartar tarea pendiente/i)).toBeInTheDocument();
    expect(descartarPendiente).not.toHaveBeenCalled();
    // El botón de confirmación del diálogo tiene el mismo texto: es el último en el DOM.
    const botones = screen.getAllByRole("button", { name: /^descartar$/i });
    await user.click(botones[botones.length - 1]);
    await waitFor(() => expect(descartarPendiente).toHaveBeenCalledWith("L1"));
  });

  it("sin red, Reintentar queda deshabilitado", () => {
    useOnlineStatus.mockReturnValue(false);
    usePendingTareas.mockReturnValue([pend({ errorMsg: "no" })]);
    render(<PendientesDeSubir />);
    expect(screen.getByRole("button", { name: /reintentar/i })).toBeDisabled();
  });
});
