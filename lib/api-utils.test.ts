// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ZodError } from "zod";
import { handleApiError, jsonError } from "./api-utils";

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errorSpy.mockRestore());

describe("handleApiError", () => {
  it("un Error común responde 500 opaco con ref, sin filtrar el mensaje", async () => {
    const res = handleApiError(new Error("Unable to parse range: Tareas!A:AD"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Error interno");
    expect(body.ref).toMatch(/^[A-Za-z0-9_-]{8}$/);
    expect(JSON.stringify(body)).not.toContain("Tareas!A:AD");
    // El mismo ref queda en el log del server, con el error completo.
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining(`ref=${body.ref}`),
      expect.any(Error)
    );
  });

  it("un valor que no es Error también responde 500 opaco con ref", async () => {
    const res = handleApiError("boom");
    expect(res.status).toBe(500);
    expect((await res.json()).ref).toHaveLength(8);
  });

  it("un Response pasa tal cual", () => {
    const r = jsonError(401, "No autenticado");
    expect(handleApiError(r)).toBe(r);
  });

  it("ZodError responde 400 con detalles", async () => {
    const res = handleApiError(new ZodError([]));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Datos inválidos");
  });
});
