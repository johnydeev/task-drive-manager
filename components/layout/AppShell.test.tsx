import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

vi.mock("next-auth/react", () => ({ useSession: vi.fn(), signOut: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/tareas" }));
vi.mock("@/hooks/useOnlineStatus", () => ({ useOnlineStatus: () => true }));
vi.mock("@/hooks/usePendingTareas", () => ({ usePendingCount: () => 0 }));

import { useSession } from "next-auth/react";
import { AppShell } from "./AppShell";

const asAdmin = () =>
  vi.mocked(useSession).mockReturnValue({
    data: { user: { email: "admin@x.com", rol: "admin" } },
  } as never);

beforeEach(() => vi.clearAllMocks());

describe("AppShell — bottom nav mobile", () => {
  it("la bottom nav mobile lista Tareas/Edificios/Dashboard + Nueva, sin Usuarios/Config", () => {
    asAdmin();
    render(
      <AppShell>
        <div>contenido</div>
      </AppShell>
    );
    const bottom = screen.getByTestId("bottom-nav");
    expect(screen.getByText("contenido")).toBeInTheDocument();
    expect(bottom).toHaveTextContent("Tareas");
    expect(bottom).toHaveTextContent("Edificios");
    expect(bottom).toHaveTextContent("Dashboard");
    expect(bottom).toHaveTextContent("Nueva");
    expect(bottom).not.toHaveTextContent("Usuarios");
    expect(bottom).not.toHaveTextContent("Config");
  });

  it("la hamburguesa abre el drawer con Usuarios y Config (admin)", () => {
    asAdmin();
    render(
      <AppShell>
        <div>c</div>
      </AppShell>
    );
    // Drawer cerrado: no hay diálogo (el sidebar desktop igual está en el DOM en jsdom,
    // pero el drawer mobile es un role="dialog" que solo aparece al abrir).
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /abrir menú/i }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("link", { name: /usuarios/i })).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: /config/i })).toBeInTheDocument();
  });
});
