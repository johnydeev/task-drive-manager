// @vitest-environment node
// Edición de campos de la tarea (PUT). El form manda el payload completo, con las
// fechas opcionales en "" cuando están vacías: eso NO puede dar 400 "Datos inválidos".
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import type { Tarea } from "@/types";

const { requireSession } = vi.hoisted(() => ({ requireSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireSession }));

vi.mock("@/lib/google-sheets", () => ({
  getTareaByRowId: vi.fn(),
  getTareaPersistida: vi.fn(),
  updateTarea: vi.fn(),
  deleteTarea: vi.fn(),
  getUsuarios: vi.fn(),
}));
vi.mock("@/lib/google-drive", () => ({ trashTareaFolder: vi.fn() }));
vi.mock("@/lib/pdf-generator", () => ({ generateAndUploadReporte: vi.fn() }));

import { PUT } from "@/app/api/tareas/[id]/route";
import { getTareaPersistida, updateTarea } from "@/lib/google-sheets";

const ROW_ID = "2026-07-23T10:00:00.000Z";

const tarea = (over: Partial<Tarea> = {}): Tarea => ({
  rowId: ROW_ID,
  objetivo: "Objetivo viejo",
  fechaInicio: "2026-07-23",
  fechaEstimada: "", // tarea creada sin fecha estimada (es opcional)
  edificio: "BOEDO 414",
  parteComun: false,
  dpto: "1H",
  informe: "detalle",
  imagenes: [],
  videos: [],
  documentos: [],
  estado: "Sin asignar",
  prioridad: "Media",
  supervisor: "creador@x.com",
  ...over,
});

const put = (body: unknown) =>
  PUT(
    new Request("http://localhost/api/tareas/x", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }) as unknown as NextRequest,
    { params: Promise.resolve({ id: ROW_ID }) }
  );

// Lo que realmente manda useTareaForm en modo edición.
const payloadDelForm = (over: Record<string, unknown> = {}) => ({
  rowId: ROW_ID,
  objetivo: "Objetivo nuevo",
  fechaInicio: "2026-07-23",
  fechaEstimada: "",
  edificio: "BOEDO 414",
  parteComun: false,
  dpto: "1H",
  informe: "detalle",
  proveedor: "",
  prioridad: "Media",
  imagenes: [],
  videos: [],
  documentos: [],
  comentarioEnProceso: "",
  comentarioRealizado: "",
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue({ user: { email: "admin@x.com", rol: "admin" } });
  vi.mocked(getTareaPersistida).mockResolvedValue(tarea());
  vi.mocked(updateTarea).mockImplementation(async (p) => ({ ...tarea(), ...p }) as Tarea);
});

describe("PUT /api/tareas/[id] — editar campos", () => {
  it("el admin edita el objetivo de una tarea SIN fecha estimada", async () => {
    const res = await put(payloadDelForm());
    expect(res.status).toBe(200);
    expect(vi.mocked(updateTarea)).toHaveBeenCalledWith(
      expect.objectContaining({ rowId: ROW_ID, objetivo: "Objetivo nuevo" })
    );
  });

  it("edita con fecha estimada cargada", async () => {
    const res = await put(payloadDelForm({ fechaEstimada: "2026-07-30" }));
    expect(res.status).toBe(200);
    expect(vi.mocked(updateTarea)).toHaveBeenCalledWith(
      expect.objectContaining({ fechaEstimada: "2026-07-30" })
    );
  });

  it("rechaza una fecha con formato inválido", async () => {
    const res = await put(payloadDelForm({ fechaEstimada: "30/07/2026" }));
    expect(res.status).toBe(400);
  });

  it("un supervisor no puede editar campos", async () => {
    requireSession.mockResolvedValue({ user: { email: "otro@x.com", rol: "supervisor" } });
    const res = await put(payloadDelForm());
    expect(res.status).toBe(403);
  });
});
