import { describe, expect, it } from "vitest";
import { edificioMatches } from "@/lib/google-sheets";

describe("edificioMatches", () => {
  it("matchea ignorando mayúsculas/minúsculas", () => {
    expect(edificioMatches("BELGRANO 1429", "Belgrano 1429")).toBe(true);
  });

  it("matchea ignorando acentos", () => {
    expect(edificioMatches("JUFRÉ 21", "Jufre 21")).toBe(true);
  });

  it("matchea ignorando espacios extra y bordes", () => {
    expect(edificioMatches("  BELGRANO   1429 ", "Belgrano 1429")).toBe(true);
  });

  it("NO matchea edificios distintos", () => {
    expect(edificioMatches("BELGRANO 1429", "BELGRANO 1431")).toBe(false);
  });

  it("NO matchea contra string vacío", () => {
    expect(edificioMatches("", "Belgrano 1429")).toBe(false);
  });
});
