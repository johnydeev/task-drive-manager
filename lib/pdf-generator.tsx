import { renderToBuffer } from "@react-pdf/renderer";
import { TareaReportePdf } from "@/components/pdf/TareaReportePdf";
import { uploadTareaFile, trashReportesDeTarea } from "./google-drive";
import { getUsuarios } from "./google-sheets";
import { displayName } from "./user-display";
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

  // Solo la fecha (sin hora) en el pie del reporte.
  const generatedAt = new Date().toLocaleDateString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
  });

  // Mostrar el nombre registrado del supervisor en vez del email (fallback: email).
  const usuarios = await getUsuarios();
  const supervisorNombre = displayName(tarea.supervisor, usuarios);

  const buffer = await renderToBuffer(
    <TareaReportePdf tarea={tarea} generatedAt={generatedAt} supervisorNombre={supervisorNombre} />
  );

  // Reporte único (Opción B): mandar a papelera los reportes anteriores antes de subir
  // el nuevo, así queda un solo PDF (el nuevo se numera reporte-01).
  await trashReportesDeTarea({
    edificio: tarea.edificio,
    objetivo: tarea.objetivo,
    ubicacion: tarea.dpto,
    rowId: tarea.rowId,
  });

  // Va a la subcarpeta "Reporte" de la misma carpeta de la tarea (derivada del rowId).
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
