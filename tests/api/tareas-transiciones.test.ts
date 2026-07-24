// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

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
vi.mock("@/lib/pdf-generator", () => ({
  generateAndUploadReporte: vi.fn().mockResolvedValue({ url: "https://drive/r.pdf", fileId: "r" }),
}));

import { getTareaPersistida, updateTarea, getUsuarios } from "@/lib/google-sheets";
import { PATCH } from "@/app/api/tareas/[id]/route";
import type { NextRequest } from "next/server";
import type { Tarea } from "@/types";

const ROW_ID = "2026-07-16T10:00:00.000Z";

const tarea = (over: Partial<Tarea> = {}): Tarea => ({
  rowId: ROW_ID, objetivo: "x", fechaInicio: "2026-07-16", fechaEstimada: "2026-07-20",
  edificio: "Edif A", parteComun: false, dpto: "1A", informe: "", imagenes: [], videos: [], documentos: [],
  estado: "Sin asignar", prioridad: "Media", supervisor: "creador@x.com", ...over,
});

const patch = (body: unknown) =>
  PATCH(
    new Request("http://localhost/api/tareas/x", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }) as unknown as NextRequest,
    { params: Promise.resolve({ id: ROW_ID }) }
  );

const asSession = (email: string, rol: "admin" | "supervisor") =>
  requireSession.mockResolvedValue({ user: { email, rol } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(updateTarea).mockImplementation(async (p) => ({ ...tarea(), ...p }) as Tarea);
  vi.mocked(getUsuarios).mockResolvedValue([
    { email: "juan@x.com", nombre: "Juan", rol: "supervisor", activo: true, creadoEn: "" },
  ]);
});

describe("PATCH transiciones — asignar", () => {
  it("admin asigna: Sin asignar → Asignada con asignadoA", async () => {
    asSession("admin@x.com", "admin");
    vi.mocked(getTareaPersistida).mockResolvedValue(tarea({ estado: "Sin asignar" }));
    const res = await patch({ asignadoA: "juan@x.com" });
    expect(res.status).toBe(200);
    expect(vi.mocked(updateTarea)).toHaveBeenCalledWith(
      expect.objectContaining({ estado: "Asignada", asignadoA: "juan@x.com" })
    );
  });

  it("no-admin no puede asignar (403)", async () => {
    asSession("sup@x.com", "supervisor");
    vi.mocked(getTareaPersistida).mockResolvedValue(tarea());
    const res = await patch({ asignadoA: "juan@x.com" });
    expect(res.status).toBe(403);
    expect(vi.mocked(updateTarea)).not.toHaveBeenCalled();
  });

  it("reasignar resetea el ciclo (limpia aceptadaEn/revisionEn)", async () => {
    asSession("admin@x.com", "admin");
    vi.mocked(getTareaPersistida).mockResolvedValue(
      tarea({ estado: "Aceptada", asignadoA: "otro@x.com", aceptadaEn: "2026-07-16T11:00:00.000Z" })
    );
    await patch({ asignadoA: "juan@x.com" });
    expect(vi.mocked(updateTarea)).toHaveBeenCalledWith(
      expect.objectContaining({ estado: "Asignada", asignadoA: "juan@x.com", aceptadaEn: "", revisionEn: "" })
    );
  });
});

