import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AgregarArchivos } from "./AgregarArchivos";
import { CONFIGURACION_DEFAULT, type Tarea } from "@/types";

// El FileUploader real sube a Drive; acá lo mockeamos con un botón que simula haber
// subido una imagen, para probar el staging + guardar de AgregarArchivos.
vi.mock("./FileUploader", () => ({
  FileUploader: ({ onChange }: { onChange: (m: { imagenes: string[]; videos: string[]; documentos: string[] }) => void }) => (
    <button
      type="button"
      onClick={() => onChange({ imagenes: ["https://drive.google.com/file/d/x/view"], videos: [], documentos: [] })}
    >
      simular subida
    </button>
  ),
}));

const tarea: Tarea = {
  rowId: "2026-07-24T10:00:00.000Z",
  objetivo: "Obj",
  fechaInicio: "2026-07-24",
  fechaEstimada: "",
  edificio: "Edif A",
  parteComun: false,
  dpto: "1A",
  informe: "",
  imagenes: [],
  videos: [],
  documentos: [],
  estado: "En Proceso",
  prioridad: "Media",
  supervisor: "creador@x.com",
  asignadoA: "op@x.com",
};

describe("AgregarArchivos", () => {
  it("el botón Guardar está deshabilitado si no hay nada staged", () => {
    render(<AgregarArchivos tarea={tarea} config={CONFIGURACION_DEFAULT} guardando={false} onGuardar={vi.fn()} />);
    expect(screen.getByRole("button", { name: /guardar archivos/i })).toBeDisabled();
  });

  it("con archivos staged, Guardar llama onGuardar con la media", () => {
    const onGuardar = vi.fn();
    render(<AgregarArchivos tarea={tarea} config={CONFIGURACION_DEFAULT} guardando={false} onGuardar={onGuardar} />);
    fireEvent.click(screen.getByRole("button", { name: /simular subida/i }));
    fireEvent.click(screen.getByRole("button", { name: /guardar archivos/i }));
    expect(onGuardar).toHaveBeenCalledWith({
      imagenes: ["https://drive.google.com/file/d/x/view"],
      videos: [],
      documentos: [],
    });
  });

  it("mientras guarda, el botón queda deshabilitado", () => {
    render(<AgregarArchivos tarea={tarea} config={CONFIGURACION_DEFAULT} guardando onGuardar={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /simular subida/i }));
    expect(screen.getByRole("button", { name: /guardar archivos/i })).toBeDisabled();
  });
});
