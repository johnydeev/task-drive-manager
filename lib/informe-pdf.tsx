import { renderToBuffer } from "@react-pdf/renderer";
import { InformeEdificioPdf } from "@/components/pdf/InformeEdificioPdf";
import { agruparParaInforme } from "./informes";
import { resolverLogoParaPdf } from "./membrete-logo";
import type { Configuracion, Tarea } from "@/types";

interface Args {
  edificio: string;
  desde?: string;
  hasta?: string;
  tareas: Tarea[];
  config: Configuracion;
}

// Aísla el render del route handler: el endpoint se testea mockeando este módulo, sin
// levantar @react-pdf/renderer. Espejo de lib/pdf-generator.tsx (que además sube a Drive);
// acá el PDF es efímero y se devuelve como descarga.
export async function renderInformeEdificio({
  edificio,
  desde,
  hasta,
  tareas,
  config,
}: Args): Promise<Buffer> {
  const generatedAt = new Date().toLocaleDateString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
  });
  // El logo puede venir como URL pública o como ruta del propio sitio (public/): en el
  // segundo caso hay que darle a react-pdf el archivo en disco, no la ruta web.
  const configPdf: Configuracion = {
    ...config,
    membreteLogoUrl: resolverLogoParaPdf(config.membreteLogoUrl),
  };
  return renderToBuffer(
    <InformeEdificioPdf
      edificio={edificio}
      desde={desde}
      hasta={hasta}
      grupos={agruparParaInforme(tareas)}
      config={configPdf}
      generatedAt={generatedAt}
    />
  );
}
