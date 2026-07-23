import { describe, expect, it } from "vitest";
import { TAREAS_RANGE, SHEETS } from "@/lib/google-sheets";

describe("constantes de Sheet names", () => {
  it("usa Tareas como tab name", () => {
    expect(SHEETS.tareas).toBe("Tareas");
  });

  it("TAREAS_RANGE apunta a Tareas!A:AD", () => {
    expect(TAREAS_RANGE).toBe("Tareas!A:AD");
  });
});
