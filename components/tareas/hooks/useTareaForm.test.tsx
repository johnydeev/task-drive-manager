import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Tarea } from "@/types";
import { useTareaForm } from "./useTareaForm";

vi.mock("@/lib/api-client", () => ({
  api: {
    tareas: { create: vi.fn(), update: vi.fn() },
    edificios: { list: vi.fn().mockResolvedValue([]) },
    dptos: { list: vi.fn().mockResolvedValue([]) },
    proveedores: { list: vi.fn().mockResolvedValue([]) },
    configuracion: { get: vi.fn().mockResolvedValue(null) },
  },
}));
vi.mock("@/lib/offline-db", () => ({
  enqueueTarea: vi.fn(),
  cacheEdificios: vi.fn(), readCachedEdificios: vi.fn(),
  cacheDptos: vi.fn(), readCachedDptos: vi.fn(),
  cacheConfig: vi.fn(), readCachedConfig: vi.fn(),
  cacheProveedores: vi.fn(), readCachedProveedores: vi.fn(),
}));
vi.mock("@/lib/background-sync", () => ({ registerBackgroundSync: vi.fn() }));
vi.mock("@/hooks/useOnlineStatus", () => ({ useOnlineStatus: vi.fn(() => true) }));

import { api } from "@/lib/api-client";
import { enqueueTarea } from "@/lib/offline-db";
import { registerBackgroundSync } from "@/lib/background-sync";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

const validInitial: Tarea = {
  rowId: "2026-07-16T10:00:00.000Z",
  objetivo: "Pintura",
  fechaInicio: "2026-07-16",
  fechaEstimada: "2026-07-20",
  edificio: "Edif A",
  parteComun: false,
  dpto: "1A",
  informe: "algo",
  imagenes: [],
  videos: [],
  documentos: [],
  estado: "Pendiente",
  prioridad: "Media",
  supervisor: "x@y.com",
};

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useOnlineStatus).mockReturnValue(true);
});

describe("useTareaForm", () => {
  it("create online: llama api.tareas.create y muestra éxito", async () => {
    vi.mocked(api.tareas.create).mockResolvedValue({ ...validInitial });
    const { result } = renderHook(
      () => useTareaForm({ mode: "create", initial: validInitial }),
      { wrapper: createWrapper() }
    );
    await act(async () => { await result.current.submitForm(); });
    expect(api.tareas.create).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.successMsg).toBe("Tarea creada exitosamente"));
  });

  it("create offline: encola y registra background sync, sin llamar a la API", async () => {
    vi.mocked(useOnlineStatus).mockReturnValue(false);
    const { result } = renderHook(
      () => useTareaForm({ mode: "create", initial: validInitial }),
      { wrapper: createWrapper() }
    );
    await act(async () => { await result.current.submitForm(); });
    expect(enqueueTarea).toHaveBeenCalledTimes(1);
    expect(registerBackgroundSync).toHaveBeenCalledWith("sync-tareas");
    expect(api.tareas.create).not.toHaveBeenCalled();
  });

  it("edit: llama api.tareas.update con el rowId de la tarea", async () => {
    vi.mocked(api.tareas.update).mockResolvedValue({ ...validInitial });
    const { result } = renderHook(
      () => useTareaForm({ mode: "edit", initial: validInitial }),
      { wrapper: createWrapper() }
    );
    await act(async () => { await result.current.submitForm(); });
    expect(api.tareas.update).toHaveBeenCalledWith(validInitial.rowId, expect.anything());
    await waitFor(() => expect(result.current.successMsg).toBe("Tarea editada exitosamente"));
  });

  it("si la API falla, setea submitError", async () => {
    vi.mocked(api.tareas.create).mockRejectedValue(new Error("boom"));
    const { result } = renderHook(
      () => useTareaForm({ mode: "create", initial: validInitial }),
      { wrapper: createWrapper() }
    );
    await act(async () => { await result.current.submitForm(); });
    await waitFor(() => expect(result.current.submitError).toBe("boom"));
  });

  it("no submitea si faltan campos requeridos (validación del schema)", async () => {
    const { result } = renderHook(
      () => useTareaForm({ mode: "create" }), // sin initial → objetivo/edificio/dpto vacíos
      { wrapper: createWrapper() }
    );
    await act(async () => { await result.current.submitForm(); });
    expect(api.tareas.create).not.toHaveBeenCalled();
  });
});
