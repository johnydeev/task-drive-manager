import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { IntegranteCard } from "./IntegranteCard";
import { api } from "@/lib/api-client";
import type { Directiva, Usuario } from "@/types";

vi.mock("@/lib/api-client", () => ({
  api: {
    asignaciones: {
      add: vi.fn().mockResolvedValue({}),
      remove: vi.fn().mockResolvedValue({}),
      sinAsignar: vi.fn().mockResolvedValue([]),
    },
    directivas: { create: vi.fn().mockResolvedValue({}), remove: vi.fn().mockResolvedValue({}), patch: vi.fn().mockResolvedValue({}) },
    edificios: { list: vi.fn().mockResolvedValue([{ nombre: "Garay 350" }, { nombre: "Belgrano 1429" }]) },
  },
}));

const usuario: Usuario = { email: "op@x.com", nombre: "Operario Uno", rol: "supervisor", activo: true, creadoEn: "" };
const dir = (over: Partial<Directiva>): Directiva => ({
  id: "1", descripcion: "x", fecha: "2026-07-17", asignadoA: "op@x.com",
  creadoPor: "a@x.com", creadoEn: "1", estado: "Asignada", ...over,
});

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}
beforeEach(() => vi.clearAllMocks());

describe("IntegranteCard", () => {
  it("admin: muestra edificios asignados y el botón Asignar directiva", () => {
    wrap(
      <IntegranteCard
        usuario={usuario}
        usuarios={[usuario]}
        asignaciones={[{ email: "op@x.com", edificio: "Garay 350" }]}
        directivas={[]}
        readOnly={false}
        currentEmail="admin@x.com"
        isAdmin
      />
    );
    expect(screen.getByText("Operario Uno")).toBeInTheDocument();
    expect(screen.getByText("Garay 350")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /asignar directiva/i })).toBeInTheDocument();
  });

  it("supervisor (readOnly): no muestra acciones de edición de edificios", () => {
    wrap(
      <IntegranteCard
        usuario={usuario}
        usuarios={[usuario]}
        asignaciones={[]}
        directivas={[]}
        readOnly
        currentEmail="op@x.com"
        isAdmin={false}
      />
    );
    expect(screen.queryByRole("button", { name: /asignar directiva/i })).not.toBeInTheDocument();
  });

  it("operario ve Aceptar sobre su directiva Asignada", () => {
    wrap(
      <IntegranteCard
        usuario={usuario}
        usuarios={[usuario]}
        asignaciones={[]}
        directivas={[dir({ estado: "Asignada" })]}
        readOnly
        currentEmail="op@x.com"
        isAdmin={false}
      />
    );
    expect(screen.getByRole("button", { name: /aceptar/i })).toBeInTheDocument();
  });

  it("admin ve Objetar sobre una directiva Realizada", () => {
    wrap(
      <IntegranteCard
        usuario={usuario}
        usuarios={[usuario]}
        asignaciones={[]}
        directivas={[dir({ estado: "Realizada", realizadaEn: "2026-07-17T00:00:00.000Z", notaCierre: "listo" })]}
        readOnly={false}
        currentEmail="admin@x.com"
        isAdmin
      />
    );
    expect(screen.getByRole("button", { name: /objetar/i })).toBeInTheDocument();
    expect(screen.getByText(/nota de cierre/i)).toBeInTheDocument();
  });

  it("admin puede eliminar una directiva con confirmación", async () => {
    const user = userEvent.setup();
    wrap(
      <IntegranteCard
        usuario={usuario}
        usuarios={[usuario]}
        asignaciones={[]}
        directivas={[dir({ id: "d1", estado: "Asignada" })]}
        readOnly={false}
        currentEmail="admin@x.com"
        isAdmin
      />
    );
    await user.click(screen.getByRole("button", { name: "Eliminar directiva" }));
    // Aparece el diálogo de confirmación
    expect(screen.getByText(/no se puede deshacer/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Eliminar" }));
    expect(vi.mocked(api.directivas.remove)).toHaveBeenCalledWith("d1");
  });

  it("admin: el dropdown ofrece los edificios sin asignar y muestra el error si la asignación falla", async () => {
    const user = userEvent.setup();
    vi.mocked(api.asignaciones.sinAsignar).mockResolvedValue(["Belgrano 1429"]);
    vi.mocked(api.asignaciones.add).mockRejectedValue(
      new Error('El edificio "Belgrano 1429" ya está asignado a otro@x.com')
    );
    wrap(
      <IntegranteCard
        usuario={usuario}
        usuarios={[usuario]}
        asignaciones={[]}
        directivas={[]}
        readOnly={false}
        currentEmail="admin@x.com"
        isAdmin
      />
    );
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "Belgrano 1429" })).toBeInTheDocument()
    );
    await user.selectOptions(screen.getByRole("combobox"), "Belgrano 1429");
    await user.click(screen.getByRole("button", { name: "Agregar edificio" }));
    await waitFor(() => expect(screen.getByText(/ya está asignado/i)).toBeInTheDocument());
  });

  it("un supervisor NO ve el botón de eliminar directiva", () => {
    wrap(
      <IntegranteCard
        usuario={usuario}
        usuarios={[usuario]}
        asignaciones={[]}
        directivas={[dir({ estado: "Asignada" })]}
        readOnly
        currentEmail="op@x.com"
        isAdmin={false}
      />
    );
    expect(screen.queryByRole("button", { name: "Eliminar directiva" })).not.toBeInTheDocument();
  });
});