describe("PATCH transiciones — asignado", () => {
  it("el asignado acepta: Asignada → Aceptada", async () => {
    asSession("juan@x.com", "supervisor");
    vi.mocked(getTareaPersistida).mockResolvedValue(tarea({ estado: "Asignada", asignadoA: "juan@x.com" }));
    const res = await patch({ accion: "aceptar" });
    expect(res.status).toBe(200);
    expect(vi.mocked(updateTarea)).toHaveBeenCalledWith(expect.objectContaining({ estado: "Aceptada" }));
  });

  it("otro usuario no puede aceptar (403)", async () => {
    asSession("ajeno@x.com", "supervisor");
    vi.mocked(getTareaPersistida).mockResolvedValue(tarea({ estado: "Asignada", asignadoA: "juan@x.com" }));
    const res = await patch({ accion: "aceptar" });
    expect(res.status).toBe(403);
  });

  it("aceptar desde un estado que no es Asignada → 409", async () => {
    asSession("juan@x.com", "supervisor");
    vi.mocked(getTareaPersistida).mockResolvedValue(tarea({ estado: "En Proceso", asignadoA: "juan@x.com" }));
    const res = await patch({ accion: "aceptar" });
    expect(res.status).toBe(409);
  });

  it("empezar: Aceptada → En Proceso", async () => {
    asSession("juan@x.com", "supervisor");
    vi.mocked(getTareaPersistida).mockResolvedValue(tarea({ estado: "Aceptada", asignadoA: "juan@x.com" }));
    const res = await patch({ accion: "empezar" });
    expect(res.status).toBe(200);
    expect(vi.mocked(updateTarea)).toHaveBeenCalledWith(expect.objectContaining({ estado: "En Proceso" }));
  });

  it("empezar con comentario: guarda comentarioEnProceso al entrar a En Proceso", async () => {
    asSession("juan@x.com", "supervisor");
    vi.mocked(getTareaPersistida).mockResolvedValue(tarea({ estado: "Aceptada", asignadoA: "juan@x.com" }));
    const res = await patch({ accion: "empezar", comentario: "arranco con esto" });
    expect(res.status).toBe(200);
    expect(vi.mocked(updateTarea)).toHaveBeenCalledWith(
      expect.objectContaining({ estado: "En Proceso", comentarioEnProceso: "arranco con esto" })
    );
  });

  it("revisar: En Proceso → En Revisión con revisionEn + comentario", async () => {
    asSession("juan@x.com", "supervisor");
    vi.mocked(getTareaPersistida).mockResolvedValue(tarea({ estado: "En Proceso", asignadoA: "juan@x.com" }));
    const res = await patch({ accion: "revisar", comentario: "listo" });
    expect(res.status).toBe(200);
    const arg = vi.mocked(updateTarea).mock.calls[0][0];
    expect(arg.estado).toBe("En Revisión");
    expect(arg.comentarioRevision).toBe("listo");
    expect(arg.revisionEn).toBeTruthy();
  });
});

describe("PATCH transiciones — objetar", () => {
  it("admin objeta una tarea En Revisión → Objetada con nota", async () => {
    asSession("admin@x.com", "admin");
    vi.mocked(getTareaPersistida).mockResolvedValue(tarea({ estado: "En Revisión", asignadoA: "juan@x.com" }));
    const res = await patch({ accion: "objetar", nota: "falta el informe" });
    expect(res.status).toBe(200);
    expect(vi.mocked(updateTarea)).toHaveBeenCalledWith(
      expect.objectContaining({ estado: "Objetada", notaObjecion: "falta el informe" })
    );
  });

  it("objetar sin motivo → 400", async () => {
    asSession("admin@x.com", "admin");
    vi.mocked(getTareaPersistida).mockResolvedValue(tarea({ estado: "En Revisión", asignadoA: "juan@x.com" }));
    const res = await patch({ accion: "objetar", nota: "  " });
    expect(res.status).toBe(400);
  });

  it("un no-admin no puede objetar → 403", async () => {
    asSession("juan@x.com", "supervisor");
    vi.mocked(getTareaPersistida).mockResolvedValue(tarea({ estado: "En Revisión", asignadoA: "juan@x.com" }));
    const res = await patch({ accion: "objetar", nota: "x" });
    expect(res.status).toBe(403);
  });

  it("el asignado reenvía una Objetada → En Revisión (pisa el comentario)", async () => {
    asSession("juan@x.com", "supervisor");
    vi.mocked(getTareaPersistida).mockResolvedValue(tarea({ estado: "Objetada", asignadoA: "juan@x.com" }));
    const res = await patch({ accion: "revisar", comentario: "corregido" });
    expect(res.status).toBe(200);
    expect(vi.mocked(updateTarea)).toHaveBeenCalledWith(
      expect.objectContaining({ estado: "En Revisión", comentarioRevision: "corregido" })
    );
  });
});

