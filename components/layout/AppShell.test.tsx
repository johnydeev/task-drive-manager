import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, act } from "@testing-library/react";

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

  it("muestra 'Instalar app' en el sidebar cuando la app es instalable", () => {
    asAdmin();
    window.matchMedia = vi.fn().mockImplementation((q: string) => ({
      matches: false,
      media: q,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    render(
      <AppShell>
        <div>c</div>
      </AppShell>
    );
    expect(screen.queryByRole("button", { name: /instalar app/i })).not.toBeInTheDocument();
    act(() => {
      const evt = new Event("beforeinstallprompt");
      window.dispatchEvent(evt);
    });
    // Drawer cerrado → el único "Instalar app" es el del sidebar desktop.
    expect(screen.getByRole("button", { name: /instalar app/i })).toBeInTheDocument();
  });
});
