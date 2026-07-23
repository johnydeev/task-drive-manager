import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/api-client", () => ({
  api: {
    edificios: { list: vi.fn() },
    dptos: { list: vi.fn() },
    proveedores: { list: vi.fn() },
    partesComunes: { list: vi.fn(), add: vi.fn() },
    configuracion: { get: vi.fn() },
  },
}));
vi.mock("@/lib/offline-db", () => ({
  cacheEdificios: vi.fn(),
  readCachedEdificios: vi.fn(),
  cacheDptos: vi.fn(),
  readCachedDptos: vi.fn(),
  cacheConfig: vi.fn(),
  readCachedConfig: vi.fn(),
  cacheProveedores: vi.fn(),
  readCachedProveedores: vi.fn(),
  cachePartesComunes: vi.fn(),
  readCachedPartesComunes: vi.fn(),
}));

import { api } from "@/lib/api-client";
import { cacheEdificios, cacheDptos } from "@/lib/offline-db";
import {
  useEdificios,
  useDptos,
  usePartesComunes,
  useConfig,
  useProveedores,
} from "./queries";

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => vi.clearAllMocks());

describe("hooks de datos por entidad", () => {
  it("useEdificios trae de la API y cachea", async () => {
    vi.mocked(api.edificios.list).mockResolvedValue([{ nombre: "A" }]);
    const { result } = renderHook(() => useEdificios(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ nombre: "A" }]);
    expect(cacheEdificios).toHaveBeenCalledWith([{ nombre: "A" }]);
  });

  it("useDptos no ejecuta si no hay edificio", () => {
    const { result } = renderHook(() => useDptos("", false), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe("idle");
    expect(api.dptos.list).not.toHaveBeenCalled();
  });

  it("useDptos no ejecuta si parteComun=true (los dptos los trae usePartesComunes)", () => {
    const { result } = renderHook(() => useDptos("Edif A", true), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe("idle");
    expect(api.dptos.list).not.toHaveBeenCalled();
  });

  it("useDptos consulta por edificio y cachea bajo esa key", async () => {
    vi.mocked(api.dptos.list).mockResolvedValue([{ idDpto: "1", dpto: "1A", edificioRef: "Edif A" }]);
    const { result } = renderHook(() => useDptos("Edif A", false), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.dptos.list).toHaveBeenCalledWith("Edif A");
    expect(cacheDptos).toHaveBeenCalledWith("Edif A", [{ idDpto: "1", dpto: "1A", edificioRef: "Edif A" }]);
  });

  it("usePartesComunes solo corre cuando parteComun=true", () => {
    const { result } = renderHook(() => usePartesComunes(false), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("usePartesComunes consulta la hoja Partes Comunes", async () => {
    vi.mocked(api.partesComunes.list).mockResolvedValue(["HALL", "TERRAZA"]);
    const { result } = renderHook(() => usePartesComunes(true), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.partesComunes.list).toHaveBeenCalled();
    expect(result.current.data).toEqual(["HALL", "TERRAZA"]);
  });

  it("useConfig trae la configuración", async () => {
    vi.mocked(api.configuracion.get).mockResolvedValue({
      maxImagenes: 10, maxVideos: 3, maxDocumentos: 5,
      maxSizeImagenMB: 10, maxSizeVideoMB: 100, maxSizePdfMB: 20,
    });
    const { result } = renderHook(() => useConfig(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.maxImagenes).toBe(10);
  });

  it("useProveedores trae la lista", async () => {
    vi.mocked(api.proveedores.list).mockResolvedValue(["Prov 1", "Prov 2"]);
    const { result } = renderHook(() => useProveedores(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(["Prov 1", "Prov 2"]);
  });
});
