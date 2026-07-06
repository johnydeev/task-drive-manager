import { renderToBuffer } from "@react-pdf/renderer";
import { TareaReportePdf } from "@/components/pdf/TareaReportePdf";
import { uploadTareaFile } from "./google-drive";
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

  // Va a la subcarpeta "Reporte" de la misma carpeta de la tarea (derivada del rowId).
  // Si ya hay reportes previos, uploadTareaFile lo nombra reporte-02, reporte-03, etc.
  const result = await uploadTareaFile({
    buffer,
    originalName: "reporte.pdf",
    mimeType: "application/pdf",
    kind: "reporte",
    edificio: tarea.edificio,
    objetivo: tarea.objetivo,
    ubicacion: tarea.dpto,
    rowId: tarea.rowId,
  });

  return { url: result.url, fileId: result.fileId };
}
