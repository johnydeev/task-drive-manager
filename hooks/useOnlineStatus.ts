"use client";

import { useEffect, useState } from "react";

// Devuelve `true` si el navegador reporta conexión.
// SSR-safe: el primer render (server y cliente) SIEMPRE asume online=true para que
// el HTML del server coincida con el primer render del cliente. El estado real se lee
// recién tras montar (useEffect), evitando cualquier mismatch de hidratación.
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(true);

  useEffect(() => {
    // Valor real una vez en el cliente.
    setOnline(navigator.onLine);
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  return online;
}
