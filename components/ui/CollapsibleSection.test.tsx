import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CollapsibleSection } from "./CollapsibleSection";

describe("CollapsibleSection", () => {
  it("colapsada por defecto: no muestra el contenido, sí el título", () => {
    render(
      <CollapsibleSection title="Archivos multimedia (3)">
        <p>contenido secreto</p>
      </CollapsibleSection>
    );
    expect(screen.getByRole("button", { name: /archivos multimedia \(3\)/i })).toBeInTheDocument();
    expect(screen.queryByText("contenido secreto")).not.toBeInTheDocument();
  });

  it("al hacer click en el header muestra el contenido", () => {
    render(
      <CollapsibleSection title="Agregar archivos">
        <p>contenido secreto</p>
      </CollapsibleSection>
    );
    fireEvent.click(screen.getByRole("button", { name: /agregar archivos/i }));
    expect(screen.getByText("contenido secreto")).toBeInTheDocument();
  });

  it("defaultOpen: arranca mostrando el contenido", () => {
    render(
      <CollapsibleSection title="X" defaultOpen>
        <p>contenido secreto</p>
      </CollapsibleSection>
    );
    expect(screen.getByText("contenido secreto")).toBeInTheDocument();
  });

  it("expone aria-expanded según el estado", () => {
    render(
      <CollapsibleSection title="X">
        <p>c</p>
      </CollapsibleSection>
    );
    const btn = screen.getByRole("button", { name: /^x$/i });
    expect(btn).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
  });
});
