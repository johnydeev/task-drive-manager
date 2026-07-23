// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Tarea } from "@/types";

vi.mock("@/lib/auth", () => ({
  requireSession: vi.fn(),
}));

vi.mock("@/lib/google-sheets", () => ({
  getTareaByRowId: vi.fn(),
  getTareaPersistida: vi.fn(),
  deleteTarea: vi.fn().mockResolvedValue(undefined),
  updateTarea: vi.fn(),
  getUsuarios: vi.fn(),
}));

vi.mock("@/lib/google-drive", () => ({
  trashTareaFolder: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/pdf-generator", () => ({
  generateAndUploadReporte: vi.fn(),
}));

import { DELETE } from "@/app/api/tareas/[id]/route";
import { requireSession } from "@/lib/auth";
import { getTareaPersistida, deleteTarea } from "@/lib/google-sheets";
import { trashTareaFolder } from "@/lib/google-drive";

const tarea: Tarea = {
  rowId: "2026-07-06T10:00:00.000Z",
  objetivo: "Pintura",
  fechaInicio: "2026-07-06",
  fechaEstimada: "2026-07-13",
  edificio: "BOEDO 414",
  parteComun: false,
  dpto: "1H",
  informe: "x",
  imagenes: [],
  videos: [],
  documentos: [],
  estado: "Sin asignar",
  prioridad: "Media",
  supervisor: "owner@x.com",
  rowNumber: 3,
};

const params = { params: Promise.resolve({ id: encodeURIComponent(tarea.rowId) }) };

describe("DELETE /api/tareas/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getTareaPersistida).mockResolvedValue(tarea);
  });

  it("el admin puede eliminar cualquier tarea (papelera + borrado de fila)", async () => {
    vi.mocked(requireSession).mockResolvedValue({ user: { email: "admin@x.com", rol: "admin" } } as never);
    const res = await DELETE({} as never, params);
    expect(res.status).toBe(200);
    expect(trashTareaFolder).toHaveBeenCalledWith(
      expect.objectContaining({ edificio: "BOEDO 414", ubicacion: "1H", rowId: tarea.rowId })
    );
    expect(deleteTarea).toHaveBeenCalledWith(tarea.rowId);
  });

  it("el creador NO-admin NO puede borrar (403): borrar es solo del admin", async () => {
    vi.mocked(requireSession).mockResolvedValue({ user: { email: "owner@x.com", rol: "supervisor" } } as never);
    const res = await DELETE({} as never, params);
    expect(res.status).toBe(403);
    expect(deleteTarea).not.toHaveBeenCalled();
    expect(trashTareaFolder).not.toHaveBeenCalled();
  });

  it("cualquier no-admin recibe 403 y no borra", async () => {
    vi.mocked(requireSession).mockResolvedValue({ user: { email: "otro@x.com", rol: "supervisor" } } as never);
    const res = await DELETE({} as never, params);
    expect(res.status).toBe(403);
    expect(deleteTarea).not.toHaveBeenCalled();
    expect(trashTareaFolder).not.toHaveBeenCalled();
  });

  it("responde 404 si la tarea no existe", async () => {
    vi.mocked(requireSession).mockResolvedValue({ user: { email: "admin@x.com", rol: "admin" } } as never);
    vi.mocked(getTareaPersistida).mockResolvedValue(null);
    const res = await DELETE({} as never, params);
    expect(res.status).toBe(404);
    expect(deleteTarea).not.toHaveBeenCalled();
  });
});
