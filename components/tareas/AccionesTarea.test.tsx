import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { UseMutationResult } from "@tanstack/react-query";
import { AccionesTarea, type TransicionInput } from "./AccionesTarea";
import type { Tarea } from "@/types";

// Mock mínimo de una mutation de TanStack Query (solo lo que usa el componente).
function mockMutation<TVars>(): UseMutationResult<Tarea, Error, TVars> {
  return {
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
    variables: undefined,
  } as unknown as UseMutationResult<Tarea, Error, TVars>;
}

const tarea = (over: Partial<Tarea> = {}): Tarea => ({
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
  ...over,
});

const renderPanel = (t: Tarea, extra: Partial<Parameters<typeof AccionesTarea>[0]> = {}) =>
  render(
    <AccionesTarea
      t={t}
      isAdmin={false}
      esAsignado
      asignar={mockMutation<string>()}
      transicionar={mockMutation<TransicionInput>()}
      usuarios={[]}
      {...extra}
    />
  );

describe("AccionesTarea — salto Aceptada → En Proceso", () => {
  it("sin iniciar muestra solo el botón 'Comenzar en Proceso' (sin textarea)", () => {
    renderPanel(tarea({ estado: "Aceptada" }));
    expect(screen.getByRole("button", { name: /^comenzar en proceso$/i })).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("al iniciar abre el textarea + 'Guardar y pasar a En proceso' + 'Cancelar'", () => {
    renderPanel(tarea({ estado: "Aceptada" }));
    fireEvent.click(screen.getByRole("button", { name: /^comenzar en proceso$/i }));
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /guardar y pasar a en proceso/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancelar/i })).toBeInTheDocument();
  });

  it("guardar con el textarea vacío abre el modal de confirmación (Aceptar, no Eliminar)", () => {
    renderPanel(tarea({ estado: "Aceptada" }));
    fireEvent.click(screen.getByRole("button", { name: /^comenzar en proceso$/i }));
    fireEvent.click(screen.getByRole("button", { name: /guardar y pasar a en proceso/i }));
    expect(screen.getByText(/sin comentario/i)).toBeInTheDocument();
    // El modal es una confirmación, NO una acción destructiva: el botón dice "Aceptar".
    expect(screen.getByRole("button", { name: /^aceptar$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /eliminar/i })).not.toBeInTheDocument();
  });

  it("guardar con texto dispara 'empezar' con el comentario", () => {
    const transicionar = mockMutation<TransicionInput>();
    renderPanel(tarea({ estado: "Aceptada" }), { transicionar });
    fireEvent.click(screen.getByRole("button", { name: /^comenzar en proceso$/i }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "arranco" } });
    fireEvent.click(screen.getByRole("button", { name: /guardar y pasar a en proceso/i }));
    expect(transicionar.mutate).toHaveBeenCalledWith({ accion: "empezar", comentario: "arranco" });
  });
});

describe("AccionesTarea — salto En Proceso → En Revisión", () => {
  it("sin iniciar muestra solo el botón 'Pasar a revisión' (sin textarea ni 'Guardar comentario')", () => {
    renderPanel(tarea({ estado: "En Proceso", comentarioEnProceso: "algo" }));
    expect(screen.getByRole("button", { name: /^pasar a revisión$/i })).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /guardar comentario/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /pasar a revisión sin comentar/i })
    ).not.toBeInTheDocument();
  });

  it("al iniciar abre el textarea + 'Guardar y pasar a revisión' + 'Cancelar'", () => {
    renderPanel(tarea({ estado: "En Proceso" }));
    fireEvent.click(screen.getByRole("button", { name: /^pasar a revisión$/i }));
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /guardar y pasar a revisión/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancelar/i })).toBeInTheDocument();
  });

  it("guardar con texto dispara 'revisar' con el comentario", () => {
    const transicionar = mockMutation<TransicionInput>();
    renderPanel(tarea({ estado: "En Proceso" }), { transicionar });
    fireEvent.click(screen.getByRole("button", { name: /^pasar a revisión$/i }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "terminado" } });
    fireEvent.click(screen.getByRole("button", { name: /guardar y pasar a revisión/i }));
    expect(transicionar.mutate).toHaveBeenCalledWith({ accion: "revisar", comentario: "terminado" });
  });
});

describe("AccionesTarea — confirmación de cerrar / objetar (admin)", () => {
  const enRevision = () => tarea({ estado: "En Revisión", asignadoA: "op@x.com" });

  it("el modal de Cerrar dice 'Cerrar tarea' (no 'Eliminar')", () => {
    renderPanel(enRevision(), { isAdmin: true, esAsignado: false });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "todo ok" } });
    fireEvent.click(screen.getByRole("button", { name: /cerrar \(dar por realizada\)/i }));
    expect(screen.getByRole("button", { name: /^cerrar tarea$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /eliminar/i })).not.toBeInTheDocument();
  });

  it("el modal de Objetar dice 'Objetar tarea' (no 'Eliminar')", () => {
    renderPanel(enRevision(), { isAdmin: true, esAsignado: false });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "falta algo" } });
    fireEvent.click(screen.getByRole("button", { name: /^objetar$/i }));
    expect(screen.getByRole("button", { name: /^objetar tarea$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /eliminar/i })).not.toBeInTheDocument();
  });

  it("con el textarea vacío: Cerrar habilitado (nota opcional), Objetar deshabilitado", () => {
    renderPanel(enRevision(), { isAdmin: true, esAsignado: false });
    expect(screen.getByRole("button", { name: /cerrar \(dar por realizada\)/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /^objetar$/i })).toBeDisabled();
  });
});
