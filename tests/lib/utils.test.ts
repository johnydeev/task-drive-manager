import { describe, expect, it } from "vitest";
import { formatFecha } from "@/lib/utils";

describe("formatFecha", () => {
  it("formatea una fecha sola sin correr el día por timezone", () => {
    // Este es el bug que arreglamos: antes daba 12/07/2026 (medianoche UTC → AR -3h).
    expect(formatFecha("2026-07-13")).toBe("13/07/2026");
    expect(formatFecha("2026-07-06")).toBe("06/07/2026");
    expect(formatFecha("2026-01-01")).toBe("01/01/2026");
  });

  it("devuelve string vacío si no hay fecha", () => {
    expect(formatFecha("")).toBe("");
  });
});
