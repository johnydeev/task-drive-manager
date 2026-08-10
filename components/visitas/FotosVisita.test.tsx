import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FotosVisita } from "./FotosVisita";

const FOTO = "https://drive.google.com/file/d/foto1/view";
const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ url: FOTO }) });
  vi.stubGlobal("fetch", fetchMock);
});

describe("FotosVisita", () => {
  it("no deja subir sin edificio elegido", () => {
    render(<FotosVisita edificio="" fotos={[]} onChange={vi.fn()} />);
    expect(screen.getByText(/eleg[ií] primero el edificio/i)).toBeInTheDocument();
  });

  it("sube la foto al destino de visita y avisa la URL", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<FotosVisita edificio="Castro Barros 1310" fotos={[]} onChange={onChange} />);

    const file = new File(["x"], "foto.jpg", { type: "image/jpeg" });
    await user.upload(screen.getByLabelText(/agregar fotos/i), file);

    await waitFor(() => expect(onChange).toHaveBeenCalledWith([FOTO]));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/upload");
    const enviado = init.body as FormData;
    expect(enviado.get("destino")).toBe("visita");
    expect(enviado.get("edificio")).toBe("Castro Barros 1310");
  });

  // La foto ya vive en Drive: sacarla del formulario tiene que mandarla a la papelera,
  // si no queda huérfana en la carpeta del consorcio.
  it("al quitar una foto la manda a la papelera", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<FotosVisita edificio="Castro Barros 1310" fotos={[FOTO]} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /quitar foto/i }));

    expect(onChange).toHaveBeenCalledWith([]);
    const borrado = fetchMock.mock.calls.find(([, init]) => init?.method === "DELETE");
    expect(borrado).toBeDefined();
    expect(borrado![0]).toBe(`/api/upload?url=${encodeURIComponent(FOTO)}`);
  });

  it("muestra el error si la subida falla", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Tipo de archivo no permitido" }),
    });
    const user = userEvent.setup();
    render(<FotosVisita edificio="Castro Barros 1310" fotos={[]} onChange={vi.fn()} />);

    const file = new File(["x"], "foto.jpg", { type: "image/jpeg" });
    await user.upload(screen.getByLabelText(/agregar fotos/i), file);

    expect(await screen.findByText(/tipo de archivo no permitido/i)).toBeInTheDocument();
  });
});
