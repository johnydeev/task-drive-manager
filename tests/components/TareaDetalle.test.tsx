import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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
        agregarArchivos: vi.fn(),
        generarReporte: vi.fn(),
        remove: vi.fn(),
      },
      usuarios: { list: vi.fn().mockResolvedValue([]) },
      configuracion: {
        get: vi.fn().mockResolvedValue({
          maxImagenes: 10, maxVideos: 3, maxDocumentos: 5,
          maxSizeImagenMB: 10, maxSizeVideoMB: 100, maxSizePdfMB: 20,
        }),
      },
    },
  };
});

import { api } from "@/lib/api-client";

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe("TareaDetalle", () => {
  it("la media va en una barra colapsable: oculta hasta expandir", async () => {
    render(wrap(<TareaDetalle rowId={TAREA_ROW_ID} />));
    // La barra aparece con el total, pero el link del documento no está hasta expandir.
    const barra = await screen.findByRole("button", { name: /archivos multimedia \(1\)/i });
    expect(screen.queryByRole("link", { name: /documento/i })).not.toBeInTheDocument();
    fireEvent.click(barra);
    const link = screen.getByRole("link", { name: /documento/i });
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

  it("el asignado ve el botón de editar en los comentarios de una tarea activa", async () => {
    useSession.mockReturnValue({ data: { user: { email: "op@x.com", rol: "supervisor" } }, status: "authenticated" });
    vi.mocked(api.tareas.get).mockResolvedValueOnce({
      rowId: TAREA_ROW_ID, objetivo: "Test", fechaInicio: "2026-06-14", fechaEstimada: "",
      edificio: "Av. 123", parteComun: false, dpto: "1A", informe: "x",
      imagenes: [], videos: [], documentos: [],
      estado: "En Proceso", prioridad: "Media", supervisor: "a@b.com",
      asignadoA: "op@x.com", comentarioEnProceso: "voy avanzando",
    });
    render(wrap(<TareaDetalle rowId={TAREA_ROW_ID} />));
    expect(await screen.findByRole("button", { name: /editar comentario en proceso/i })).toBeInTheDocument();
  });

  it("un no-asignado NO ve el botón de editar comentarios", async () => {
    useSession.mockReturnValue({ data: { user: { email: "otro@x.com", rol: "supervisor" } }, status: "authenticated" });
    vi.mocked(api.tareas.get).mockResolvedValueOnce({
      rowId: TAREA_ROW_ID, objetivo: "Test", fechaInicio: "2026-06-14", fechaEstimada: "",
      edificio: "Av. 123", parteComun: false, dpto: "1A", informe: "x",
      imagenes: [], videos: [], documentos: [],
      estado: "En Proceso", prioridad: "Media", supervisor: "a@b.com",
      asignadoA: "op@x.com", comentarioEnProceso: "voy avanzando",
    });
    render(wrap(<TareaDetalle rowId={TAREA_ROW_ID} />));
    expect(await screen.findByText("voy avanzando")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /editar comentario/i })).not.toBeInTheDocument();
  });

  it("en una tarea Realizada el asignado ya NO puede editar los comentarios", async () => {
    useSession.mockReturnValue({ data: { user: { email: "op@x.com", rol: "supervisor" } }, status: "authenticated" });
    vi.mocked(api.tareas.get).mockResolvedValueOnce({
      rowId: TAREA_ROW_ID, objetivo: "Test", fechaInicio: "2026-06-14", fechaEstimada: "",
      edificio: "Av. 123", parteComun: false, dpto: "1A", informe: "x",
      imagenes: [], videos: [], documentos: [],
      estado: "Realizada", prioridad: "Media", supervisor: "a@b.com",
      asignadoA: "op@x.com", comentarioEnProceso: "hecho",
    });
    render(wrap(<TareaDetalle rowId={TAREA_ROW_ID} />));
    expect(await screen.findByText("hecho")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /editar comentario/i })).not.toBeInTheDocument();
  });

  it("el asignado ve la sección 'Agregar archivos' en una tarea Objetada", async () => {
    useSession.mockReturnValue({ data: { user: { email: "op@x.com", rol: "supervisor" } }, status: "authenticated" });
    vi.mocked(api.tareas.get).mockResolvedValueOnce({
      rowId: TAREA_ROW_ID, objetivo: "Test", fechaInicio: "2026-06-14", fechaEstimada: "",
      edificio: "Av. 123", parteComun: false, dpto: "1A", informe: "x",
      imagenes: [], videos: [], documentos: [],
      estado: "Objetada", prioridad: "Media", supervisor: "a@b.com",
      asignadoA: "op@x.com", notaObjecion: "falta foto",
    });
    render(wrap(<TareaDetalle rowId={TAREA_ROW_ID} />));
    // Es una barra colapsable: al expandir aparece el botón "Guardar archivos".
    const barra = await screen.findByRole("button", { name: /^agregar archivos$/i });
    fireEvent.click(barra);
    expect(screen.getByRole("button", { name: /guardar archivos/i })).toBeInTheDocument();
  });

  it("un no-asignado NO ve 'Agregar archivos'", async () => {
    useSession.mockReturnValue({ data: { user: { email: "otro@x.com", rol: "supervisor" } }, status: "authenticated" });
    vi.mocked(api.tareas.get).mockResolvedValueOnce({
      rowId: TAREA_ROW_ID, objetivo: "Test", fechaInicio: "2026-06-14", fechaEstimada: "",
      edificio: "Av. 123", parteComun: false, dpto: "1A", informe: "x",
      imagenes: [], videos: [], documentos: [],
      estado: "En Proceso", prioridad: "Media", supervisor: "a@b.com", asignadoA: "op@x.com",
    });
    render(wrap(<TareaDetalle rowId={TAREA_ROW_ID} />));
    expect(await screen.findByRole("heading", { name: /test/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^agregar archivos$/i })).not.toBeInTheDocument();
  });

  it("en una tarea Realizada el asignado NO ve 'Agregar archivos'", async () => {
    useSession.mockReturnValue({ data: { user: { email: "op@x.com", rol: "supervisor" } }, status: "authenticated" });
    vi.mocked(api.tareas.get).mockResolvedValueOnce({
      rowId: TAREA_ROW_ID, objetivo: "Test", fechaInicio: "2026-06-14", fechaEstimada: "",
      edificio: "Av. 123", parteComun: false, dpto: "1A", informe: "x",
      imagenes: [], videos: [], documentos: [],
      estado: "Realizada", prioridad: "Media", supervisor: "a@b.com", asignadoA: "op@x.com",
    });
    render(wrap(<TareaDetalle rowId={TAREA_ROW_ID} />));
    expect(await screen.findByRole("heading", { name: /test/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^agregar archivos$/i })).not.toBeInTheDocument();
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
