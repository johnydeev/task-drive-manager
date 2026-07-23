// @vitest-environment node
// Si el multipart llega incompleto (body cortado por un proxy/CDN o conexión caída),
// req.formData() tira "Failed to parse body as FormData" — un mensaje que no le dice
// nada al usuario. La ruta tiene que traducirlo a un 400 con texto accionable.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/upload/route";

vi.mock("@/lib/auth", () => ({
  requireSession: vi.fn().mockResolvedValue({ user: { email: "test@x.com", rol: "admin" } }),
}));
vi.mock("@/lib/google-drive", () => ({
  uploadTareaFile: vi.fn(),
  trashFileByUrl: vi.fn(),
}));
vi.mock("@/lib/google-sheets", () => ({ getConfiguracion: vi.fn() }));

import { uploadTareaFile } from "@/lib/google-drive";

const BOUNDARY = "----formdata-test-boundary";

// Multipart válido al que le falta el boundary de cierre (= body truncado).
function truncatedMultipartBody(): string {
  return [
    `--${BOUNDARY}`,
    'Content-Disposition: form-data; name="file"; filename="video.mp4"',
    "Content-Type: video/mp4",
    "",
    "datos-binarios-cortados-a-la-mitad",
  ].join("\r\n");
}

const post = (body: BodyInit, contentType: string) =>
  POST(
    new Request("http://localhost/api/upload", {
      method: "POST",
      headers: { "content-type": contentType },
      body,
    }) as never
  );

describe("POST /api/upload con el body incompleto", () => {
  beforeEach(() => vi.clearAllMocks());

  it("responde 400 con un mensaje entendible en vez del error crudo de FormData", async () => {
    const res = await post(
      truncatedMultipartBody(),
      `multipart/form-data; boundary=${BOUNDARY}`
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/incompleto/i);
    expect(body.error).not.toMatch(/FormData/);
  });

  it("no intenta subir nada a Drive", async () => {
    await post(truncatedMultipartBody(), `multipart/form-data; boundary=${BOUNDARY}`);
    expect(vi.mocked(uploadTareaFile)).not.toHaveBeenCalled();
  });
});
