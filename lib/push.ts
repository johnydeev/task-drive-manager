import webpush from "web-push";
import { isDemoMode } from "./demo-mode";
import { deleteSuscripcion, getSuscripciones } from "./sheets/suscripciones";
import type { Aviso } from "@/types";

let configurado: boolean | null = null;

// true si hay claves VAPID. Sin ellas el push queda deshabilitado (log) y nada explota.
function asegurarVapid(): boolean {
  if (configurado !== null) return configurado;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!pub || !priv || !subject) {
    console.warn(
      "[push] deshabilitado: faltan VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT"
    );
    configurado = false;
    return false;
  }
  webpush.setVapidDetails(subject, pub, priv);
  configurado = true;
  return true;
}

// Solo para tests.
export function _resetPush() {
  configurado = null;
}

export interface ResultadoPush {
  enviados: number;
  borradas: number;
}

// Manda el aviso a todas las suscripciones de esos emails. Nunca lanza: un push fallido no
// rompe la acción que lo disparó. Suscripciones muertas (410/404) se borran.
export async function notificar(emails: string[], aviso: Aviso): Promise<ResultadoPush> {
  const nada: ResultadoPush = { enviados: 0, borradas: 0 };
  const destinatarios = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (destinatarios.length === 0 || isDemoMode() || !asegurarVapid()) return nada;
  try {
    const subs = await getSuscripciones(destinatarios);
    const payload = JSON.stringify(aviso);
    const r = { ...nada };
    for (const s of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: 24 * 3600 }
        );
        r.enviados++;
      } catch (err) {
        const status = (err as { statusCode?: number } | null)?.statusCode;
        if (status === 410 || status === 404) {
          await deleteSuscripcion(s.endpoint).catch(() => {});
          r.borradas++;
        } else {
          console.error("[push] error enviando a", s.email, err);
        }
      }
    }
    return r;
  } catch (err) {
    console.error("[push] error:", err);
    return nada;
  }
}
