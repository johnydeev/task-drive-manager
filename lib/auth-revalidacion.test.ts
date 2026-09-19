import { describe, it, expect, vi } from "vitest";
import { revalidarToken, VENTANA_REVALIDACION_MS } from "./auth-revalidacion";
import type { Usuario } from "@/types";

const NOW = 1_700_000_000_000;

const usuario = (extra: Partial<Usuario> = {}): Usuario => ({
  email: "a@x.com",
  nombre: "A",
  rol: "supervisor",
  activo: true,
  creadoEn: "2026-01-01T00:00:00.000-03:00",
  ...extra,
});

describe("revalidarToken", () => {
  it("sin email devuelve el token tal cual y no consulta", async () => {
    const buscar = vi.fn();
    const token = { rol: "admin" as const };
    expect(await revalidarToken(token, NOW, buscar)).toBe(token);
    expect(buscar).not.toHaveBeenCalled();
  });

  it("dentro de la ventana devuelve el token tal cual y no consulta", async () => {
    const buscar = vi.fn();
    const token = { email: "a@x.com", rol: "admin" as const, validadoEn: NOW - VENTANA_REVALIDACION_MS + 1 };
    expect(await revalidarToken(token, NOW, buscar)).toBe(token);
    expect(buscar).not.toHaveBeenCalled();
  });

  it("sin validadoEn consulta (tokens previos al deploy y login inicial)", async () => {
    const buscar = vi.fn().mockResolvedValue(usuario());
    await revalidarToken({ email: "a@x.com" }, NOW, buscar);
    expect(buscar).toHaveBeenCalledWith("a@x.com");
  });

  it("fuera de la ventana y activo: actualiza rol, activo y validadoEn", async () => {
    const buscar = vi.fn().mockResolvedValue(usuario({ rol: "admin" }));
    const token = { email: "a@x.com", rol: "supervisor" as const, validadoEn: NOW - VENTANA_REVALIDACION_MS };
    expect(await revalidarToken(token, NOW, buscar)).toEqual({
      email: "a@x.com",
      rol: "admin",
      activo: true,
      validadoEn: NOW,
    });
  });

  it("normaliza el email a minúsculas al consultar y al devolver", async () => {
    const buscar = vi.fn().mockResolvedValue(usuario());
    const out = await revalidarToken({ email: "A@X.com" }, NOW, buscar);
    expect(buscar).toHaveBeenCalledWith("a@x.com");
    expect(out?.email).toBe("a@x.com");
  });

  it("usuario inactivo → null", async () => {
    const buscar = vi.fn().mockResolvedValue(usuario({ activo: false }));
    expect(await revalidarToken({ email: "a@x.com" }, NOW, buscar)).toBeNull();
  });

  it("usuario inexistente → null", async () => {
    const buscar = vi.fn().mockResolvedValue(null);
    expect(await revalidarToken({ email: "a@x.com" }, NOW, buscar)).toBeNull();
  });

  it("si la búsqueda falla, devuelve el token sin tocar validadoEn (fail-open)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const buscar = vi.fn().mockRejectedValue(new Error("sheets caído"));
    const token = { email: "a@x.com", rol: "admin" as const, validadoEn: NOW - VENTANA_REVALIDACION_MS };
    expect(await revalidarToken(token, NOW, buscar)).toBe(token);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
