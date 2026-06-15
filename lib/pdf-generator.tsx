import { renderToBuffer } from "@react-pdf/renderer";
import { TareaReportePdf } from "@/components/pdf/TareaReportePdf";
import { ensureTareaFolder, uploadFile } from "./google-drive";
import { isDemoMode } from "./demo-mode";
import type { Tarea } from "@/types";

export async function generateAndUploadReporte(tarea: Tarea): Promise<{ url: string; fileId: string }> {
  if (isDemoMode()) {
    // En demo no generamos PDF real ni tocamos Drive. URL fake para que la UI siga el flow.
    const fakeId = `demo-reporte-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return {
      fileId: fakeId,
      url: `https://drive.google.com/file/d/${fakeId}/view`,
    };
  }

  const generatedAt = new Date().toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
  });

  const buffer = await renderToBuffer(
    <TareaReportePdf tarea={tarea} generatedAt={generatedAt} />
  );

  const folderId = await ensureTareaFolder({
    edificio: tarea.edificio,
    objetivo: tarea.objetivo,
  });

  const safeName = tarea.objetivo
    .replace(/[^a-z0-9]/gi, "_")
    .toLowerCase()
    .slice(0, 40);
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const fileName = `reporte_${safeName}_${ts}.pdf`;

  const result = await uploadFile({
    buffer,
    name: fileName,
    mimeType: "application/pdf",
    folderId,
  });

  return { url: result.url, fileId: result.fileId };
}
