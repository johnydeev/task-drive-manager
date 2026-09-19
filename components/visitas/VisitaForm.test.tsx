import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { VisitaForm } from "./VisitaForm";
import { EDIFICIO_FICHA_VACIA } from "@/types";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/api-client", () => ({
  api: {
    edificios: { list: vi.fn() },
    visitas: { create: vi.fn() },
  },
  // Passthrough al fetch global (que el test stubea o no usa).
  apiFetch: (...args: Parameters<typeof fetch>) => fetch(...args),
}));
// Stub del uploader: expone un botón que simula haber subido una foto a Drive.
vi.mock("./FotosVisita", () => ({
  FotosVisita: ({
    fotos,
    onChange,
  }: {
    fotos: string[];
    onChange: (f: string[]) => void;
  }) => (
    <button
      type="button"
      onClick={() => onChange([...fotos, "https://drive.google.com/file/d/foto1/view"])}
    >
      simular subida
    </button>
  ),
}));

import { api } from "@/lib/api-client";

// La ficha se pide con fetch directo (no pasa por api-client).
const fetchMock = vi.fn();

function renderForm() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <VisitaForm />
    </QueryClientProvider>
  );
}

async function elegirEdificio(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole("option", { name: "Castro Barros 1310" });
  await user.selectOptions(screen.getByLabelText("Edificio"), "Castro Barros 1310");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.edificios.list).mockResolvedValue([{ nombre: "Castro Barros 1310" }]);
  vi.mocked(api.visitas.create).mockResolvedValue({
    id: "1",
    edificio: "Castro Barros 1310",
    fecha: "2026-08-08",
    pdfUrl: "https://drive.google.com/file/d/x/view",
    supervisor: "sup@x.com",
    creadoEn: "2026-08-08",
  });
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      edificio: "Castro Barros 1310",
      ...EDIFICIO_FICHA_VACIA,
      encargado: "Juan",
    }),
  });
  vi.stubGlobal("fetch", fetchMock);
});

describe("VisitaForm", () => {
  it("no deja guardar sin edificio elegido", async () => {
    renderForm();
    expect(await screen.findByRole("button", { name: /guardar y generar pdf/i })).toBeDisabled();
  });

  it("muestra los 15 controles en dos bloques", async () => {
    renderForm();
    expect(await screen.findByText("Sectores")).toBeInTheDocument();
    expect(screen.getByText("Instalaciones")).toBeInTheDocument();
    expect(screen.getAllByRole("radio", { name: /^realizada$/i })).toHaveLength(15);
  });

  it("precarga la ficha al elegir el edificio", async () => {
    const user = userEvent.setup();
    renderForm();
    await elegirEdificio(user);
    await waitFor(() => expect(screen.getByLabelText(/^encargado$/i)).toHaveValue("Juan"));
  });

  it("muestra todas las secciones abiertas, sin colapsables", () => {
    renderForm();
    // Ninguna sección tiene header clickeable: el único botón es el de guardar.
    expect(screen.queryByRole("button", { name: /datos del edificio/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^encargado$/i)).toBeInTheDocument();
    expect(screen.getByText("Informe general")).toBeInTheDocument();
    expect(screen.getByText(/^Fotos \(0\)$/)).toBeInTheDocument();
  });

  it("manda edificio, ficha y controles al guardar", async () => {
    const user = userEvent.setup();
    renderForm();
    await elegirEdificio(user);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    await user.click(screen.getAllByRole("radio", { name: /^realizada$/i })[0]);
    await user.click(screen.getByRole("button", { name: /guardar y generar pdf/i }));

    await waitFor(() => expect(api.visitas.create).toHaveBeenCalled());
    const enviado = vi.mocked(api.visitas.create).mock.calls[0][0];
    expect(enviado.edificio).toBe("Castro Barros 1310");
    expect(enviado.ficha.encargado).toBe("Juan");
    expect(enviado.controles.hall).toBe("Realizada");
  });

  // Las fotos se suben a Drive antes de guardar: si el form se abandona hay que limpiarlas,
  // pero si la visita se guardó bien NO hay que tocarlas (el form se desmonta igual al navegar).
  it("manda a la papelera las fotos si se abandona el formulario", async () => {
    const user = userEvent.setup();
    const { unmount } = renderForm();
    await elegirEdificio(user);
    await user.click(screen.getByRole("button", { name: /simular subida/i }));

    fetchMock.mockClear();
    unmount();

    const borrados = fetchMock.mock.calls.filter(([, init]) => init?.method === "DELETE");
    expect(borrados).toHaveLength(1);
    expect(borrados[0][0]).toContain(encodeURIComponent("https://drive.google.com/file/d/foto1/view"));
  });

  it("NO borra las fotos cuando la visita se guardó bien", async () => {
    const user = userEvent.setup();
    const { unmount } = renderForm();
    await elegirEdificio(user);
    await user.click(screen.getByRole("button", { name: /simular subida/i }));
    await user.click(screen.getByRole("button", { name: /guardar y generar pdf/i }));
    await waitFor(() => expect(api.visitas.create).toHaveBeenCalled());

    fetchMock.mockClear();
    unmount();

    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "DELETE")).toHaveLength(0);
  });

  it("no intenta borrar nada si no se subieron fotos", async () => {
    const { unmount } = renderForm();
    fetchMock.mockClear();
    unmount();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "DELETE")).toHaveLength(0);
  });

  // El PDF recién emitido se ofrece a mano: no hay que ir a buscarlo al historial.
  it("al guardar muestra el modal con las acciones sobre el PDF, sin navegar todavía", async () => {
    const user = userEvent.setup();
    renderForm();
    await elegirEdificio(user);
    await user.click(screen.getByRole("button", { name: /guardar y generar pdf/i }));

    expect(await screen.findByText(/visita guardada y pdf generado/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ver pdf/i })).toHaveAttribute(
      "href",
      "https://drive.google.com/file/d/x/view"
    );
    // La descarga pasa por nuestro server para conservar el nombre del archivo.
    expect(screen.getByRole("link", { name: /descargar pdf/i })).toHaveAttribute(
      "href",
      "/api/visitas/1/pdf"
    );
    expect(screen.getByRole("button", { name: /compartir pdf/i })).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("al cerrar el modal va a la pestaña Visitas", async () => {
    const user = userEvent.setup();
    renderForm();
    await elegirEdificio(user);
    await user.click(screen.getByRole("button", { name: /guardar y generar pdf/i }));
    await screen.findByText(/visita guardada y pdf generado/i);

    await user.click(screen.getByRole("button", { name: /^listo$/i }));
    expect(push).toHaveBeenCalledWith("/informes?tab=visitas");
  });

  it("avisa si falla la generación del PDF", async () => {
    vi.mocked(api.visitas.create).mockRejectedValue(new Error("No se pudo generar el PDF"));
    const user = userEvent.setup();
    renderForm();
    await elegirEdificio(user);
    await user.click(screen.getByRole("button", { name: /guardar y generar pdf/i }));
    expect(await screen.findByText(/no se pudo generar el pdf/i)).toBeInTheDocument();
  });
});
