import { describe, it, expect } from "vitest";
import { thumbUrl } from "./drive-url";

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
