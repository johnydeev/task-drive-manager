import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ComentarioEditable } from "./ComentarioEditable";

const base = {
  label: "En proceso",
  valor: "texto original",
  editable: true,
  saving: false,
  onSave: vi.fn(),
};

describe("ComentarioEditable", () => {
  it("en solo lectura muestra el texto pero no el botón de editar", () => {
    render(<ComentarioEditable {...base} editable={false} />);
    expect(screen.getByText("texto original")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /editar/i })).not.toBeInTheDocument();
  });

  it("si es editable muestra el botón de editar", () => {
    render(<ComentarioEditable {...base} />);
    expect(screen.getByRole("button", { name: /editar/i })).toBeInTheDocument();
  });

  it("al editar y guardar llama onSave con el texto nuevo", () => {
    const onSave = vi.fn();
    render(<ComentarioEditable {...base} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: /editar/i }));
    const textarea = screen.getByRole("textbox");
    expect(textarea).toHaveValue("texto original");
    fireEvent.change(textarea, { target: { value: "texto corregido" } });
    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));
    expect(onSave).toHaveBeenCalledWith("texto corregido");
  });

  it("cancelar vuelve a lectura sin llamar onSave", () => {
    const onSave = vi.fn();
    render(<ComentarioEditable {...base} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: /editar/i }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "cambio descartado" } });
    fireEvent.click(screen.getByRole("button", { name: /cancelar/i }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("texto original")).toBeInTheDocument();
  });

  it("mientras guarda, el botón Guardar queda deshabilitado", () => {
    render(<ComentarioEditable {...base} saving />);
    fireEvent.click(screen.getByRole("button", { name: /editar/i }));
    expect(screen.getByRole("button", { name: /guardar/i })).toBeDisabled();
  });
});
