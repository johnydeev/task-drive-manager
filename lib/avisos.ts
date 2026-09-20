import type { Aviso, TipoAviso } from "@/types";
import { isDemoMode } from "./demo-mode";
import { notificar } from "./push";
import { appendAvisos, reemplazarRecordatorios, type AvisoNuevo } from "./sheets/avisos";

// Cuánto vive un aviso en la hoja (y en la campana). La purga corre en el scheduler diario.
export const RETENCION_AVISOS_MS = 30 * 24 * 3600 * 1000;

export interface ItemAviso {
  email: string;
  aviso: Aviso;
  tipo: TipoAviso;
}

const esRecordatorio = (t: TipoAviso) => t.startsWith("recordatorio-");
const normalizar = (emails: string[]) =>
  [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];

// Guarda el aviso en la hoja Avisos (una fila por destinatario) y después manda el push.
// Nunca lanza: si guardar falla, el push sale igual; sin claves VAPID, igual se guarda.
export async function avisar(emails: string[], aviso: Aviso, tipo: TipoAviso): Promise<void> {
  const destinatarios = normalizar(emails);
  if (destinatarios.length === 0 || isDemoMode()) return;
  await guardar(destinatarios.map((email) => ({ email, aviso, tipo })));
  await notificar(destinatarios, aviso).catch(() => {});
}

// Varios avisos distintos (los recordatorios del día): una escritura por grupo, un push por ítem.
export async function avisarLote(items: ItemAviso[]): Promise<void> {
  const limpios = items
    .map((i) => ({ ...i, email: i.email.trim().toLowerCase() }))
    .filter((i) => i.email);
  if (limpios.length === 0 || isDemoMode()) return;
  await guardar(limpios);
  for (const i of limpios) await notificar([i.email], i.aviso).catch(() => {});
}

async function guardar(items: ItemAviso[]): Promise<void> {
  const aFila = (i: ItemAviso): AvisoNuevo => ({
    email: i.email,
    titulo: i.aviso.titulo,
    cuerpo: i.aviso.cuerpo,
    url: i.aviso.url,
    tipo: i.tipo,
  });
  const recordatorios = items.filter((i) => esRecordatorio(i.tipo)).map(aFila);
  const inmediatos = items.filter((i) => !esRecordatorio(i.tipo)).map(aFila);
  try {
    if (recordatorios.length > 0) await reemplazarRecordatorios(recordatorios);
    if (inmediatos.length > 0) await appendAvisos(inmediatos);
  } catch (err) {
    console.error("[avisos] error guardando:", err);
  }
}
