import { describe, it, expect } from "vitest";
import { thumbUrl, logoMembreteUrl } from "./drive-url";

describe("thumbUrl", () => {
  const view = "https://drive.google.com/file/d/ABC123/view";

  it("arma el thumbnail con el fileId y tamaño default 400", () => {
    expect(thumbUrl(view)).toBe("https://drive.google.com/thumbnail?id=ABC123&sz=w400");
  });

  it("respeta un tamaño custom", () => {
    expect(thumbUrl(view, 800)).toBe("https://drive.google.com/thumbnail?id=ABC123&sz=w800");
  });

  it("si la URL no matchea el formato de Drive, la devuelve tal cual", () => {
    expect(thumbUrl("https://example.com/foto.png")).toBe("https://example.com/foto.png");
  });
});

describe("logoMembreteUrl", () => {
  it("traduce el link de 'Compartir' de Drive, que apunta a una página y no a la imagen", () => {
    expect(
      logoMembreteUrl("https://drive.google.com/file/d/ABC123/view?usp=sharing")
    ).toBe("https://drive.google.com/thumbnail?id=ABC123&sz=w400");
  });

  it("deja intacta una ruta del propio sitio", () => {
    expect(logoMembreteUrl("/membrete-logo.png")).toBe("/membrete-logo.png");
  });

  it("deja intacta cualquier otra URL de imagen", () => {
    expect(logoMembreteUrl("https://example.com/logo.png")).toBe("https://example.com/logo.png");
  });

  it("devuelve vacío si no hay logo configurado", () => {
    expect(logoMembreteUrl(undefined)).toBe("");
    expect(logoMembreteUrl("   ")).toBe("");
  });
});
