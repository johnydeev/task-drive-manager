import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FileUploader } from "@/components/tareas/FileUploader";
import { CONFIGURACION_DEFAULT } from "@/types";
import { api } from "@/lib/api-client";

vi.mock("@/lib/api-client", () => ({
  api: { upload: vi.fn() },
}));

const MB = 1024 * 1024;

// File con un size falso: no queremos alocar 200 MB en el test.
function fakeFile(nombre: string, type: string, sizeBytes: number): File {
  const f = new File(["x"], nombre, { type });
  Object.defineProperty(f, "size", { value: sizeBytes });
  return f;
}

const videoInput = (container: HTMLElement) =>
  container.querySelector<HTMLInputElement>(
    'input[type="file"][accept*="video"][capture]'
  )!;

describe("FileUploader", () => {
  const baseProps = {
    edificio: "Av. 123",
    objetivo: "Test",
    dpto: "3A",
    rowId: "2026-07-05T18:00:00.000Z",
    config: CONFIGURACION_DEFAULT,
    imagenes: [],
    videos: [],
    documentos: [],
    onChange: vi.fn(),
  };

  it("muestra el botón Documento con contador 0/5", () => {
    render(<FileUploader {...baseProps} />);
    expect(screen.getByText(/Documentos/i)).toBeInTheDocument();
    expect(screen.getByText(/0\/5/)).toBeInTheDocument();
  });

  it("ofrece cámara y galería para imagen, grabar y buscar para video", () => {
    render(<FileUploader {...baseProps} />);
    expect(screen.getByRole("button", { name: /tomar foto/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /galería/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /grabar/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /buscar/i })).toBeInTheDocument();
  });

  it("renderiza un documento existente como link", () => {
    render(
      <FileUploader
        {...baseProps}
        documentos={["https://drive.google.com/file/d/doc1/view"]}
      />
    );
    const link = screen.getByRole("link", { name: /documento/i });
    expect(link).toHaveAttribute("href", "https://drive.google.com/file/d/doc1/view");
  });

  it("muestra el contador correcto cuando hay documentos", () => {
    render(
      <FileUploader
        {...baseProps}
        documentos={["https://drive.google.com/file/d/doc1/view", "https://drive.google.com/file/d/doc2/view"]}
      />
    );
    expect(screen.getByText(/2\/5/)).toBeInTheDocument();
  });

  it("avisa el peso máximo de cada tipo antes de que el usuario elija nada", () => {
    render(<FileUploader {...baseProps} config={{ ...CONFIGURACION_DEFAULT, maxSizeVideoMB: 40 }} />);
    // El texto va partido entre el <p> y un <span>, por eso el matcher por elemento.
    const contadorVideos = screen.getByText(
      (_, el) => el?.tagName === "P" && /Videos.*máx 40 MB/i.test(el.textContent ?? "")
    );
    expect(contadorVideos).toBeInTheDocument();
    expect(screen.getByText((_, el) => el?.tagName === "P" && /Imágenes.*máx 10 MB/i.test(el.textContent ?? ""))).toBeInTheDocument();
  });
});

describe("FileUploader — archivo demasiado pesado", () => {
  const baseProps = {
    edificio: "Av. 123",
    objetivo: "Test",
    dpto: "3A",
    rowId: "2026-07-05T18:00:00.000Z",
    config: CONFIGURACION_DEFAULT,
    imagenes: [],
    videos: [],
    documentos: [],
    onChange: vi.fn(),
  };

  beforeEach(() => vi.clearAllMocks());

  it("rechaza un video que excede el máximo y dice cuál es el máximo", async () => {
    const { container } = render(
      <FileUploader {...baseProps} config={{ ...CONFIGURACION_DEFAULT, maxSizeVideoMB: 40 }} />
    );
    fireEvent.change(videoInput(container), {
      target: { files: [fakeFile("VID_001.mp4", "video/mp4", 187 * MB)] },
    });

    const error = await screen.findByText(/no puede pesar más de 40 MB/i);
    expect(error).toHaveTextContent("187 MB");
    expect(vi.mocked(api.upload)).not.toHaveBeenCalled();
  });

  it("rechaza un video que supera el techo de infraestructura aunque la hoja permita más", async () => {
    const { container } = render(
      <FileUploader {...baseProps} config={{ ...CONFIGURACION_DEFAULT, maxSizeVideoMB: 500 }} />
    );
    fireEvent.change(videoInput(container), {
      target: { files: [fakeFile("VID_002.mp4", "video/mp4", 300 * MB)] },
    });

    await screen.findByText(/no puede pesar más de 95 MB/i);
    expect(vi.mocked(api.upload)).not.toHaveBeenCalled();
  });

  it("traduce el 'Failed to fetch' cuando se corta la subida", async () => {
    vi.mocked(api.upload).mockRejectedValue(new TypeError("Failed to fetch"));
    const { container } = render(<FileUploader {...baseProps} />);
    fireEvent.change(videoInput(container), {
      target: { files: [fakeFile("VID_003.mp4", "video/mp4", 80 * MB)] },
    });

    await waitFor(() => expect(vi.mocked(api.upload)).toHaveBeenCalled());
    const error = await screen.findByText(/conexión/i);
    expect(error).not.toHaveTextContent(/failed to fetch/i);
  });
});
