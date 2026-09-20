"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

export type SoportePush = "ok" | "sin-soporte" | "ios-sin-instalar";
export type PermisoPush = NotificationPermission | "no-disponible";

export interface EstadoAvisos {
  soporte: SoportePush;
  permiso: PermisoPush;
  suscripto: boolean;
  ocupado: boolean;
  error: string | null;
  claveConfigurada: boolean;
}

// La clave VAPID pública viene en base64url; PushManager la quiere como bytes.
function base64UrlAUint8(b64: string): Uint8Array {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const s = (b64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(s);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function detectarSoporte(): SoportePush {
  if (typeof window === "undefined") return "sin-soporte";
  const esIOS = /iP(hone|ad|od)/.test(navigator.userAgent);
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as { standalone?: boolean }).standalone === true;
  if (esIOS && !standalone) return "ios-sin-instalar";
  const tieneApis =
    typeof Notification !== "undefined" &&
    typeof PushManager !== "undefined" &&
    typeof navigator.serviceWorker !== "undefined";
  return tieneApis ? "ok" : "sin-soporte";
}

async function suscripcionActual(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

// true si la suscripción fue creada con OTRA clave VAPID (claves regeneradas): el server no
// podría firmar para ella y los pushes fallarían con 400/403 sin que nadie se entere.
function claveDistinta(sub: PushSubscription, claveActual: Uint8Array): boolean {
  const usada = sub.options?.applicationServerKey;
  if (!usada) return false;
  const bytes = new Uint8Array(usada);
  if (bytes.length !== claveActual.length) return true;
  return bytes.some((b, i) => b !== claveActual[i]);
}

async function guardarEnServer(sub: PushSubscription) {
  const body = { ...sub.toJSON(), userAgent: navigator.userAgent.slice(0, 120) };
  const res = await apiFetch("/api/push/suscribir", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("No se pudo guardar la suscripción");
}

// Estado y acciones de las notificaciones push de ESTE dispositivo. El permiso se pide solo
// desde activar() (a pedido del usuario). Al montar, si ya está suscripto, re-sincroniza con
// el server (la hoja pudo vaciarse o cambió la cuenta en este navegador; el server no
// escribe si nada cambió).
export function useAvisosPush(): EstadoAvisos & {
  activar: () => Promise<void>;
  desactivar: () => Promise<void>;
} {
  const [soporte, setSoporte] = useState<SoportePush>("sin-soporte");
  const [permiso, setPermiso] = useState<PermisoPush>("no-disponible");
  const [suscripto, setSuscripto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Next inlina NEXT_PUBLIC_* en el build; leerla acá (y no a nivel módulo) permite testearla.
  const clavePublica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

  useEffect(() => {
    let vivo = true;
    // Todo dentro de una promesa: el estado inicial depende del navegador (post-hidratación)
    // y de una consulta async al SW.
    Promise.resolve().then(async () => {
      const s = detectarSoporte();
      if (!vivo) return;
      setSoporte(s);
      if (s !== "ok") return;
      setPermiso(Notification.permission);
      try {
        const sub = await suscripcionActual();
        if (!vivo) return;
        setSuscripto(!!sub);
        if (sub && Notification.permission === "granted") await guardarEnServer(sub).catch(() => {});
      } catch {
        /* sin SW listo: queda como no suscripto */
      }
    });
    return () => {
      vivo = false;
    };
  }, []);

  const activar = useCallback(async () => {
    setOcupado(true);
    setError(null);
    try {
      const p = await Notification.requestPermission();
      setPermiso(p);
      if (p !== "granted") return;
      const reg = await navigator.serviceWorker.ready;
      const clave = base64UrlAUint8(clavePublica);
      let sub = await reg.pushManager.getSubscription();
      if (sub && claveDistinta(sub, clave)) {
        await sub.unsubscribe();
        sub = null;
      }
      sub ??= await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: clave as BufferSource,
      });
      await guardarEnServer(sub);
      setSuscripto(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron activar los avisos");
    } finally {
      setOcupado(false);
    }
  }, [clavePublica]);

  const desactivar = useCallback(async () => {
    setOcupado(true);
    setError(null);
    try {
      const sub = await suscripcionActual();
      if (sub) {
        await apiFetch(`/api/push/suscribir?endpoint=${encodeURIComponent(sub.endpoint)}`, {
          method: "DELETE",
        });
        await sub.unsubscribe();
      }
      setSuscripto(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron desactivar los avisos");
    } finally {
      setOcupado(false);
    }
  }, []);

  return {
    soporte,
    permiso,
    suscripto,
    ocupado,
    error,
    claveConfigurada: !!clavePublica,
    activar,
    desactivar,
  };
}
