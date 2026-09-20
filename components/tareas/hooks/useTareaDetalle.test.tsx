import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useTareaDetalle } from "./useTareaDetalle";
import type { Tarea } from "@/types";

const { tarea } = vi.hoisted(() => ({
  tarea: {
    rowId: "2026-07-16T10:00:00.000Z",
    objetivo: "x", fechaInicio: "2026-07-16", fechaEstimada: "2026-07-20",
    edificio: "Edif A", parteComun: false, dpto: "1A", informe: "y",
    imagenes: [], videos: [], documentos: [],
    estado: "Sin asignar", prioridad: "Media", supervisor: "owner@x.com",
  },
}));

vi.mock("@/lib/api-client", () => ({
  api: {
    tareas: {
      get: vi.fn().mockResolvedValue(tarea),
      remove: vi.fn().mockResolvedValue({ ok: true }),
      asignar: vi.fn().mockResolvedValue(tarea),
      transicionar: vi.fn().mockResolvedValue(tarea),
      generarReporte: vi.fn().mockResolvedValue({ reporteUrl: "http://x/r.pdf" }),
    },
  },
}));

const { useSession, push } = vi.hoisted(() => ({ useSession: vi.fn(), push: vi.fn() }));
vi.mock("next-auth/react", () => ({ useSession }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}));

import { api } from "@/lib/api-client";

function wrapperCon(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return wrapperCon(qc);
}

beforeEach(() => {
  vi.clearAllMocks();
  useSession.mockReturnValue({ data: { user: { email: "owner@x.com", rol: "supervisor" } } });
});

describe("useTareaDetalle", () => {
  it("canEditFields es true para admin", async () => {
    useSession.mockReturnValue({ data: { user: { email: "otro@x.com", rol: "admin" } } });
    const { result } = renderHook(() => useTareaDetalle("r1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.tareaQ.isSuccess).toBe(true));
    expect(result.current.canEditFields).toBe(true);
  });

  it("canEditFields es false para un supervisor (editar campos es solo del admin)", async () => {
    useSession.mockReturnValue({ data: { user: { email: "otro@x.com", rol: "supervisor" } } });
    const { result } = renderHook(() => useTareaDetalle("r1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.tareaQ.isSuccess).toBe(true));
    expect(result.current.canEditFields).toBe(false);
  });

  it("eliminar llama a la API y vuelve a la lista", async () => {
    const { result } = renderHook(() => useTareaDetalle("r1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.tareaQ.isSuccess).toBe(true));
    await act(async () => { await result.current.eliminar.mutateAsync(); });
    expect(api.tareas.remove).toHaveBeenCalledWith("r1");
    await waitFor(() => expect(push).toHaveBeenCalledWith("/tareas"));
  });

  it("Realizada sin reporte: repolla cada 3 s y para cuando llega reporteUrl", async () => {
    vi.useFakeTimers();
    try {
      const realizada = { ...tarea, estado: "Realizada", realizadaEn: new Date().toISOString() } as Tarea;
      // mockReset: clearAllMocks no vacía la cola de mockResolvedValueOnce de otros casos.
      vi.mocked(api.tareas.get)
        .mockReset()
        .mockResolvedValueOnce(realizada)
        .mockResolvedValueOnce(realizada)
        .mockResolvedValue({ ...realizada, reporteUrl: "http://x/r.pdf" });
      const { result } = renderHook(() => useTareaDetalle("r1"), { wrapper: createWrapper() });
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      expect(result.current.esperandoReporte).toBe(true);
      await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
      await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
      expect(api.tareas.get).toHaveBeenCalledTimes(3);
      // El tercer fetch (con reporteUrl) se aplica vía el notifyManager de TanStack
      // (setTimeout 0): hay que avanzar el reloj falso un tick.
      await act(async () => { await vi.advanceTimersByTimeAsync(1); });
      expect(result.current.esperandoReporte).toBe(false);
      await act(async () => { await vi.advanceTimersByTimeAsync(9000); });
      expect(api.tareas.get).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("Realizada sin reporte: a los 20 intentos deja de repollar", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(api.tareas.get).mockResolvedValue({ ...tarea, estado: "Realizada", realizadaEn: new Date().toISOString() } as Tarea);
      const { result } = renderHook(() => useTareaDetalle("r1"), { wrapper: createWrapper() });
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      for (let i = 0; i < 25; i++) {
        await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
      }
      expect(vi.mocked(api.tareas.get).mock.calls.length).toBeLessThanOrEqual(22);
      expect(result.current.esperandoReporte).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("Realizada sin reporte pero cerrada hace tiempo (o por las 72 h, sin realizadaEn): sin polling", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(api.tareas.get).mockReset().mockResolvedValue({ ...tarea, estado: "Realizada" } as Tarea);
      const { result } = renderHook(() => useTareaDetalle("r1"), { wrapper: createWrapper() });
      await act(async () => { await vi.advanceTimersByTimeAsync(1); });
      await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
      expect(api.tareas.get).toHaveBeenCalledTimes(1);
      expect(result.current.esperandoReporte).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("no Realizada: sin polling", async () => {
    vi.useFakeTimers();
    try {
      // El mockResolvedValue del caso anterior persiste (clearAllMocks no lo limpia).
      vi.mocked(api.tareas.get).mockResolvedValue(tarea as Tarea);
      const { result } = renderHook(() => useTareaDetalle("r1"), { wrapper: createWrapper() });
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
      expect(api.tareas.get).toHaveBeenCalledTimes(1);
      expect(result.current.esperandoReporte).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("transicionar llama a la API con la acción", async () => {
    const { result } = renderHook(() => useTareaDetalle("r1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.tareaQ.isSuccess).toBe(true));
    await act(async () => { await result.current.transicionar.mutateAsync({ accion: "cerrar" }); });
    expect(api.tareas.transicionar).toHaveBeenCalledWith("r1", { accion: "cerrar" });
  });

  it("con la lista precargada, tareaQ.data está en el primer render sin llamar a api.tareas.get", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(["tareas", "all"], [tarea]);
    const { result } = renderHook(() => useTareaDetalle(tarea.rowId), { wrapper: wrapperCon(qc) });
    expect(result.current.tareaQ.data).toEqual(tarea);
    expect(api.tareas.get).not.toHaveBeenCalled();
  });

  it("sin lista precargada llama a api.tareas.get", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useTareaDetalle(tarea.rowId), { wrapper: wrapperCon(qc) });
    await waitFor(() => expect(result.current.tareaQ.isSuccess).toBe(true));
    expect(api.tareas.get).toHaveBeenCalledWith(tarea.rowId);
  });
});
