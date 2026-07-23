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
        asignar: vi.fn(),
        transicionar: vi.fn(),
        generarReporte: vi.fn(),
        remove: vi.fn(),
      },
      usuarios: { list: vi.fn().mockResolvedValue([]) },
    },
  };
});

import { api } from "@/lib/api-client";

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

  it("el admin ve el panel de acciones y puede asignar una tarea Sin asignar", async () => {
    render(wrap(<TareaDetalle rowId={TAREA_ROW_ID} />));
    expect(await screen.findByText(/^acciones$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^asignar$/i })).toBeInTheDocument();
  });

  it("muestra la fecha de Revisión y la objeción en Comentarios", async () => {
    vi.mocked(api.tareas.get).mockResolvedValueOnce({
      rowId: TAREA_ROW_ID, objetivo: "Test", fechaInicio: "2026-06-14", fechaEstimada: "",
      edificio: "Av. 123", parteComun: false, dpto: "1A", informe: "x",
      imagenes: [], videos: [], documentos: [],
      estado: "Objetada", prioridad: "Media", supervisor: "a@b.com",
      comentarioRevision: "listo",
      revisionEn: "2026-07-23T12:00:00.000Z",
      notaObjecion: "falta el informe",
      objetadaEn: "2026-07-23T15:00:00.000Z",
    });
    render(wrap(<TareaDetalle rowId={TAREA_ROW_ID} />));
    expect(await screen.findByText(/Revisión - /)).toBeInTheDocument();
    expect(screen.getByText(/Objeción - /)).toBeInTheDocument();
    expect(screen.getByText("falta el informe")).toBeInTheDocument();
  });

  it("un supervisor que no la creó la ve pero sin acciones de escritura", async () => {
    useSession.mockReturnValue({ data: { user: { email: "otro@x.com", rol: "supervisor" } }, status: "authenticated" });
    render(wrap(<TareaDetalle rowId={TAREA_ROW_ID} />));
    // Ve la tarea…
    expect(await screen.findByRole("heading", { name: /test/i })).toBeInTheDocument();
    // …pero no las acciones de escritura (no es admin ni el asignado).
    expect(screen.queryByRole("button", { name: /^editar$/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/^acciones$/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /eliminar/i })).not.toBeInTheDocument();
  });
});
