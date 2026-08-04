import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { InformeEdificio } from "./InformeEdificio";
import type { Tarea } from "@/types";
import { CONFIGURACION_DEFAULT } from "@/types";

vi.mock("@/lib/api-client", () => ({
  api: {
    edificios: { list: vi.fn() },
    tareas: { list: vi.fn() },
    configuracion: { get: vi.fn() },
  },
}));

import { api } from "@/lib/api-client";

const tarea = (over: Partial<Tarea> = {}): Tarea => ({
  rowId: "2026-07-01T10:00:00.000Z",
  objetivo: "x",
  fechaInicio: "2026-07-01",
  fechaEstimada: "",
  edificio: "Castro Barros 1310",
  parteComun: false,
  dpto: "TERRAZA",
  informe: "Impermeabilizar el frente",
  imagenes: [],
  videos: [],
  documentos: [],
  estado: "En Proceso",
  prioridad: "Alta",
  supervisor: "sup@x.com",
  ...over,
});

function renderConQuery() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <InformeEdificio />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.edificios.list).mockResolvedValue([{ nombre: "Castro Barros 1310" }]);
  vi.mocked(api.configuracion.get).mockResolvedValue({
    ...CONFIGURACION_DEFAULT,
    membreteNombre: "Administración Morinigo",
    membreteEmail: "contacto@morinigoadm.com",
  });
  vi.mocked(api.tareas.list).mockResolvedValue([]);
});

// El texto del <option> placeholder y el del estado vacío se parecen: para elegir hay que
// esperar a que la query de edificios haya poblado el select.
async function elegirEdificio(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole("option", { name: "Castro Barros 1310" });
  await user.selectOptions(screen.getByLabelText("Edificio"), "Castro Barros 1310");
}

describe("InformeEdificio", () => {
  it("pide elegir un edificio antes de mostrar el informe", async () => {
    renderConQuery();
    expect(await screen.findByText(/eleg[ií] un edificio para ver su informe/i)).toBeInTheDocument();
    expect(api.tareas.list).not.toHaveBeenCalled();
  });

  it("al elegir un edificio muestra el membrete y las tareas agrupadas", async () => {
    vi.mocked(api.tareas.list).mockResolvedValue([
      tarea({ rowId: "1", estado: "Sin asignar", dpto: "FRENTE", informe: "Reparar primer piso" }),
      tarea({ rowId: "2", estado: "En Proceso", dpto: "TERRAZA" }),
    ]);
    const user = userEvent.setup();
    renderConQuery();

    await elegirEdificio(user);

    expect(await screen.findByText("Administración Morinigo")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Pendientes \(1\)/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /En Proceso \(1\)/ })).toBeInTheDocument();
    expect(screen.getByText("Reparar primer piso")).toBeInTheDocument();
    // Realizadas está vacío: no se dibuja
    expect(screen.queryByRole("heading", { name: /Realizadas/ })).not.toBeInTheDocument();
  });

  it("avisa cuando el edificio no tiene tareas en el rango", async () => {
    const user = userEvent.setup();
    renderConQuery();
    await elegirEdificio(user);
    expect(await screen.findByText(/no hay tareas/i)).toBeInTheDocument();
  });

  it("deshabilita Exportar PDF mientras no haya edificio elegido", async () => {
    renderConQuery();
    expect(await screen.findByRole("button", { name: /exportar pdf/i })).toBeDisabled();
  });
});