describe("PATCH transiciones — cerrar (admin)", () => {
  it("admin cierra: En Revisión → Realizada", async () => {
    asSession("admin@x.com", "admin");
    vi.mocked(getTareaPersistida).mockResolvedValue(tarea({ estado: "En Revisión", asignadoA: "juan@x.com" }));
    const res = await patch({ accion: "cerrar", nota: "ok" });
    expect(res.status).toBe(200);
    expect(vi.mocked(updateTarea)).toHaveBeenCalledWith(
      expect.objectContaining({ estado: "Realizada", comentarioRealizado: "ok" })
    );
  });

  it("cerrar sin nota → 400 (la nota de cierre es obligatoria)", async () => {
    asSession("admin@x.com", "admin");
    vi.mocked(getTareaPersistida).mockResolvedValue(tarea({ estado: "En Revisión", asignadoA: "juan@x.com" }));
    const res = await patch({ accion: "cerrar", nota: "  " });
    expect(res.status).toBe(400);
    expect(vi.mocked(updateTarea)).not.toHaveBeenCalled();
  });

  it("el asignado no puede cerrar (403)", async () => {
    asSession("juan@x.com", "supervisor");
    vi.mocked(getTareaPersistida).mockResolvedValue(tarea({ estado: "En Revisión", asignadoA: "juan@x.com" }));
    const res = await patch({ accion: "cerrar" });
    expect(res.status).toBe(403);
  });
});

describe("PATCH transiciones — editar comentarios (asignado)", () => {
  it("el asignado edita el comentario en proceso (no cambia el estado)", async () => {
    asSession("juan@x.com", "supervisor");
    vi.mocked(getTareaPersistida).mockResolvedValue(
      tarea({ estado: "En Revisión", asignadoA: "juan@x.com", comentarioEnProceso: "viejo" })
    );
    const res = await patch({ accion: "editarComentarioProceso", comentario: "nuevo texto" });
    expect(res.status).toBe(200);
    const arg = vi.mocked(updateTarea).mock.calls[0][0];
    expect(arg).toMatchObject({ comentarioEnProceso: "nuevo texto" });
    expect(arg).not.toHaveProperty("estado");
  });

  it("el asignado edita el comentario de revisión", async () => {
    asSession("juan@x.com", "supervisor");
    vi.mocked(getTareaPersistida).mockResolvedValue(
      tarea({ estado: "En Revisión", asignadoA: "juan@x.com", comentarioRevision: "viejo" })
    );
    const res = await patch({ accion: "editarComentarioRevision", comentario: "revisión corregida" });
    expect(res.status).toBe(200);
    expect(vi.mocked(updateTarea)).toHaveBeenCalledWith(
      expect.objectContaining({ comentarioRevision: "revisión corregida" })
    );
  });

  it("un no-asignado no puede editar comentarios (403)", async () => {
    asSession("otro@x.com", "supervisor");
    vi.mocked(getTareaPersistida).mockResolvedValue(
      tarea({ estado: "En Revisión", asignadoA: "juan@x.com" })
    );
    const res = await patch({ accion: "editarComentarioProceso", comentario: "x" });
    expect(res.status).toBe(403);
    expect(vi.mocked(updateTarea)).not.toHaveBeenCalled();
  });

  it("no se puede editar una tarea Realizada (409)", async () => {
    asSession("juan@x.com", "supervisor");
    vi.mocked(getTareaPersistida).mockResolvedValue(
      tarea({ estado: "Realizada", asignadoA: "juan@x.com" })
    );
    const res = await patch({ accion: "editarComentarioProceso", comentario: "x" });
    expect(res.status).toBe(409);
    expect(vi.mocked(updateTarea)).not.toHaveBeenCalled();
  });

  it("el admin (no asignado) tampoco edita los comentarios del asignado (403)", async () => {
    asSession("admin@x.com", "admin");
    vi.mocked(getTareaPersistida).mockResolvedValue(
      tarea({ estado: "En Revisión", asignadoA: "juan@x.com" })
    );
    const res = await patch({ accion: "editarComentarioRevision", comentario: "x" });
    expect(res.status).toBe(403);
  });
});
