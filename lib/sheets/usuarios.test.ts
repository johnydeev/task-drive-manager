import { describe, it, expect } from "vitest";
import { rowsToUsuarios } from "./usuarios";

const HEADER = ["email", "nombre", "rol", "activo", "creado_en", "actualizado_en"];

describe("rowsToUsuarios — por header", () => {
  it("mapea, baja el email y normaliza rol/activo", () => {
    const rows = [
      HEADER,
      ["ADMIN@X.com", "Admin", "ADMIN", "TRUE", "2026-01-01T00:00:00Z", ""],
      ["op@x.com", "Op", "supervisor", "FALSE", "2026-02-01T00:00:00Z", "2026-03-01T00:00:00Z"],
    ];
    const us = rowsToUsuarios(rows);
    expect(us).toHaveLength(2);
    expect(us[0].email).toBe("admin@x.com");
    expect(us[0].rol).toBe("admin");
    expect(us[0].activo).toBe(true);
    expect(us[1].activo).toBe(false);
    expect(us[1].actualizadoEn).toBe("2026-03-01T00:00:00Z");
  });

  it("activo vacío se interpreta como activo", () => {
    const rows = [HEADER, ["a@x.com", "A", "admin", "", "2026-01-01", ""]];
    expect(rowsToUsuarios(rows)[0].activo).toBe(true);
  });

  it("descarta filas sin email", () => {
    const rows = [HEADER, ["", "X", "admin", "TRUE", "", ""]];
    expect(rowsToUsuarios(rows)).toHaveLength(0);
  });
});
