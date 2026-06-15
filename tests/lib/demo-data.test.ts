import { describe, expect, it, beforeEach } from "vitest";
import { getDemoTareas, resetDemoState, getDemoConfig } from "@/lib/demo-data";

describe("demo data", () => {
  beforeEach(() => resetDemoState());

  it("toda tarea tiene array de documentos", () => {
    const tareas = getDemoTareas();
    for (const t of tareas) {
      expect(Array.isArray(t.documentos)).toBe(true);
    }
  });

  it("al menos una tarea tiene un documento de ejemplo", () => {
    const tareas = getDemoTareas();
    const conDocs = tareas.filter((t) => t.documentos.length > 0);
    expect(conDocs.length).toBeGreaterThan(0);
  });

  it("al menos una tarea tiene reporteUrl", () => {
    const tareas = getDemoTareas();
    const conReporte = tareas.filter((t) => t.reporteUrl);
    expect(conReporte.length).toBeGreaterThan(0);
  });

  it("config tiene maxDocumentos default 5", () => {
    expect(getDemoConfig().maxDocumentos).toBe(5);
  });

  it("config tiene maxSizePdfMB default 20", () => {
    expect(getDemoConfig().maxSizePdfMB).toBe(20);
  });
});
