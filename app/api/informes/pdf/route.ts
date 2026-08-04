import { NextResponse } from "next/server";
import { withAuth } from "@/lib/http/withAuth";
import { getTareas, getConfiguracion } from "@/lib/google-sheets";
import { renderInformeEdificio } from "@/lib/informe-pdf";
import { nombreArchivoInforme } from "@/lib/informes";
import { jsonError } from "@/lib/api-utils";

export const runtime = "nodejs";
export const maxDuration = 60;

// Informe por edificio en PDF. Accesible a cualquier usuario logueado (admin y supervisor).
// Es efímero: se descarga y no se guarda en Drive ni en la planilla.
export const GET = withAuth(async (req) => {
  const sp = req.nextUrl.searchParams;
  const edificio = sp.get("edificio")?.trim();
  if (!edificio) return jsonError(400, "Falta el parámetro edificio");

  const desde = sp.get("desde")?.trim() || undefined;
  const hasta = sp.get("hasta")?.trim() || undefined;

  const [tareas, config] = await Promise.all([
    getTareas({ edificio, desde, hasta }),
    getConfiguracion(),
  ]);

  const buffer = await renderInformeEdificio({ edificio, desde, hasta, tareas, config });

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nombreArchivoInforme(edificio, desde, hasta)}"`,
    },
  });
});
