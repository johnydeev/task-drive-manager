import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Users, Settings } from "lucide-react";
import { MobileDrawer } from "./MobileDrawer";

const signOut = vi.fn();
vi.mock("next-auth/react", () => ({ signOut: (...a: unknown[]) => signOut(...a) }));

const adminItems = [
  { href: "/usuarios", label: "Usuarios", Icon: Users },
  { href: "/configuracion", label: "Config", Icon: Settings },
];

beforeEach(() => vi.clearAllMocks());

describe("MobileDrawer", () => {
  it("cerrado (open=false): no renderiza nada", () => {
    const { container } = render(
      <MobileDrawer open={false} onClose={() => {}} email="a@x.com" items={adminItems} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("abierto: muestra email, items y Cerrar sesión", () => {
    render(<MobileDrawer open onClose={() => {}} email="a@x.com" items={adminItems} />);
    expect(screen.getByText("a@x.com")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /usuarios/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /config/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cerrar sesión/i })).toBeInTheDocument();
  });

  it("sin items admin: igual muestra Cerrar sesión (rol no-admin)", () => {
    render(<MobileDrawer open onClose={() => {}} email="op@x.com" items={[]} />);
    expect(screen.queryByRole("link", { name: /usuarios/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cerrar sesión/i })).toBeInTheDocument();
  });

  it("cierra al tocar el overlay", () => {
    const onClose = vi.fn();
    render(<MobileDrawer open onClose={onClose} email="a@x.com" items={adminItems} />);
    fireEvent.click(screen.getByTestId("drawer-overlay"));
    expect(onClose).toHaveBeenCalled();
  });

  it("cierra con la X", () => {
    const onClose = vi.fn();
    render(<MobileDrawer open onClose={onClose} email="a@x.com" items={adminItems} />);
    fireEvent.click(screen.getByRole("button", { name: /cerrar menú/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("cierra con Escape", () => {
    const onClose = vi.fn();
    render(<MobileDrawer open onClose={onClose} email="a@x.com" items={adminItems} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("Cerrar sesión llama a signOut", () => {
    render(<MobileDrawer open onClose={() => {}} email="a@x.com" items={adminItems} />);
    fireEvent.click(screen.getByRole("button", { name: /cerrar sesión/i }));
    expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" });
  });
});
