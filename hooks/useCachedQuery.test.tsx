import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCachedQuery } from "./useCachedQuery";

// Wrapper con QueryClient aislado por test y retry desactivado (para que un fetcher
// que rechaza vaya derecho a isError sin reintentos que ralentizan el test).
function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

describe("useCachedQuery", () => {
  it("devuelve los datos del fetcher y los cachea", async () => {
    const fetcher = vi.fn().mockResolvedValue(["a", "b"]);
    const cache = vi.fn().mockResolvedValue(undefined);
    const readCache = vi.fn();

    const { result } = renderHook(
      () => useCachedQuery({ queryKey: ["k-ok"], fetcher, cache, readCache }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(["a", "b"]);
    expect(cache).toHaveBeenCalledWith(["a", "b"]);
    // En el camino feliz NUNCA se toca el cache de lectura.
    expect(readCache).not.toHaveBeenCalled();
  });

  it("si el fetcher falla y hay cache, devuelve el cache sin error", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("sin red"));
    const cache = vi.fn();
    const readCache = vi.fn().mockResolvedValue(["cacheado"]);

    const { result } = renderHook(
      () => useCachedQuery({ queryKey: ["k-fallback"], fetcher, cache, readCache }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(["cacheado"]);
    expect(result.current.isError).toBe(false);
  });

  it("si el fetcher falla y el cache está vacío, propaga el error", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("sin red"));
    const cache = vi.fn();
    const readCache = vi.fn().mockResolvedValue(null);

    const { result } = renderHook(
      () => useCachedQuery({ queryKey: ["k-error"], fetcher, cache, readCache }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it("una falla al cachear no rompe el éxito del fetch", async () => {
    const fetcher = vi.fn().mockResolvedValue(["dato"]);
    const cache = vi.fn().mockRejectedValue(new Error("IndexedDB no disponible"));
    const readCache = vi.fn();

    const { result } = renderHook(
      () => useCachedQuery({ queryKey: ["k-cache-falla"], fetcher, cache, readCache }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(["dato"]);
  });

  it("con enabled=false no ejecuta el fetcher", async () => {
    const fetcher = vi.fn().mockResolvedValue(["x"]);
    const cache = vi.fn();
    const readCache = vi.fn();

    const { result } = renderHook(
      () =>
        useCachedQuery({ queryKey: ["k-disabled"], fetcher, cache, readCache, enabled: false }),
      { wrapper: createWrapper() }
    );

    // Un tick para descartar una ejecución diferida.
    await Promise.resolve();
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("funciona sin cache/readCache: se comporta como una query normal", async () => {
    const fetcher = vi.fn().mockResolvedValue(42);

    const { result } = renderHook(
      () => useCachedQuery({ queryKey: ["k-sin-cache"], fetcher }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(42);
  });
});
