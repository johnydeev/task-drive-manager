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
    config: CONFIGURACION_DEFAULT,
    imagenes: [],
    videos: [],
    documentos: [],
    onChange: vi.fn(),
  };

  it("muestra el botón Documento con contador 0/5", () => {
    render(<FileUploader {...baseProps} />);
    expect(screen.getByText(/Documento/i)).toBeInTheDocument();
    expect(screen.getByText(/0\/5/)).toBeInTheDocument();
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
