import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/api-client", () => ({
  api: {
    usuarios: { list: vi.fn().mockResolvedValue([{ email: "a@x.com", nombre: "Ana", rol: "admin", activo: true, creadoEn: "" }]) },
    asignaciones: { list: vi.fn().mockResolvedValue([{ email: "a@x.com", edificio: "Garay 350" }]) },
    directivas: { list: vi.fn().mockResolvedValue([]) },
    tareas: { list: vi.fn().mockResolvedValue([]) },
  },
}));
import { useUsuarios, useAsignaciones, useDirectivas, useTareas } from "./edificios-queries";
import { api } from "@/lib/api-client";

function wrap(qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}
beforeEach(() => vi.clearAllMocks());

describe("edificios-queries", () => {
  it("useUsuarios trae la lista", async () => {
    const { result } = renderHook(() => useUsuarios(), { wrapper: wrap() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0].nombre).toBe("Ana");
  });
  it("useAsignaciones trae la lista", async () => {
    const { result } = renderHook(() => useAsignaciones(), { wrapper: wrap() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
  });
  it("useDirectivas trae la lista", async () => {
    const { result } = renderHook(() => useDirectivas(), { wrapper: wrap() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  // Regresión: la key de useTareas debe empezar con "tareas" para que la alcance
  // el invalidateQueries({ queryKey: ["tareas"] }) que corre tras cada transición.
  // Con "tareas-all" (key vieja) nunca se refrescaba la vista Edificios.
  it("useTareas se invalida con invalidateQueries(['tareas'])", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useTareas(), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.tareas.list).toHaveBeenCalledTimes(1);

    await qc.invalidateQueries({ queryKey: ["tareas"] });
    await waitFor(() => expect(api.tareas.list).toHaveBeenCalledTimes(2));
  });
});
