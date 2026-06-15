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
