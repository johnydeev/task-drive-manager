import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { FileUploader } from "@/components/tareas/FileUploader";
import { CONFIGURACION_DEFAULT } from "@/types";

vi.mock("@/lib/api-client", () => ({
  api: { upload: vi.fn() },
}));

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
});
