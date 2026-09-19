import { describe, it, expect, vi, beforeEach } from "vitest";

const { filesList, filesUpdate, filesGet } = vi.hoisted(() => ({
  filesList: vi.fn(),
  filesUpdate: vi.fn(),
  filesGet: vi.fn(),
}));
vi.mock("googleapis", () => ({
  google: {
    drive: () => ({
      files: { list: filesList, update: filesUpdate, get: filesGet, create: vi.fn(), delete: vi.fn() },
      permissions: { create: vi.fn() },
    }),
  },
}));
vi.mock("@/lib/google-auth", () => ({ getGoogleAuth: () => ({}), getDriveRootFolderId: () => "root" }));
vi.mock("@/lib/demo-mode", () => ({ isDemoMode: () => false }));

import { trashFilesInFolder, trashFileByUrl, estaBajoRaiz } from "./google-drive";

beforeEach(() => {
  filesList.mockReset();
  filesUpdate.mockReset().mockResolvedValue({});
  filesGet.mockReset();
});

describe("trashFilesInFolder", () => {
  it("manda a papelera cada archivo de la carpeta", async () => {
    filesList.mockResolvedValue({ data: { files: [{ id: "a" }, { id: "b" }] } });
    await trashFilesInFolder("folder-1");
    expect(filesUpdate).toHaveBeenCalledTimes(2);
    expect(filesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: "a", requestBody: { trashed: true } })
    );
    expect(filesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: "b", requestBody: { trashed: true } })
    );
  });

  it("no hace nada si la carpeta está vacía", async () => {
    filesList.mockResolvedValue({ data: { files: [] } });
    await trashFilesInFolder("folder-1");
    expect(filesUpdate).not.toHaveBeenCalled();
  });
});

describe("trashFileByUrl", () => {
  it("manda a papelera el archivo extrayendo el fileId de la URL", async () => {
    await trashFileByUrl("https://drive.google.com/file/d/abc123/view");
    expect(filesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: "abc123", requestBody: { trashed: true } })
    );
  });

  it("no hace nada si la URL no tiene fileId", async () => {
    await trashFileByUrl("https://example.com/no-drive");
    expect(filesUpdate).not.toHaveBeenCalled();
  });
});

describe("estaBajoRaiz", () => {
  // Cada respuesta de files.get, en orden de llamada (hijo → padre → …).
  const cadena = (...parents: (string[] | undefined)[]) => {
    for (const p of parents) filesGet.mockResolvedValueOnce({ data: { id: "x", parents: p } });
  };

  it("hijo directo de la raíz → true", async () => {
    cadena(["root"]);
    expect(await estaBajoRaiz("f1")).toBe(true);
    expect(filesGet).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: "f1", fields: "id,parents", supportsAllDrives: true })
    );
  });

  it("nieto (raíz / Tareas / Edificio / archivo) → true", async () => {
    cadena(["edificio"], ["tareas"], ["root"]);
    expect(await estaBajoRaiz("f1")).toBe(true);
    expect(filesGet).toHaveBeenCalledTimes(3);
  });

  it("sin parents en la cadena → false", async () => {
    cadena(["otra"], undefined);
    expect(await estaBajoRaiz("f1")).toBe(false);
  });

  it("más de 8 niveles sin llegar a la raíz → false", async () => {
    for (let i = 0; i < 20; i++) filesGet.mockResolvedValueOnce({ data: { id: "x", parents: [`p${i}`] } });
    expect(await estaBajoRaiz("f1")).toBe(false);
    expect(filesGet).toHaveBeenCalledTimes(8);
  });

  it("propaga el error de Drive (ej. 404)", async () => {
    filesGet.mockRejectedValueOnce(Object.assign(new Error("not found"), { code: "404" }));
    await expect(estaBajoRaiz("f1")).rejects.toThrow("not found");
  });
});
