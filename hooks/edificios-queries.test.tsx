import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/api-client", () => ({
  api: {
    usuarios: { list: vi.fn().mockResolvedValue([{ email: "a@x.com", nombre: "Ana", rol: "admin", activo: true, creadoEn: "" }]) },
    asignaciones: { list: vi.fn().mockResolvedValue([{ email: "a@x.com", edificio: "Garay 350" }]) },
    directivas: { list: vi.fn().mockResolvedValue([]) },
  },
}));
import { useUsuarios, useAsignaciones, useDirectivas } from "./edificios-queries";

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
});
