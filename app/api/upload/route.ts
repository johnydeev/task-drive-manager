import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { ensureTareaFolder, uploadFile } from "@/lib/google-drive";
import { getConfiguracion } from "@/lib/google-sheets";
import { handleApiError, jsonError } from "@/lib/api-utils";

export const runtime = "nodejs";
// Subidas pueden ser grandes: aumentamos el límite del request body.
export const maxDuration = 60;

const IMAGE_MIMES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const VIDEO_MIMES = new Set(["video/mp4", "video/quicktime"]);
const PDF_MIMES = new Set(["application/pdf"]);

export async function POST(req: NextRequest) {
  try {
    await requireSession();

    const form = await req.formData();
    const file = form.get("file");
    const edificio = (form.get("edificio") ?? "").toString();
    const objetivo = (form.get("objetivo") ?? "").toString();

    if (!(file instanceof File)) return jsonError(400, "Falta archivo");
    if (!edificio) return jsonError(400, "Falta edificio");
    if (!objetivo) return jsonError(400, "Falta objetivo");

    const isImage = IMAGE_MIMES.has(file.type);
    const isVideo = VIDEO_MIMES.has(file.type);
    const isPdf = PDF_MIMES.has(file.type);
    if (!isImage && !isVideo && !isPdf) {
      return jsonError(400, `Tipo de archivo no permitido: ${file.type}`);
    }

    const cfg = await getConfiguracion();
    const sizeMB = file.size / (1024 * 1024);
    if (isImage && sizeMB > cfg.maxSizeImagenMB) {
      return jsonError(413, `Imagen excede el máximo de ${cfg.maxSizeImagenMB}MB`);
    }
    if (isVideo && sizeMB > cfg.maxSizeVideoMB) {
      return jsonError(413, `Video excede el máximo de ${cfg.maxSizeVideoMB}MB`);
    }
    if (isPdf && sizeMB > cfg.maxSizePdfMB) {
      return jsonError(413, `PDF excede el máximo de ${cfg.maxSizePdfMB}MB`);
    }

    const folderId = await ensureTareaFolder({ edificio, objetivo });
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadFile({
      buffer,
      name: file.name,
      mimeType: file.type,
      folderId,
    });

    const kind = isImage ? "imagen" : isVideo ? "video" : "documento";
    return NextResponse.json({ url: result.url, fileId: result.fileId, kind });
  } catch (err) {
    return handleApiError(err);
  }
}
