"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "@/lib/offline-db";
import type { TareaPendiente } from "@/types";

// Devuelve las tareas en cola de sync. `undefined` mientras carga; [] si no hay.
export function usePendingTareas(): TareaPendiente[] | undefined {
  return useLiveQuery(async () => {
    if (typeof window === "undefined") return [];
    return getDb().tareasPendientes.filter((t) => t.pendingSync === true).toArray();
  }, []);
}

export function usePendingCount(): number {
  const pending = usePendingTareas();
  return pending?.length ?? 0;
}
