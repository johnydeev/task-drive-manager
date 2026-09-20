import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { Tarea } from "@/types";

const { replace, params, useSession, tareas } = vi.hoisted(() => ({
  replace: vi.fn(),
  params: { current: new URLSearchParams() },
  useSession: vi.fn(),
  tareas: { current: [] as Tarea[] },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/tareas",
  useSearchParams: () => params.current,
}));
vi.mock("next-auth/react", () => ({ useSession }));
vi.mock("@/hooks/queries", () => ({
  useTareas: () => ({ data: tareas.current, isLoading: false, isError: false }),
  useEdificios: () => ({ data: [{ nombre: "E1" }, { nombre: "E2" }] }),
}));

import { useListaTareas } from "./useListaTareas";

const t = (over: Partial<Tarea>): Tarea =>
  ({
    rowId: "2026-09-10T10:00:00.000-03:00", objetivo: "x", fechaInicio: "2026-09-10", fechaEstimada: "",
    edificio: "E1", parteComun: false, dpto: "1A", informe: "", imagenes: [], videos: [], documentos: [],
    estado: "Sin asignar", prioridad: "Media", supervisor: "s@x.com", ...over,
  }) as Tarea;

beforeEach(() => {
  vi.clearAllMocks();
  params.current = new URLSearchParams();
  useSession.mockReturnValue({ data: { user: { email: "yo@x.com", rol: "admin" } } });
  tareas.current = [
    t({ rowId: "2026-09-01T10:00:00.000-03:00", objetivo: "Pintar", estado: "Realizada", edificio: "E2", asignadoA: "yo@x.com" }),
    t({ rowId: "2026-09-02T10:00:00.000-03:00", objetivo: "Luz", estado: "En Proceso", prioridad: "Alta" }),
  ];
});

describe("useListaTareas", () => {
  it("lee los filtros de la URL y abre el panel si hay filtros avanzados", () => {
    params.current = new URLSearchParams("estado=En+Proceso&mias=1&q=luz&orden=antiguas");
    const { result } = renderHook(() => useListaTareas());
    expect(result.current.filtros).toMatchObject({ estado: "En Proceso", mias: true, q: "luz", orden: "antiguas" });
    expect(result.current.hayFiltrosAvanzados).toBe(true);
  });

  it("un valor inválido en la URL cuenta como vacío/default", () => {
    params.current = new URLSearchParams("estado=Inventado&orden=zzz");
    const { result } = renderHook(() => useListaTareas());
    expect(result.current.filtros.estado).toBe("");
    expect(result.current.filtros.orden).toBe("prioridad");
    expect(result.current.hayFiltrosAvanzados).toBe(false);
  });

  it("setFiltro actualiza el estado y hace replace sin scroll; los defaults no van a la URL", () => {
    const { result } = renderHook(() => useListaTareas());
    act(() => result.current.setFiltro("estado", "En Proceso"));
    expect(result.current.tareas.map((x) => x.objetivo)).toEqual(["Luz"]);
    expect(replace).toHaveBeenLastCalledWith("/tareas?estado=En+Proceso", { scroll: false });
    act(() => result.current.setFiltro("estado", ""));
    expect(replace).toHaveBeenLastCalledWith("/tareas", { scroll: false });
  });

  it("mias y sinAsignar se excluyen", () => {
    const { result } = renderHook(() => useListaTareas());
    act(() => result.current.setFiltro("sinAsignar", true));
    act(() => result.current.setFiltro("mias", true));
    expect(result.current.filtros).toMatchObject({ mias: true, sinAsignar: false });
    expect(result.current.tareas.map((x) => x.objetivo)).toEqual(["Pintar"]);
  });

  it("orden por defecto: abiertas primero", () => {
    const { result } = renderHook(() => useListaTareas());
    expect(result.current.tareas.map((x) => x.objetivo)).toEqual(["Luz", "Pintar"]);
  });
});
