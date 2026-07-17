import { describe, it, expect } from "vitest";
import { displayName } from "./user-display";
import type { Usuario } from "@/types";

const us: Usuario[] = [{ email: "a@x.com", nombre: "Ana", rol: "admin", activo: true, creadoEn: "" }];

describe("displayName", () => {
  it("devuelve el nombre si el email resuelve", () => {
    expect(displayName("A@X.com", us)).toBe("Ana");
  });
  it("cae al email si no resuelve o no hay nombre", () => {
    expect(displayName("z@x.com", us)).toBe("z@x.com");
    expect(displayName("a@x.com", undefined)).toBe("a@x.com");
  });
});
