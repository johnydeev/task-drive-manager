"use client";

import { useEffect } from "react";

// Detecta cuándo hay una nueva versión del Service Worker esperando para activarse
// y emite un CustomEvent('sw-update-available') que el banner escucha.
//
// Nota: @serwist/next ya registra el SW automáticamente (register: true por defecto).
// Este componente solo agrega los listeners para el flujo de update controlado.
export function RegisterPWA() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    // En desarrollo el SW está deshabilitado (next.config: disable en dev), pero un SW
    // registrado en una sesión anterior puede seguir sirviendo HTML/JS viejos desde caché
    // (cacheOnNavigation), causando mismatches de hidratación y UI vieja. Lo desregistramos
    // y limpiamos las caches; si había uno controlando, recargamos una vez para traer HTML fresco.
    if (process.env.NODE_ENV === "development") {
      (async () => {
        const regs = await navigator.serviceWorker.getRegistrations();
        let had = false;
        for (const r of regs) {
          had = true;
          await r.unregister();
        }
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
        if (had && navigator.serviceWorker.controller && !sessionStorage.getItem("sw-dev-cleared")) {
          sessionStorage.setItem("sw-dev-cleared", "1");
          window.location.reload();
        }
      })().catch(() => {});
      return;
    }

    const onUpdateFound = (reg: ServiceWorkerRegistration) => {
      const newWorker = reg.installing;
      if (!newWorker) return;
      newWorker.addEventListener("statechange", () => {
        if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
          // Hay un SW viejo activo y uno nuevo esperando → notificar.
          window.dispatchEvent(new CustomEvent("sw-update-available"));
        }
      });
    };

    let cleanup: (() => void) | undefined;

    navigator.serviceWorker.ready.then((reg) => {
      // Si ya hay un waiting al cargar la página, notificar inmediatamente.
      if (reg.waiting && navigator.serviceWorker.controller) {
        window.dispatchEvent(new CustomEvent("sw-update-available"));
      }
      const handler = () => onUpdateFound(reg);
      reg.addEventListener("updatefound", handler);
      cleanup = () => reg.removeEventListener("updatefound", handler);
    }).catch(() => {});

    // Forzar recarga cuando el SW nuevo toma control (post skipWaiting).
    let refreshing = false;
    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    // Listener de mensajes desde el SW (ej: 'TAREAS_SYNCED' tras background sync).
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "TAREAS_SYNCED") {
        window.dispatchEvent(new CustomEvent("tareas-synced"));
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);

    return () => {
      cleanup?.();
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      navigator.serviceWorker.removeEventListener("message", onMessage);
    };
  }, []);

  return null;
}
