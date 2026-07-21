import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { uploadTareaFile, trashFileByUrl } from "@/lib/google-drive";
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
    const ubicacion = (form.get("dpto") ?? "").toString();
    const rowId = (form.get("rowId") ?? "").toString();

    if (!(file instanceof File)) return jsonError(400, "Falta archivo");
    if (!edificio) return jsonError(400, "Falta edificio");
    if (!objetivo) return jsonError(400, "Falta objetivo");
    if (!ubicacion) return jsonError(400, "Falta la ubicación (dpto/parte común)");
    if (!rowId) return jsonError(400, "Falta el identificador de la tarea");

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

    const kind = isImage ? "imagen" : isVideo ? "video" : "documento";
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadTareaFile({
      buffer,
      originalName: file.name,
      mimeType: file.type,
      kind,
      edificio,
      objetivo,
      ubicacion,
      rowId,
    });

    return NextResponse.json({ url: result.url, fileId: result.fileId, kind });
  } catch (err) {
    return handleApiError(err);
  }
}

// Borra (papelera) un archivo ya subido a Drive por su URL. Lo usa el FileUploader
// cuando el usuario elimina una preview antes de crear la tarea (evita huérfanos).
export async function DELETE(req: NextRequest) {
  try {
    await requireSession();
    const url = req.nextUrl.searchParams.get("url");
    if (!url) return jsonError(400, "Falta url");
    await trashFileByUrl(url);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
