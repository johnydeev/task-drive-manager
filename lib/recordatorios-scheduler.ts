import { getTareas } from "./sheets/tareas";
import { getUsuarios } from "./sheets/usuarios";
import { getConfigValor, setConfigValor } from "./sheets/config";
import { avisarLote, RETENCION_AVISOS_MS } from "./avisos";
import { purgarAvisos } from "./sheets/avisos";
import type { TipoAviso } from "@/types";
import { armarRecordatorios } from "./recordatorios";
import { toBuenosAiresISO } from "./fecha-ar";
import { isDemoMode } from "./demo-mode";

export const CLAVE_ULTIMO_ENVIO = "recordatorios_ultimo_envio";
const HORA_ENVIO_ART = 8;
const TICK_MS = 15 * 60 * 1000;

// Fecha/hora de pared en Buenos Aires (UTC-3 fija, como lib/fecha-ar).
function ahoraART(now: number): { fecha: string; hora: number; domingo: boolean } {
  const iso = toBuenosAiresISO(new Date(now)); // YYYY-MM-DDTHH:mm:ss.sss-03:00
  return {
    fecha: iso.slice(0, 10),
    hora: Number(iso.slice(11, 13)),
    domingo: new Date(now - 3 * 3600 * 1000).getUTCDay() === 0,
  };
}

// Manda los recordatorios del día si es lunes–sábado, ya son las 08:00 ART y no se mandaron
// hoy. La marca del día se guarda al FINAL: si el envío explota a mitad, el próximo tick reintenta.
export async function correrRecordatoriosSiCorresponde(
  now = Date.now()
): Promise<"enviado" | "omitido"> {
  const { fecha, hora, domingo } = ahoraART(now);
  if (domingo || hora < HORA_ENVIO_ART) return "omitido";
  if ((await getConfigValor(CLAVE_ULTIMO_ENVIO)) === fecha) return "omitido";
  const [tareas, usuarios] = await Promise.all([getTareas(), getUsuarios()]);
  const recordatorios = armarRecordatorios(tareas, usuarios, now);
  await avisarLote(
    recordatorios.map((r) => ({ email: r.email, aviso: r.aviso, tipo: r.aviso.tag as TipoAviso }))
  );
  await setConfigValor(CLAVE_ULTIMO_ENVIO, fecha);
  console.log(`[recordatorios] ${fecha}: ${recordatorios.length} aviso(s)`);
  // Purga de avisos viejos: después de la marca y aparte, para que un fallo acá no re-mande
  // los pushes en el próximo tick.
  try {
    const n = await purgarAvisos(now - RETENCION_AVISOS_MS);
    if (n > 0) console.log(`[avisos] purga: ${n} fila(s)`);
  } catch (err) {
    console.error("[avisos] error purgando:", err);
  }
  return "enviado";
}

declare global {
  var __recordatoriosIniciado: boolean | undefined;
}

// Arranca el tick. Solo en producción (o RECORDATORIOS_ENABLED=1): en dev el .env.local tiene
// credenciales reales y un `next dev` abierto a las 08:00 mandaría pushes de verdad.
export function iniciarSchedulerRecordatorios(): boolean {
  const habilitado =
    process.env.NODE_ENV === "production" || process.env.RECORDATORIOS_ENABLED === "1";
  if (!habilitado || isDemoMode() || globalThis.__recordatoriosIniciado) return false;
  globalThis.__recordatoriosIniciado = true;
  const correr = () =>
    correrRecordatoriosSiCorresponde().catch((err) =>
      console.error("[recordatorios] error:", err)
    );
  setTimeout(correr, 60 * 1000); // por si el contenedor arrancó después de las 08:00
  setInterval(correr, TICK_MS);
  return true;
}

// Solo para tests.
export function _resetScheduler() {
  globalThis.__recordatoriosIniciado = undefined;
}
