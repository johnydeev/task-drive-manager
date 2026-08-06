import { describe, it, expect } from "vitest";
import path from "node:path";
import { resolverLogoParaPdf } from "./membrete-logo";

const CWD = path.join("C:", "app");
const siempreExiste = () => true;
const nuncaExiste = () => false;

describe("resolverLogoParaPdf", () => {
  it("deja pasar una URL http(s) que no es un link de archivo de Drive", () => {
    const url = "https://ejemplo.com/logo.png";
    expect(resolverLogoParaPdf(url, CWD, nuncaExiste)).toBe(url);
  });

  it("traduce el link de 'Compartir' de Drive al thumbnail (el /view es HTML, no la imagen)", () => {
    const compartir =
      "https://drive.google.com/file/d/1c_SMC_ZcqodLLROf4pW3iMDBFIlUFoT6/view?usp=sharing";
    expect(resolverLogoParaPdf(compartir, CWD, nuncaExiste)).toBe(
      "https://drive.google.com/thumbnail?id=1c_SMC_ZcqodLLROf4pW3iMDBFIlUFoT6&sz=w400"
    );
  });

  it("traduce una ruta del sitio al archivo de public/", () => {
    expect(resolverLogoParaPdf("/membrete-logo.png", CWD, siempreExiste)).toBe(
      path.join(CWD, "public", "membrete-logo.png")
    );
  });

  it("ignora query y hash al resolver el archivo", () => {
    expect(resolverLogoParaPdf("/membrete-logo.png?v=2", CWD, siempreExiste)).toBe(
      path.join(CWD, "public", "membrete-logo.png")
    );
  });

  it("devuelve vacío si el archivo no está", () => {
    expect(resolverLogoParaPdf("/no-existe.png", CWD, nuncaExiste)).toBe("");
  });

  it("devuelve vacío si no hay logo configurado", () => {
    expect(resolverLogoParaPdf("", CWD, siempreExiste)).toBe("");
    expect(resolverLogoParaPdf(undefined, CWD, siempreExiste)).toBe("");
    expect(resolverLogoParaPdf("   ", CWD, siempreExiste)).toBe("");
  });

  it("rechaza rutas que se escapan de public/", () => {
    expect(resolverLogoParaPdf("/../.env", CWD, siempreExiste)).toBe("");
  });

  it("rechaza una ruta relativa sin barra inicial", () => {
    expect(resolverLogoParaPdf("membrete-logo.png", CWD, siempreExiste)).toBe("");
  });
});
