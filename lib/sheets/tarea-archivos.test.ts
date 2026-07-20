import { describe, it, expect } from "vitest";
import { rowsToArchivos, mediaFromArchivos, archivosToRows } from "./tarea-archivos";

const header = ["id", "tarea_id", "tipo", "url", "orden", "creado_en"];

describe("rowsToArchivos", () => {
  it("mapea filas por header", () => {
    const rows = [
      header,
      ["arch_1", "T1", "imagen", "https://d/i1.jpg", "1", "2026-07-10T00:00:00Z"],
      ["arch_2", "T1", "video", "https://d/v1.mp4", "1", "2026-07-10T00:00:00Z"],
    ];
    const archivos = rowsToArchivos(rows);
    expect(archivos).toHaveLength(2);
    expect(archivos[0]).toEqual({
      id: "arch_1",
      tareaId: "T1",
      tipo: "imagen",
      url: "https://d/i1.jpg",
      orden: 1,
      creadoEn: "2026-07-10T00:00:00Z",
    });
  });

  it("ignora filas sin url", () => {
    const rows = [header, ["arch_1", "T1", "imagen", "", "1", ""]];
    expect(rowsToArchivos(rows)).toHaveLength(0);
  });
});

describe("mediaFromArchivos", () => {
  const archivos = [
    { id: "a", tareaId: "T1", tipo: "imagen" as const, url: "i2", orden: 2, creadoEn: "" },
    { id: "b", tareaId: "T1", tipo: "imagen" as const, url: "i1", orden: 1, creadoEn: "" },
    { id: "c", tareaId: "T1", tipo: "video" as const, url: "v1", orden: 1, creadoEn: "" },
    { id: "d", tareaId: "T2", tipo: "imagen" as const, url: "otra", orden: 1, creadoEn: "" },
  ];

  it("agrupa por tipo, filtra por tareaId y respeta el orden", () => {
    const media = mediaFromArchivos(archivos, "T1");
    expect(media.imagenes).toEqual(["i1", "i2"]); // ordenado por orden
    expect(media.videos).toEqual(["v1"]);
    expect(media.documentos).toEqual([]);
  });
});

describe("archivosToRows", () => {
  it("arma filas con tipo/orden/url a partir de la media", () => {
    const rows = archivosToRows("T1", {
      imagenes: ["i1", "i2"],
      videos: ["v1"],
      documentos: [],
    });
    // 3 archivos: 2 imagenes + 1 video
    expect(rows).toHaveLength(3);
    // cada fila: [id, tarea_id, tipo, url, orden, creado_en]
    expect(rows[0][1]).toBe("T1");
    expect(rows[0][2]).toBe("imagen");
    expect(rows[0][3]).toBe("i1");
    expect(rows[0][4]).toBe(1);
    expect(rows[2][2]).toBe("video");
    expect(rows[2][4]).toBe(1); // el orden reinicia por tipo
  });
});
