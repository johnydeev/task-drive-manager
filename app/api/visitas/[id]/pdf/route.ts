import { NextResponse } from "next/server";
import { withAuth } from "@/lib/http/withAuth";
import { getVisitaById } from "@/lib/google-sheets";
import { extractFileId } from "@/lib/google-drive";
import { descargarArchivo } from "@/lib/drive-visitas";
import { jsonError } from "@/lib/api-utils";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

// Sirve el PDF de una visita desde nuestro propio origen. Hace falta porque el navegador
// no puede hacer fetch a Drive (CORS), y sin el archivo en memoria no se puede adjuntar
// al menú de compartir del sistema.
//
// Toma el id de la VISITA, no un id de archivo: así solo se puede bajar el PDF de una
// visita registrada, y no cualquier archivo al que alcance la service account.
export const GET = withAuth<Ctx>(async (_req, _session, { params }) => {
  const { id } = await params;
  const visita = await getVisitaById(decodeURIComponent(id));
  if (!visita) return jsonError(404, "Visita no encontrada");

  const fileId = extractFileId(visita.pdfUrl);
  if (!fileId) return jsonError(404, "La visita no tiene un PDF asociado");

  const { buffer, nombre, mimeType } = await descargarArchivo(fileId);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": mimeType,
      // `inline`: el cliente decide si lo baja o lo comparte. El nombre se manda igual
      // para que la descarga conserve "VISITA - DD-MM-AAAA - Edificio.pdf".
      "Content-Disposition": `inline; filename="${nombre.replace(/"/g, "")}"`,
    },
  });
});
