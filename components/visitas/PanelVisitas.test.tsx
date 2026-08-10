import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PanelVisitas } from "./PanelVisitas";
import type { Visita } from "@/types";

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { rol: "admin" } } }),
}));
vi.mock("@/lib/api-client", () => ({
  api: { edificios: { list: vi.fn() }, visitas: { list: vi.fn(), remove: vi.fn() } },
}));

import { api } from "@/lib/api-client";

const visita = (edificio: string, fecha: string): Visita => ({
  id: `${edificio}-${fecha}`,
  edificio,
  fecha,
  pdfUrl: `https://drive.google.com/file/d/${fecha}/view`,
  supervisor: "sup@x.com",
  creadoEn: fecha,
});

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PanelVisitas />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.edificios.list).mockResolvedValue([
    { nombre: "Con visitas" },
    { nombre: "Nunca visitado" },
  ]);
  vi.mocked(api.visitas.list).mockResolvedValue([visita("Con visitas", "2026-08-01")]);
});

describe("PanelVisitas", () => {
  it("lista los consorcios y marca los que no tienen visitas", async () => {
    renderPanel();
    expect(await screen.findByText("Nunca visitado")).toBeInTheDocument();
    expect(screen.getByText("Con visitas")).toBeInTheDocument();
    expect(screen.getByText(/sin visitas registradas/i)).toBeInTheDocument();
  });

  it("al elegir un consorcio muestra su historial de PDFs", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByRole("button", { name: /con visitas/i }));
    const link = await screen.findByRole("link", { name: /01\/08\/2026/ });
    expect(link).toHaveAttribute("href", "https://drive.google.com/file/d/2026-08-01/view");
  });

  it("tiene un acceso para registrar una visita nueva", async () => {
    renderPanel();
    expect(await screen.findByRole("link", { name: /nueva visita/i })).toHaveAttribute(
      "href",
      "/visitas/nueva"
    );
  });
});
