import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Combobox } from "./Combobox";

const OPCIONES = ["Belgrano 1429", "Garay 350", "Castro Barros 1310"];

describe("Combobox (no strict)", () => {
  it("tipear dispara onChange con el texto (valor libre)", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Combobox value="" onChange={onChange} options={OPCIONES} aria-label="Proveedor" />);
    await user.type(screen.getByRole("combobox", { name: "Proveedor" }), "N");
    expect(onChange).toHaveBeenLastCalledWith("N");
  });
});

describe("Combobox strict", () => {
  function Sujeto({ onChange, inicial = "" }: { onChange: (v: string) => void; inicial?: string }) {
    return (
      <Combobox
        strict
        value={inicial}
        onChange={onChange}
        options={OPCIONES}
        aria-label="Edificio"
        placeholder="Todos"
      />
    );
  }

  it("elegir una opción dispara onChange", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Sujeto onChange={onChange} />);
    await user.click(screen.getByRole("combobox", { name: "Edificio" }));
    await user.click(screen.getByRole("option", { name: "Garay 350" }));
    expect(onChange).toHaveBeenCalledWith("Garay 350");
  });

  it("tipear filtra sin disparar onChange; coincidencia exacta al salir la toma", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Sujeto onChange={onChange} />);
    const input = screen.getByRole("combobox", { name: "Edificio" });
    await user.type(input, "garay");
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("option", { name: "Garay 350" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Belgrano 1429" })).not.toBeInTheDocument();
    await user.clear(input);
    await user.type(input, "garay 350");
    await user.tab();
    expect(onChange).toHaveBeenCalledWith("Garay 350");
  });

  it("tipear algo inválido y salir revierte al valor, sin onChange", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Sujeto onChange={onChange} inicial="Garay 350" />);
    const input = screen.getByRole("combobox", { name: "Edificio" });
    await user.clear(input);
    await user.type(input, "zzz");
    await user.tab();
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveValue("Garay 350");
  });

  it("vaciar y salir dispara onChange('')", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Sujeto onChange={onChange} inicial="Garay 350" />);
    await user.clear(screen.getByRole("combobox", { name: "Edificio" }));
    await user.tab();
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("el botón Limpiar dispara onChange('')", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Sujeto onChange={onChange} inicial="Garay 350" />);
    await user.click(screen.getByRole("button", { name: "Limpiar" }));
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("al enfocar con un valor elegido muestra todas las opciones", async () => {
    const user = userEvent.setup();
    render(<Sujeto onChange={vi.fn()} inicial="Garay 350" />);
    await user.click(screen.getByRole("combobox", { name: "Edificio" }));
    expect(screen.getAllByRole("option")).toHaveLength(3);
  });
});
