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

  it("supervisor ve solo su propia tarjeta", async () => {
    vi.mocked(useSession).mockReturnValue({ data: { user: { email: "op@x.com", rol: "supervisor" } } } as never);
    renderView();
    await waitFor(() => expect(screen.getByText("Operario Uno")).toBeInTheDocument());
    expect(screen.queryByText("Admin")).not.toBeInTheDocument();
  });
});
