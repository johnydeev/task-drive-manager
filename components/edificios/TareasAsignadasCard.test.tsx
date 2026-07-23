import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TareasAsignadasCard } from "./TareasAsignadasCard";
import type { Tarea } from "@/types";

const t = (over: Partial<Tarea>): Tarea => ({
  rowId: "2026-07-16T10:00:00.000Z", objetivo: "Obj", fechaInicio: "2026-07-16", fechaEstimada: "",
  edificio: "Edif A", parteComun: false, dpto: "1A", informe: "", imagenes: [], videos: [], documentos: [],
  estado: "En Proceso", prioridad: "Media", supervisor: "s@x.com", ...over,
});

describe("TareasAsignadasCard", () => {
  it("agrupa En curso y Realizadas, y linkea al detalle", () => {
    render(
      <TareasAsignadasCard tareas={[t({ objetivo: "Activa" }), t({ objetivo: "Hecha", estado: "Realizada" })]} />
    );
    expect(screen.getByText("En curso")).toBeInTheDocument();
    expect(screen.getByText("Realizadas")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Activa/ })).toHaveAttribute(
      "href",
      "/tareas/2026-07-16T10%3A00%3A00.000Z"
    );
  });

  it("no muestra el grupo Realizadas si no hay ninguna", () => {
    render(<TareasAsignadasCard tareas={[t({ estado: "En Proceso" })]} />);
    expect(screen.queryByText("Realizadas")).not.toBeInTheDocument();
  });

  it("no renderiza nada sin tareas", () => {
    const { container } = render(<TareasAsignadasCard tareas={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
