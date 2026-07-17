import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { IntegranteCard } from "./IntegranteCard";
import type { Usuario } from "@/types";

vi.mock("@/lib/api-client", () => ({
  api: {
    asignaciones: { add: vi.fn().mockResolvedValue({}), remove: vi.fn().mockResolvedValue({}) },
    directivas: { create: vi.fn().mockResolvedValue({}), remove: vi.fn().mockResolvedValue({}) },
    edificios: { list: vi.fn().mockResolvedValue([{ nombre: "Garay 350" }, { nombre: "Belgrano 1429" }]) },
  },
}));

const usuario: Usuario = { email: "op@x.com", nombre: "Operario Uno", rol: "supervisor", activo: true, creadoEn: "" };
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
      />
    );
    expect(screen.getByText("Operario Uno")).toBeInTheDocument();
    expect(screen.getByText("Garay 350")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /asignar directiva/i })).toBeInTheDocument();
  });

  it("supervisor (readOnly): no muestra acciones de edición", () => {
    wrap(
      <IntegranteCard usuario={usuario} usuarios={[usuario]} asignaciones={[]} directivas={[]} readOnly />
    );
    expect(screen.queryByRole("button", { name: /asignar directiva/i })).not.toBeInTheDocument();
  });
});
