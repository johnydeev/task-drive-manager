import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AccionesPdf } from "./AccionesPdf";

const PDF = "https://drive.google.com/file/d/abc/view";

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe("AccionesPdf", () => {
  it("enlaza al visor y a la descarga directa", () => {
    render(<AccionesPdf pdfUrl={PDF} titulo="Visita" />);
    expect(screen.getByRole("link", { name: /ver pdf/i })).toHaveAttribute("href", PDF);
    expect(screen.getByRole("link", { name: /descargar pdf/i })).toHaveAttribute(
      "href",
      "https://drive.google.com/uc?export=download&id=abc"
    );
  });

  it("usa el menú nativo del sistema al compartir", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share });
    const user = userEvent.setup();

    render(<AccionesPdf pdfUrl={PDF} titulo="Visita Castro Barros" />);
    await user.click(screen.getByRole("button", { name: /compartir pdf/i }));

    expect(share).toHaveBeenCalledWith({ title: "Visita Castro Barros", url: PDF });
    // El menú nativo ya da su propio feedback: no se muestra aviso.
    expect(screen.queryByText(/link copiado/i)).not.toBeInTheDocument();
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
