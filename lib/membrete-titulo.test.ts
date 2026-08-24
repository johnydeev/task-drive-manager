import { describe, expect, it } from "vitest";
import { tituloMembrete } from "./membrete-titulo";

describe("tituloMembrete", () => {
  it("pasa a mayúsculas y saca los diacríticos", () => {
    expect(tituloMembrete("Administración Morinigo")).toEqual({
      texto: "ADMINISTRACION MORINIGO",
      usaBigJohn: true,
    });
  });

  it("resuelve ñ y diéresis, que la fuente tampoco tiene", () => {
    expect(tituloMembrete("Peña & Muñiz").texto).toBe("PENA & MUNIZ");
    expect(tituloMembrete("Pingüino").texto).toBe("PINGUINO");
  });

  it("colapsa espacios y recorta los extremos", () => {
    expect(tituloMembrete("  Admin   Morinigo  ").texto).toBe("ADMIN MORINIGO");
  });

  it("marca usaBigJohn=false si queda un carácter sin glifo", () => {
    // La arroba y el # no existen en Big John: dibujarlos dejaría un hueco en el PDF.
    expect(tituloMembrete("Morinigo @ Belgrano").usaBigJohn).toBe(false);
    expect(tituloMembrete("Morinigo #1").usaBigJohn).toBe(false);
  });

  it("normaliza igual aunque no se pueda usar la fuente", () => {
    expect(tituloMembrete("Administración @ Morinigo").texto).toBe("ADMINISTRACION @ MORINIGO");
  });

  it("acepta los signos que la fuente sí trae", () => {
    expect(tituloMembrete("Morinigo & Asoc. (2026)").usaBigJohn).toBe(true);
  });

  it("con nombre vacío no intenta usar la fuente", () => {
    expect(tituloMembrete("   ")).toEqual({ texto: "", usaBigJohn: false });
  });
});
