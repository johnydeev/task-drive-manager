"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { syncPendingTareas, cleanupSyncedTareas } from "@/lib/offline-sync";

// Cliente-only. Se monta una vez en el shell y dispara sync:
// - al cargar la app
// - cada vez que vuelve `online`
// - cada 5 min como fallback (por si el evento `online` no dispara)
export function OfflineSyncProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();

  useEffect(() => {
    const runSync = async () => {
      const res = await syncPendingTareas();
      if (res.ok > 0) {
        // Invalidar caches para reflejar las tareas recién subidas.
        qc.invalidateQueries({ queryKey: ["tareas"] });
        qc.invalidateQueries({ queryKey: ["tareas-all"] });
      }
    };

    runSync();
    cleanupSyncedTareas();

    const onOnline = () => runSync();
    window.addEventListener("online", onOnline);

    // Cuando el SW termina un Background Sync, nos avisa y refrescamos caches.
    const onSwSynced = () => {
      qc.invalidateQueries({ queryKey: ["tareas"] });
      qc.invalidateQueries({ queryKey: ["tareas-all"] });
    };
    window.addEventListener("tareas-synced", onSwSynced);

    const interval = window.setInterval(runSync, 5 * 60 * 1000);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("tareas-synced", onSwSynced);
      window.clearInterval(interval);
    };
  }, [qc]);

  return <>{children}</>;
}
