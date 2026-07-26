"use client";

import { useEffect, useState } from "react";

// El evento `beforeinstallprompt` no está tipado en la lib estándar de TS.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

// La app ya corre instalada (standalone) → no ofrecer instalar.
function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

// Captura el evento `beforeinstallprompt` (Chromium) y expone si la app es instalable
// y una función para disparar el prompt nativo. `canInstall` es false en iOS/Safari,
// si la app ya está instalada, o después de instalarla (el evento sirve una sola vez).
export function useInstallPrompt(): {
  canInstall: boolean;
  promptInstall: () => Promise<void>;
} {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (isStandalone()) {
      setInstalled(true);
      return;
    }
    const onPrompt = (e: Event) => {
      e.preventDefault(); // Evita el mini-cartel automático del navegador.
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const promptInstall = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null); // Un beforeinstallprompt sirve una sola vez.
  };

  return { canInstall: !installed && deferred !== null, promptInstall };
}
