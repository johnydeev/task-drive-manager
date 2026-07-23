import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TareaForm } from "./TareaForm";

vi.mock("@/lib/api-client", () => ({
  api: {
    tareas: { create: vi.fn(), update: vi.fn() },
    edificios: { list: vi.fn().mockResolvedValue([{ nombre: "Edif A" }]) },
    dptos: { list: vi.fn().mockResolvedValue([{ idDpto: "1", dpto: "1A", edificioRef: "Edif A" }]) },
    proveedores: { list: vi.fn().mockResolvedValue([]) },
    partesComunes: { list: vi.fn().mockResolvedValue([]), add: vi.fn() },
    configuracion: { get: vi.fn().mockResolvedValue(null) },
  },
}));
vi.mock("@/lib/offline-db", () => ({
  enqueueTarea: vi.fn(),
  cacheEdificios: vi.fn(), readCachedEdificios: vi.fn(),
  cacheDptos: vi.fn(), readCachedDptos: vi.fn(),
  cacheConfig: vi.fn(), readCachedConfig: vi.fn(),
  cacheProveedores: vi.fn(), readCachedProveedores: vi.fn(),
  cachePartesComunes: vi.fn(), readCachedPartesComunes: vi.fn(),
}));
vi.mock("@/lib/background-sync", () => ({ registerBackgroundSync: vi.fn() }));
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: null }) }));

import { api } from "@/lib/api-client";

function renderForm() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TareaForm mode="create" />
    </QueryClientProvider>
  );
}

beforeEach(() => vi.clearAllMocks());

describe("TareaForm (componente)", () => {
  it("renderiza los campos y el botón de crear", () => {
    renderForm();
    expect(screen.getByPlaceholderText(/pintura exterior/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /crear tarea/i })).toBeInTheDocument();
  });

  it("carga los edificios en el select desde la API", async () => {
    renderForm();
    await waitFor(() => expect(screen.getByRole("option", { name: "Edif A" })).toBeInTheDocument());
  });

  it("bloquea el submit y muestra errores si faltan campos requeridos", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: /crear tarea/i }));
    await waitFor(() => expect(screen.getByText(/objetivo requerido/i)).toBeInTheDocument());
    expect(api.tareas.create).not.toHaveBeenCalled();
  });
});
