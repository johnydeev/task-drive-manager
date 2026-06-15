// Registra un Background Sync tag con el Service Worker.
// Solo Chrome/Edge/Android lo implementan; en Safari/iOS es un no-op silencioso.
//
// Cuando el navegador detecta que hay conexión (puede ser horas después,
// incluso con la app cerrada), despierta al SW y dispara el evento `sync` con este tag.

// Tipo del SyncManager — Safari/iOS no lo implementa, así que es opcional en runtime.
interface SyncManagerLike {
  register(tag: string): Promise<void>;
}

export async function registerBackgroundSync(tag = "sync-tareas"): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!("serviceWorker" in navigator)) return false;

  try {
    const reg = await navigator.serviceWorker.ready;
    const sync = (reg as ServiceWorkerRegistration & { sync?: SyncManagerLike }).sync;
    if (!sync) {
      // Safari/iOS: no soportado. Fallback se hace al volver online con el OfflineSyncProvider.
      return false;
    }
    await sync.register(tag);
    return true;
  } catch (err) {
    console.warn("[background-sync] no se pudo registrar el tag", err);
    return false;
  }
}
