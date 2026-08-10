// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const { filesList, filesCreate, filesUpdate } = vi.hoisted(() => ({
  filesList: vi.fn(),
  filesCreate: vi.fn(),
  filesUpdate: vi.fn(),
}));

vi.mock("googleapis", () => ({
  google: {
    drive: () => ({
      files: { list: filesList, create: filesCreate, update: filesUpdate, delete: vi.fn() },
      permissions: { create: vi.fn() },
    }),
  },
}));
vi.mock("@/lib/google-auth", () => ({
  getGoogleAuth: () => ({}),
  getDriveRootFolderId: () => "ROOT",
}));
vi.mock("@/lib/demo-mode", () => ({ isDemoMode: () => false }));

import { ensureVisitasFolder, agruparVisitaEnCarpeta } from "@/lib/drive-visitas";

// Cada carpeta pedida "no existe" y se crea: devuelve un id derivado del nombre.
function simularCarpetasNuevas() {
  filesList.mockResolvedValue({ data: { files: [] } });
  filesCreate.mockImplementation(async ({ requestBody }) => ({
    data: { id: `id-${requestBody.name}` },
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  simularCarpetasNuevas();
});

describe("ensureVisitasFolder", () => {
  it("crea {raíz}/Visitas/{Edificio}, como rama hermana de Tareas", async () => {
    const id = await ensureVisitasFolder("Castro Barros 1310");

    const creadas = filesCreate.mock.calls.map((c) => ({
      name: c[0].requestBody.name,
      parent: c[0].requestBody.parents[0],
    }));
    expect(creadas).toEqual([
      { name: "Visitas", parent: "ROOT" },
      { name: "Castro Barros 1310", parent: "id-Visitas" },
    ]);
    expect(id).toBe("id-Castro Barros 1310");
    // No cuelga del árbol de tareas.
    expect(creadas.some((c) => c.name === "Tareas")).toBe(false);
  });

  it("limpia el nombre del edificio para Drive", async () => {
    await ensureVisitasFolder("Edificio A/B: 12");
    const nombres = filesCreate.mock.calls.map((c) => c[0].requestBody.name);
    expect(nombres).toContain("Edificio A B 12");
  });

  it("cae a 'Sin edificio' si viene vacío", async () => {
    await ensureVisitasFolder("   ");
    const nombres = filesCreate.mock.calls.map((c) => c[0].requestBody.name);
    expect(nombres).toContain("Sin edificio");
  });
});

describe("agruparVisitaEnCarpeta", () => {
  beforeEach(() => filesUpdate.mockResolvedValue({ data: {} }));

  it("crea la carpeta con el nombre del PDF y mueve todo adentro", async () => {
    const carpeta = await agruparVisitaEnCarpeta({
      edificio: "Castro Barros 1310",
      nombreCarpeta: "VISITA - 10-08-2026 - Castro Barros 1310",
      fileIds: ["pdf-1", "foto-1", "foto-2"],
    });

    // `ensureFolder` cachea las carpetas ya vistas, así que las de nivel superior pueden
    // no volver a crearse: lo que importa es que la carpeta de la visita cuelgue del edificio.
    const creada = filesCreate.mock.calls
      .map((c) => c[0].requestBody)
      .find((b) => b.name === "VISITA - 10-08-2026 - Castro Barros 1310");
    expect(creada).toBeDefined();
    expect(creada!.parents).toEqual(["id-Castro Barros 1310"]);
    expect(carpeta).toBe("id-VISITA - 10-08-2026 - Castro Barros 1310");

    // Cada archivo se mueve de la carpeta del edificio a la de la visita.
    expect(filesUpdate).toHaveBeenCalledTimes(3);
    for (const [fileId, call] of ["pdf-1", "foto-1", "foto-2"].map(
      (id, i) => [id, filesUpdate.mock.calls[i][0]] as const
    )) {
      expect(call.fileId).toBe(fileId);
      expect(call.addParents).toBe("id-VISITA - 10-08-2026 - Castro Barros 1310");
      expect(call.removeParents).toBe("id-Castro Barros 1310");
    }
  });

  it("no mueve nada si no hay archivos", async () => {
    await agruparVisitaEnCarpeta({
      edificio: "A",
      nombreCarpeta: "VISITA - 10-08-2026 - A",
      fileIds: [],
    });
    expect(filesUpdate).not.toHaveBeenCalled();
  });
});
