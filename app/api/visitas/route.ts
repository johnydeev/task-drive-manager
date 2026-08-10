import { NextResponse } from "next/server";
import { withAuth } from "@/lib/http/withAuth";
import {
  getVisitas,
  appendVisita,
  getEdificioFicha,
  guardarEdificioFicha,
  getConfiguracion,
  getUsuarios,
} from "@/lib/google-sheets";
import { generarYSubirVisitaPdf } from "@/lib/visita-pdf";
import { visitaNuevaSchema } from "@/lib/schemas";
import { displayName } from "@/lib/user-display";
import { nowBuenosAiresISO } from "@/lib/fecha-ar";

export const runtime = "nodejs";
// Generar el PDF con fotos puede tardar: mismo margen que el reporte de tarea.
export const maxDuration = 60;

export const GET = withAuth(async (req) => {
  const edificio = req.nextUrl.searchParams.get("edificio")?.trim() || undefined;
  return NextResponse.json(await getVisitas(edificio));
});

// Crear una visita: se genera el PDF y se sube a Drive; SOLO SI eso funcionó se escribe
// la fila y se actualiza la ficha. Así el historial nunca apunta a un archivo inexistente.
export const POST = withAuth(async (req, session) => {
  const body = await req.json();
  const input = visitaNuevaSchema.parse(body);

  const fecha = nowBuenosAiresISO().slice(0, 10);
  const [fichaPrevia, config, usuarios] = await Promise.all([
    getEdificioFicha(input.edificio),
    getConfiguracion(),
    getUsuarios(),
  ]);

  // La ficha del PDF es la previa pisada con lo que se cargó en el formulario.
  const ficha = { ...fichaPrevia, ...input.ficha, edificio: input.edificio };
  const email = session.user.email.toLowerCase();
  const usuario = usuarios.find((u) => u.email === email);

  const { url } = await generarYSubirVisitaPdf({
    edificio: input.edificio,
    fecha,
    ficha,
    controles: input.controles,
    informeGeneral: input.informeGeneral,
    fotos: input.fotos,
    supervisorNombre: displayName(session.user.email, usuarios),
    firmaUrl: usuario?.firmaUrl,
    config,
  });

  const visita = await appendVisita({
    edificio: input.edificio,
    pdfUrl: url,
    supervisor: session.user.email,
  });
  await guardarEdificioFicha(input.edificio, input.ficha);

  return NextResponse.json(visita, { status: 201 });
});
