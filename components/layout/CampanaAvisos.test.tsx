import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const { useAvisos, leer, push } = vi.hoisted(() => ({
  useAvisos: vi.fn(),
  leer: vi.fn(),
  push: vi.fn(),
}));
vi.mock("@/hooks/queries", () => ({ useAvisos, AVISOS_KEY: ["avisos"] }));
vi.mock("@/lib/api-client", () => ({ api: { avisos: { leer } } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { CampanaAvisos } from "./CampanaAvisos";

const aviso = (id: string, leidoEn: string | null = null) => ({
  id,
  email: "s@x.com",
  titulo: `Título ${id}`,
  cuerpo: `Cuerpo ${id}`,
  url: `/tareas/${id}`,
  tipo: "asignar" as const,
  creadoEn: new Date(Date.now() - 2 * 3600_000).toISOString(),
  leidoEn,
});

let qc: QueryClient;
function montar(datos: { avisos: ReturnType<typeof aviso>[]; noLeidos: number } | undefined, isError = false) {
  qc = new QueryClient();
  if (datos) qc.setQueryData(["avisos"], datos);
  useAvisos.mockReturnValue({ data: datos, isError });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return render(<CampanaAvisos />, { wrapper });
}
const campana = () => screen.getByRole("button", { name: "Avisos" });

beforeEach(() => {
  vi.clearAllMocks();
  leer.mockResolvedValue({ ok: true, marcados: 1 });
});

describe("CampanaAvisos", () => {
  it("badge con la cantidad de no leídos; 9+ si pasa de 9; sin badge en 0", () => {
    const { unmount } = montar({ avisos: [aviso("1"), aviso("2"), aviso("3")], noLeidos: 3 });
    expect(screen.getByTestId("avisos-badge")).toHaveTextContent("3");
    unmount();
    const r2 = montar({ avisos: [], noLeidos: 12 });
    expect(screen.getByTestId("avisos-badge")).toHaveTextContent("9+");
    r2.unmount();
    montar({ avisos: [aviso("1", "2026")], noLeidos: 0 });
    expect(screen.queryByTestId("avisos-badge")).not.toBeInTheDocument();
  });

  it("abrir marca leídos (PATCH), badge a 0, y los que eran nuevos quedan en negrita", async () => {
    montar({ avisos: [aviso("1"), aviso("2", "2026-09-01T00:00:00.000Z")], noLeidos: 1 });
    await act(async () => {
      fireEvent.click(campana());
    });
    expect(leer).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog", { name: "Avisos" })).toBeInTheDocument();
    expect(qc.getQueryData<{ noLeidos: number }>(["avisos"])?.noLeidos).toBe(0);
    expect(screen.getByText("Título 1")).toHaveClass("font-semibold");
    expect(screen.getByText("Título 2")).not.toHaveClass("font-semibold");
    expect(screen.getAllByText(/hace alrededor de 2 horas/i)).toHaveLength(2);
  });

  it("abrir sin no leídos no llama al PATCH", () => {
    montar({ avisos: [aviso("1", "2026")], noLeidos: 0 });
    fireEvent.click(campana());
    expect(leer).not.toHaveBeenCalled();
  });

  it("si el PATCH falla, invalida la query", async () => {
    leer.mockRejectedValue(new Error("boom"));
    montar({ avisos: [aviso("1")], noLeidos: 1 });
    const spy = vi.spyOn(qc, "invalidateQueries");
    await act(async () => {
      fireEvent.click(campana());
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["avisos"] });
  });

  it("click en un aviso navega a su url y cierra", async () => {
    montar({ avisos: [aviso("7")], noLeidos: 1 });
    await act(async () => {
      fireEvent.click(campana());
    });
    fireEvent.click(screen.getByText("Título 7"));
    expect(push).toHaveBeenCalledWith("/tareas/7");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("Escape y click afuera cierran", async () => {
    montar({ avisos: [aviso("1", "2026")], noLeidos: 0 });
    fireEvent.click(campana());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(campana());
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("vacío → «Sin avisos»; error → mensaje", () => {
    const { unmount } = montar({ avisos: [], noLeidos: 0 });
    fireEvent.click(campana());
    expect(screen.getByText("Sin avisos")).toBeInTheDocument();
    unmount();
    montar(undefined, true);
    fireEvent.click(campana());
    expect(screen.getByText("No se pudieron cargar los avisos")).toBeInTheDocument();
  });

  it("evento 'aviso-nuevo' invalida la query", () => {
    montar({ avisos: [], noLeidos: 0 });
    const spy = vi.spyOn(qc, "invalidateQueries");
    act(() => {
      window.dispatchEvent(new CustomEvent("aviso-nuevo"));
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["avisos"] });
  });
});
