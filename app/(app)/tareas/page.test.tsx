import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Tarea } from "@/types";

const { useSession, usePendingTareas } = vi.hoisted(() => ({
  useSession: vi.fn(),
  usePendingTareas: vi.fn(),
}));
vi.mock("next-auth/react", () => ({ useSession }));
// La página monta PendientesDeSubir: Dexie (useLiveQuery) no tiene IndexedDB en jsdom.
vi.mock("@/hooks/usePendingTareas", () => ({ usePendingTareas }));
vi.mock("@/hooks/useOnlineStatus", () => ({ useOnlineStatus: () => true }));
vi.mock("@/lib/offline-sync", () => ({ syncPendingTareas: vi.fn() }));
vi.mock("@/lib/api-client", () => ({
  api: {
    tareas: { list: vi.fn(), remove: vi.fn() },
    edificios: { list: vi.fn() },
  },
}));
vi.mock("@/lib/offline-db", () => ({
  cacheTareas: vi.fn(),
  readCachedTareas: vi.fn(),
  cacheEdificios: vi.fn(),
  readCachedEdificios: vi.fn(),
  reintentarPendiente: vi.fn(),
  descartarPendiente: vi.fn(),
}));

import { api } from "@/lib/api-client";
import TareasPage from "./page";

const tarea = (over: Partial<Tarea>): Tarea =>
  ({
    rowId: "1",
    objetivo: "x",
    fechaInicio: "2026-09-01",
    fechaEstimada: "",
    edificio: "E1",
    parteComun: false,
    dpto: "1A",
    informe: "",
    imagenes: [],
    videos: [],
    documentos: [],
    estado: "Sin asignar",
    prioridad: "Media",
    supervisor: "s@x.com",
    ...over,
  }) as Tarea;

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TareasPage />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  usePendingTareas.mockReturnValue([]);
  useSession.mockReturnValue({ data: { user: { email: "yo@x.com", rol: "admin" } } });
  vi.mocked(api.edificios.list).mockResolvedValue([{ nombre: "E1" }, { nombre: "E2" }]);
  vi.mocked(api.tareas.list).mockResolvedValue([
    tarea({ rowId: "2026-09-01T10:00:00.000-03:00", objetivo: "Pintar", estado: "Sin asignar", edificio: "E1" }),
    tarea({ rowId: "2026-09-02T10:00:00.000-03:00", objetivo: "Plomería", estado: "Realizada", edificio: "E2", asignadoA: "yo@x.com" }),
    tarea({ rowId: "2026-09-03T10:00:00.000-03:00", objetivo: "Luz", estado: "En Proceso", edificio: "E1", asignadoA: "otro@x.com" }),
  ]);
});

describe("TareasPage — filtros en memoria", () => {
  it("carga la lista una sola vez y filtra por estado sin volver a pedirla", async () => {
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText("3 resultados")).toBeInTheDocument();
    // Sin cola offline no hay sección de pendientes.
    expect(screen.queryByText(/pendientes de subir/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /filtros/i }));
    await user.selectOptions(screen.getByLabelText("Estado"), "En Proceso");

    expect(await screen.findByText("1 resultado")).toBeInTheDocument();
    expect(screen.getByText("Luz")).toBeInTheDocument();
    expect(screen.queryByText("Pintar")).not.toBeInTheDocument();
    expect(api.tareas.list).toHaveBeenCalledTimes(1);
  });

  it("«Mis tareas asignadas» deja solo las del usuario", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("3 resultados");
    await user.click(screen.getByRole("button", { name: "Mis tareas asignadas" }));
    await waitFor(() => expect(screen.getByText("1 resultado")).toBeInTheDocument());
    expect(screen.getByText("Plomería")).toBeInTheDocument();
    expect(api.tareas.list).toHaveBeenCalledTimes(1);
  });

  it("«Sin asignar» solo aparece para admin", async () => {
    useSession.mockReturnValue({ data: { user: { email: "yo@x.com", rol: "supervisor" } } });
    renderPage();
    await screen.findByText("3 resultados");
    expect(screen.queryByRole("button", { name: "Sin asignar" })).not.toBeInTheDocument();
  });

  it("la sección de pendientes va arriba y no la afectan los filtros", async () => {
    usePendingTareas.mockReturnValue([
      {
        localId: "L1", pendingSync: true, createdAt: "2026-09-19T10:00:00.000-03:00", retries: 0,
        objetivo: "Cargada sin señal", fechaInicio: "2026-09-19", fechaEstimada: "", edificio: "E2",
        parteComun: false, dpto: "1A", informe: "", prioridad: "Media",
      },
    ]);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("3 resultados");
    expect(screen.getByText("Cargada sin señal")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /filtros/i }));
    await user.selectOptions(screen.getByLabelText("Estado"), "En Proceso");
    await screen.findByText("1 resultado");
    expect(screen.getByText("Cargada sin señal")).toBeInTheDocument();
  });

  it("buscar reduce la lista en memoria", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("3 resultados");
    await user.type(screen.getByLabelText("Buscar tareas"), "plom");
    expect(await screen.findByText("1 resultado")).toBeInTheDocument();
    expect(screen.getByText("Plomería")).toBeInTheDocument();
    expect(api.tareas.list).toHaveBeenCalledTimes(1);
  });

  it("orden por defecto abiertas primero; 'Más antiguas' invierte", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("3 resultados");
    const titulos = () => screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(titulos()[titulos().length - 1]).toBe("Plomería"); // la Realizada al final
    await user.selectOptions(screen.getByLabelText("Ordenar por"), "antiguas");
    expect(titulos()[0]).toBe("Pintar");
  });
});
