import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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

describe("AccionesTarea — flujo En Proceso", () => {
  it("en Aceptada el botón dice 'Comenzar en Proceso' (no 'Pasar a En Proceso')", () => {
    renderPanel(tarea({ estado: "Aceptada" }));
    expect(screen.getByRole("button", { name: /comenzar en proceso/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /pasar a en proceso/i })).not.toBeInTheDocument();
  });

  it("en En Proceso SIN comentario guardado: no muestra el botón primario 'Pasar a En Revisión'", () => {
    renderPanel(tarea({ estado: "En Proceso", comentarioEnProceso: "" }));
    expect(screen.queryByRole("button", { name: /^pasar a en revisión$/i })).not.toBeInTheDocument();
    // pero sí ofrece la salida opcional
    expect(screen.getByRole("button", { name: /pasar a revisión sin comentar/i })).toBeInTheDocument();
  });

  it("en En Proceso CON comentario guardado: muestra el botón primario 'Pasar a En Revisión'", () => {
    renderPanel(tarea({ estado: "En Proceso", comentarioEnProceso: "avancé con la pintura" }));
    expect(screen.getByRole("button", { name: /^pasar a en revisión$/i })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /pasar a revisión sin comentar/i })
    ).not.toBeInTheDocument();
  });
});
