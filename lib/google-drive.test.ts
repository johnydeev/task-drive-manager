import { describe, it, expect, vi, beforeEach } from "vitest";

const { filesList, filesUpdate } = vi.hoisted(() => ({ filesList: vi.fn(), filesUpdate: vi.fn() }));
vi.mock("googleapis", () => ({
  google: {
    drive: () => ({
      files: { list: filesList, update: filesUpdate, create: vi.fn(), delete: vi.fn() },
      permissions: { create: vi.fn() },
    }),
  },
}));
vi.mock("@/lib/google-auth", () => ({ getGoogleAuth: () => ({}), getDriveRootFolderId: () => "root" }));
vi.mock("@/lib/demo-mode", () => ({ isDemoMode: () => false }));

import { trashFilesInFolder, trashFileByUrl } from "./google-drive";

beforeEach(() => {
  filesList.mockReset();
  filesUpdate.mockReset().mockResolvedValue({});
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
