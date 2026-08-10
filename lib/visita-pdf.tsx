import { renderToBuffer } from "@react-pdf/renderer";
import { VisitaPdf } from "@/components/pdf/VisitaPdf";
import { extractFileId } from "./google-drive";
import { uploadVisitaPdf, agruparVisitaEnCarpeta } from "./drive-visitas";
import { thumbUrl } from "./drive-url";
import { resolverLogoParaPdf } from "./membrete-logo";
import type { Configuracion, EdificioFicha } from "@/types";

interface Args {
  edificio: string;
  fecha: string; // ISO date
  ficha: EdificioFicha;
  controles: Record<string, string>;
  informeGeneral?: string;
  fotos: string[];
  supervisorNombre: string;
  firmaUrl?: string;
  config: Configuracion;
}

// Genera el PDF de la visita y lo sube a Drive. Devuelve la URL del archivo.
// Si algo de acá falla, el caller NO escribe la fila: nunca queda un link roto.
export async function generarYSubirVisitaPdf(args: Args): Promise<{ url: string; fileId: string }> {
  const config: Configuracion = {
    ...args.config,
    membreteLogoUrl: resolverLogoParaPdf(args.config.membreteLogoUrl),
  };
  const buffer = await renderToBuffer(
    <VisitaPdf
      edificio={args.edificio}
      fecha={args.fecha}
      ficha={args.ficha}
      controles={args.controles}
      informeGeneral={args.informeGeneral}
      // Los links de Drive apuntan a una página, no a la imagen: el <Image> del PDF
      // necesita el endpoint de thumbnail (mismo caso que el logo del membrete).
      fotos={args.fotos.map((u) => thumbUrl(u, 800))}
      supervisorNombre={args.supervisorNombre}
      firmaUrl={args.firmaUrl ? thumbUrl(args.firmaUrl, 400) : undefined}
      config={config}
    />
  );
  const subido = await uploadVisitaPdf({
    buffer,
    edificio: args.edificio,
    fechaISO: args.fecha,
  });

  // Con fotos, la visita se agrupa en una carpeta propia (mismo nombre que el PDF) para
  // no dejar imágenes sueltas mezcladas con los PDF del consorcio. Sin fotos el PDF queda
  // suelto: no vale un nivel de carpeta para un solo archivo.
  //
  // Si el agrupado falla, la visita NO se pierde: el PDF ya está subido y su link es
  // válido igual. Queda como antes —todo suelto— y se puede ordenar a mano.
  if (args.fotos.length > 0) {
    try {
      const fotosIds = args.fotos
        .map((u) => extractFileId(u))
        .filter((id): id is string => !!id);
      await agruparVisitaEnCarpeta({
        edificio: args.edificio,
        nombreCarpeta: subido.name.replace(/\.pdf$/i, ""),
        fileIds: [subido.fileId, ...fotosIds],
      });
    } catch (err) {
      console.error("No se pudo agrupar la visita en su carpeta de Drive:", err);
    }
  }

  return { url: subido.url, fileId: subido.fileId };
}
