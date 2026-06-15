"use client";

import { useEffect, useState } from "react";
import { CloudOff, RefreshCw, Wifi } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { usePendingCount } from "@/hooks/usePendingTareas";
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
}

export function OfflineBadge({ className }: Props) {
  // Mount guard: el server render siempre devuelve null para evitar hydration mismatch.
  // El estado de red y la cola de pendientes solo existen del lado cliente.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const online = useOnlineStatus();
  const pending = usePendingCount();

  if (!mounted) return null;
  if (online && pending === 0) return null;

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        online
          ? "border-amber-200 bg-amber-50 text-amber-800"
          : "border-slate-300 bg-slate-100 text-slate-700",
        className
      )}
      title={
        online
          ? `${pending} tarea${pending !== 1 ? "s" : ""} pendiente${pending !== 1 ? "s" : ""} de sincronizar`
          : "Sin conexión — los cambios se guardarán localmente"
      }
    >
      {online ? (
        pending > 0 ? <RefreshCw size={12} className="animate-spin" /> : <Wifi size={12} />
      ) : (
        <CloudOff size={12} />
      )}
      <span>
        {!online && "Sin conexión"}
        {online && pending > 0 && `${pending} pendiente${pending !== 1 ? "s" : ""}`}
      </span>
    </div>
  );
}
