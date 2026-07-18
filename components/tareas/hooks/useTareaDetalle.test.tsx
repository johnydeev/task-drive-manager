import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useTareaDetalle } from "./useTareaDetalle";

const { tarea } = vi.hoisted(() => ({
  tarea: {
    rowId: "2026-07-16T10:00:00.000Z",
    objetivo: "x", fechaInicio: "2026-07-16", fechaEstimada: "2026-07-20",
    edificio: "Edif A", parteComun: false, dpto: "1A", informe: "y",
    imagenes: [], videos: [], documentos: [],
    estado: "Pendiente", prioridad: "Media", supervisor: "owner@x.com",
  },
}));

vi.mock("@/lib/api-client", () => ({
  api: {
    tareas: {
      get: vi.fn().mockResolvedValue(tarea),
      remove: vi.fn().mockResolvedValue({ ok: true }),
      patchEstado: vi.fn().mockResolvedValue(tarea),
      generarReporte: vi.fn().mockResolvedValue({ reporteUrl: "http://x/r.pdf" }),
    },
  },
}));

const { useSession } = vi.hoisted(() => ({ useSession: vi.fn() }));
vi.mock("next-auth/react", () => ({ useSession }));

import { api } from "@/lib/api-client";

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useSession.mockReturnValue({ data: { user: { email: "owner@x.com", rol: "supervisor" } } });
});

describe("useTareaDetalle", () => {
  it("canModify es true para admin aunque no sea el dueño", async () => {
    useSession.mockReturnValue({ data: { user: { email: "otro@x.com", rol: "admin" } } });
    const { result } = renderHook(() => useTareaDetalle("r1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.tareaQ.isSuccess).toBe(true));
    expect(result.current.canModify).toBe(true);
  });

  it("canModify es false para un supervisor que no es el dueño", async () => {
    useSession.mockReturnValue({ data: { user: { email: "otro@x.com", rol: "supervisor" } } });
    const { result } = renderHook(() => useTareaDetalle("r1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.tareaQ.isSuccess).toBe(true));
    expect(result.current.canModify).toBe(false);
  });

  it("eliminar llama a la API y marca deleteDone", async () => {
    const { result } = renderHook(() => useTareaDetalle("r1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.tareaQ.isSuccess).toBe(true));
    await act(async () => { await result.current.eliminar.mutateAsync(); });
    expect(api.tareas.remove).toHaveBeenCalledWith("r1");
    await waitFor(() => expect(result.current.deleteDone).toBe(true));
  });

  it("patchEstado llama a la API con el estado", async () => {
    const { result } = renderHook(() => useTareaDetalle("r1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.tareaQ.isSuccess).toBe(true));
    await act(async () => { await result.current.patchEstado.mutateAsync("Realizado"); });
    expect(api.tareas.patchEstado).toHaveBeenCalledWith("r1", { estado: "Realizado" });
  });
});
