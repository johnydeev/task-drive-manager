import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TareaDetalle } from "@/components/tareas/TareaDetalle";
import type { Tarea } from "@/types";

const TAREA_ROW_ID = "2026-06-14T10:00:00.000Z";
const DOC_URL = "https://drive.google.com/file/d/doc1/view";

const { useSession } = vi.hoisted(() => ({ useSession: vi.fn() }));
vi.mock("next-auth/react", () => ({ useSession }));

// La tarea de prueba tiene supervisor "a@b.com" (ver mock de api-client).
beforeEach(() => {
  useSession.mockReturnValue({ data: { user: { email: "a@b.com", rol: "admin" } }, status: "authenticated" });
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/lib/api-client", () => {
  const fakeTarea: Tarea = {
    rowId: "2026-06-14T10:00:00.000Z",
    objetivo: "Test",
    fechaInicio: "2026-06-14",
    fechaEstimada: "2026-06-20",
    edificio: "Av. 123",
    parteComun: false,
    dpto: "1A",
    informe: "Informe de prueba",
    imagenes: [],
    videos: [],
    documentos: ["https://drive.google.com/file/d/doc1/view"],
    estado: "Sin asignar",
    prioridad: "Media",
    supervisor: "a@b.com",
  };
  return {
    api: {
      tareas: {
        get: vi.fn().mockResolvedValue(fakeTarea),
        patchEstado: vi.fn(),
        generarReporte: vi.fn(),
        remove: vi.fn(),
      },
      usuarios: { list: vi.fn().mockResolvedValue([]) },
    },
  };
});

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe("TareaDetalle", () => {
  it("muestra la sección de documentos cuando hay PDFs adjuntos", async () => {
    render(wrap(<TareaDetalle rowId={TAREA_ROW_ID} />));
    const link = await screen.findByRole("link", { name: /documento/i });
    expect(link).toHaveAttribute("href", DOC_URL);
  });

  it("un supervisor que no la creó la ve pero sin acciones de escritura", async () => {
    useSession.mockReturnValue({ data: { user: { email: "otro@x.com", rol: "supervisor" } }, status: "authenticated" });
    render(wrap(<TareaDetalle rowId={TAREA_ROW_ID} />));
    // Ve la tarea…
    expect(await screen.findByRole("heading", { name: /test/i })).toBeInTheDocument();
    // …pero no las acciones de escritura.
    expect(screen.queryByRole("button", { name: /^editar$/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/cambiar estado/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /eliminar/i })).not.toBeInTheDocument();
  });
});
