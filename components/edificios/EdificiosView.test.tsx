import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EdificiosView } from "./EdificiosView";

vi.mock("next-auth/react", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api-client", () => ({
  api: {
    usuarios: {
      list: vi.fn().mockResolvedValue([
        { email: "admin@x.com", nombre: "Admin", rol: "admin", activo: true, creadoEn: "" },
        { email: "op@x.com", nombre: "Operario Uno", rol: "supervisor", activo: true, creadoEn: "" },
      ]),
    },
    asignaciones: {
      list: vi.fn().mockResolvedValue([{ email: "op@x.com", edificio: "Garay 350" }]),
      add: vi.fn(),
      remove: vi.fn(),
      sinAsignar: vi.fn().mockResolvedValue([]),
    },
    directivas: { list: vi.fn().mockResolvedValue([]), create: vi.fn(), remove: vi.fn() },
    edificios: { list: vi.fn().mockResolvedValue([{ nombre: "Garay 350" }]) },
    tareas: {
      list: vi.fn().mockResolvedValue([
        { rowId: "1", objetivo: "T1", fechaInicio: "2026-01-01", fechaEstimada: "", edificio: "Garay 350",
          parteComun: false, dpto: "1A", informe: "", imagenes: [], videos: [], documentos: [],
          estado: "Sin asignar", prioridad: "Media", supervisor: "op@x.com" },
        { rowId: "2", objetivo: "T2", fechaInicio: "2026-01-02", fechaEstimada: "", edificio: "garay  350",
          parteComun: false, dpto: "2B", informe: "", imagenes: [], videos: [], documentos: [],
          estado: "Realizada", prioridad: "Media", supervisor: "op@x.com" },
      ]),
    },
  },
}));
import { useSession } from "next-auth/react";
import { api } from "@/lib/api-client";

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <EdificiosView />
    </QueryClientProvider>
  );
}
beforeEach(() => vi.clearAllMocks());

describe("EdificiosView", () => {
  it("admin ve a todos los integrantes por nombre", async () => {
    vi.mocked(useSession).mockReturnValue({ data: { user: { email: "admin@x.com", rol: "admin" } } } as never);
    renderView();
    await waitFor(() => expect(screen.getByText("Admin")).toBeInTheDocument());
    expect(screen.getByText("Operario Uno")).toBeInTheDocument();
  });

  it("admin ve el cartel rojo con el conteo de edificios sin asignar", async () => {
    vi.mocked(api.asignaciones.sinAsignar).mockResolvedValue(["Nazca 2538", "Garay 350"]);
    vi.mocked(useSession).mockReturnValue({ data: { user: { email: "admin@x.com", rol: "admin" } } } as never);
    renderView();
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Quedan 2 edificios por asignar")
    );
  });

  it("no muestra el cartel si no hay edificios sin asignar", async () => {
    vi.mocked(api.asignaciones.sinAsignar).mockResolvedValue([]);
    vi.mocked(useSession).mockReturnValue({ data: { user: { email: "admin@x.com", rol: "admin" } } } as never);
    renderView();
    await waitFor(() => expect(screen.getByText("Admin")).toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("el supervisor ve a todos los integrantes, con su tarjeta primero", async () => {
    vi.mocked(useSession).mockReturnValue({ data: { user: { email: "op@x.com", rol: "supervisor" } } } as never);
    renderView();
    await waitFor(() => expect(screen.getByText("Operario Uno")).toBeInTheDocument());
    expect(screen.getByText("Admin")).toBeInTheDocument();
    const nombres = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(nombres[0]).toBe("Operario Uno");
  });

  it("el supervisor no ve el bloque Directivas de los demás", async () => {
    vi.mocked(useSession).mockReturnValue({ data: { user: { email: "op@x.com", rol: "supervisor" } } } as never);
    renderView();
    await waitFor(() => expect(screen.getByText("Admin")).toBeInTheDocument());
    // Solo queda el bloque de su propia tarjeta.
    expect(screen.getAllByText("Directivas")).toHaveLength(1);
  });

  it("el supervisor no ve el cartel de edificios sin asignar", async () => {
    vi.mocked(api.asignaciones.sinAsignar).mockResolvedValue(["Nazca 2538"]);
    vi.mocked(useSession).mockReturnValue({ data: { user: { email: "op@x.com", rol: "supervisor" } } } as never);
    renderView();
    await waitFor(() => expect(screen.getByText("Admin")).toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("el pill del edificio muestra las tareas abiertas del consorcio", async () => {
    vi.mocked(useSession).mockReturnValue({ data: { user: { email: "admin@x.com", rol: "admin" } } } as never);
    renderView();
    // 2 tareas en Garay 350 (una escrita "garay  350"), pero solo 1 sin Realizar.
    await waitFor(() =>
      expect(screen.getByRole("link", { name: /Garay 350 — 1 tarea pendiente/ })).toBeInTheDocument()
    );
  });
});
