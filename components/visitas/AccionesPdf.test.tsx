import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AccionesPdf } from "./AccionesPdf";

const PDF = "https://drive.google.com/file/d/abc/view";

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe("AccionesPdf", () => {
  it("enlaza al visor y, con visitaId, baja el PDF por nuestro server", () => {
    render(<AccionesPdf pdfUrl={PDF} titulo="Visita" visitaId="v1" />);
    expect(screen.getByRole("link", { name: /ver pdf/i })).toHaveAttribute("href", PDF);
    expect(screen.getByRole("link", { name: /descargar pdf/i })).toHaveAttribute(
      "href",
      "/api/visitas/v1/pdf"
    );
  });

  it("sin visitaId la descarga cae al link de Drive", () => {
    render(<AccionesPdf pdfUrl={PDF} titulo="Visita" />);
    expect(screen.getByRole("link", { name: /descargar pdf/i })).toHaveAttribute("href", PDF);
  });

  // Lo pedido: que llegue el PDF, no un enlace.
  it("comparte el ARCHIVO cuando el dispositivo lo soporta", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share, canShare: () => true });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        blob: async () => new Blob(["%PDF"], { type: "application/pdf" }),
      })
    );

    render(<AccionesPdf pdfUrl={PDF} titulo="Visita Castro Barros" visitaId="v1" />);
    fireEvent.click(screen.getByRole("button", { name: /compartir pdf/i }));

    await waitFor(() => expect(share).toHaveBeenCalled());
    const datos = share.mock.calls[0][0];
    expect(datos.files).toHaveLength(1);
    expect(datos.files[0].name).toBe("Visita Castro Barros.pdf");
    expect(datos.url).toBeUndefined(); // va el archivo, no el enlace
  });

  it("si el dispositivo no soporta archivos, comparte el link", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share, canShare: () => false });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        blob: async () => new Blob(["%PDF"], { type: "application/pdf" }),
      })
    );

    render(<AccionesPdf pdfUrl={PDF} titulo="Visita" visitaId="v1" />);
    fireEvent.click(screen.getByRole("button", { name: /compartir pdf/i }));

    await waitFor(() => expect(share).toHaveBeenCalledWith({ title: "Visita", url: PDF }));
  });

  it("si no se puede bajar el PDF, igual comparte el link", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share, canShare: () => true });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    render(<AccionesPdf pdfUrl={PDF} titulo="Visita" visitaId="v1" />);
    fireEvent.click(screen.getByRole("button", { name: /compartir pdf/i }));

    await waitFor(() => expect(share).toHaveBeenCalledWith({ title: "Visita", url: PDF }));
  });

  // Estos dos usan fireEvent en vez de userEvent: `userEvent.setup()` reemplaza
  // `navigator.clipboard` con su propia implementación y pisaría el stub.
  it("sin menú nativo copia el link y lo avisa", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    render(<AccionesPdf pdfUrl={PDF} titulo="Visita" />);
    fireEvent.click(screen.getByRole("button", { name: /compartir pdf/i }));

    expect(await screen.findByText(/link copiado/i)).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(PDF);
  });

  it("avisa si no se pudo compartir de ninguna forma", async () => {
    vi.stubGlobal("navigator", {});

    render(<AccionesPdf pdfUrl={PDF} titulo="Visita" />);
    fireEvent.click(screen.getByRole("button", { name: /compartir pdf/i }));

    expect(await screen.findByText(/no se pudo compartir/i)).toBeInTheDocument();
  });

  it("en variante compacta muestra solo los íconos", () => {
    render(<AccionesPdf pdfUrl={PDF} titulo="Visita" variante="compacto" />);
    expect(screen.getByRole("link", { name: /ver pdf/i })).toBeInTheDocument();
    expect(screen.queryByText("Descargar")).not.toBeInTheDocument();
  });
});
