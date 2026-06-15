// Banner amarillo que se muestra arriba de toda la app cuando DEMO_MODE=1.
// Avisa al usuario que está viendo datos fake.
//
// Para desactivarlo: borrar DEMO_MODE de .env.local (o ponerla =0) y reiniciar npm run dev.

import { AlertCircle } from "lucide-react";

export function DemoBanner() {
  return (
    <div className="sticky top-0 z-50 flex items-center justify-center gap-2 border-b border-amber-200 bg-amber-100 px-4 py-1.5 text-xs font-medium text-amber-900">
      <AlertCircle size={14} />
      <span>
        Modo demo activo · datos de ejemplo · borrar <code className="rounded bg-amber-200 px-1">DEMO_MODE</code> de <code className="rounded bg-amber-200 px-1">.env.local</code> para desactivar
      </span>
    </div>
  );
}
