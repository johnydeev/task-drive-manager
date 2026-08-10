import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import InformesPage from "./page";

const params = new URLSearchParams();
vi.mock("next/navigation", () => ({ useSearchParams: () => params }));
vi.mock("@/components/informes/InformeEdificio", () => ({
  InformeEdificio: () => <div data-testid="tab-tareas" />,
}));
vi.mock("@/components/visitas/PanelVisitas", () => ({
  PanelVisitas: () => <div data-testid="tab-visitas" />,
}));

beforeEach(() => {
  params.delete("tab");
});

describe("InformesPage — pestañas", () => {
  it("abre en Tareas por defecto", () => {
    render(<InformesPage />);
    expect(screen.getByTestId("tab-tareas")).toBeInTheDocument();
    expect(screen.queryByTestId("tab-visitas")).not.toBeInTheDocument();
  });

  it("abre en Visitas con ?tab=visitas (a donde vuelve el form al guardar)", () => {
    params.set("tab", "visitas");
    render(<InformesPage />);
    expect(screen.getByTestId("tab-visitas")).toBeInTheDocument();
    expect(screen.queryByTestId("tab-tareas")).not.toBeInTheDocument();
  });

  it("ignora un tab desconocido y cae en Tareas", () => {
    params.set("tab", "cualquiera");
    render(<InformesPage />);
    expect(screen.getByTestId("tab-tareas")).toBeInTheDocument();
  });

  it("permite cambiar de pestaña con los botones", async () => {
    const user = userEvent.setup();
    render(<InformesPage />);
    await user.click(screen.getByRole("button", { name: "Visitas" }));
    expect(screen.getByTestId("tab-visitas")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Tareas" }));
    expect(screen.getByTestId("tab-tareas")).toBeInTheDocument();
  });
});
