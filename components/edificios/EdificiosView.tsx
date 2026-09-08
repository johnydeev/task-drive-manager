"use client";

import { useSession } from "next-auth/react";
import { useMemo } from "react";
import {
  useUsuarios,
  useAsignaciones,
  useDirectivas,
  useEdificiosSinAsignar,
  useTareas,
} from "@/hooks/edificios-queries";
import { contarPendientesPorEdificio } from "@/lib/pendientes-por-edificio";
import { IntegranteCard } from "./IntegranteCard";
import { TareasAsignadasCard } from "./TareasAsignadasCard";

export function EdificiosView() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.rol === "admin";
  const myEmail = session?.user?.email?.toLowerCase() ?? "";

  const usuariosQ = useUsuarios();
  const asignacionesQ = useAsignaciones();
  const directivasQ = useDirectivas();
  const sinAsignarQ = useEdificiosSinAsignar(isAdmin);
  const sinAsignar = sinAsignarQ.data ?? [];
  const tareasQ = useTareas();

  // Todos los integrantes activos, para cualquier rol: el supervisor ve la misma pantalla
  // que el admin, en lectura. La tarjeta propia va primera y el resto alfabético.
  const integrantes = useMemo(() => {
    const activos = (usuariosQ.data ?? []).filter((u) => u.activo);
    return [...activos].sort((a, b) => {
      const propioA = a.email.toLowerCase() === myEmail;
      const propioB = b.email.toLowerCase() === myEmail;
      if (propioA !== propioB) return propioA ? -1 : 1;
      return (a.nombre || a.email).localeCompare(b.nombre || b.email, "es");
    });
  }, [usuariosQ.data, myEmail]);

  // Tareas abiertas por consorcio. Se calcula una sola vez sobre las tareas que la vista
  // ya tenía cargadas: no hay fetch nuevo.
  const pendientes = useMemo(
    () => contarPendientesPorEdificio(tareasQ.data ?? []),
    [tareasQ.data]
  );

  return (
    <div className="px-4 py-4 md:px-8 md:py-6 max-w-5xl mx-auto w-full">
      <h2 className="text-xl font-semibold text-slate-900">Edificios</h2>
      <p className="text-sm text-slate-600">Edificios y directivas por integrante</p>

      {isAdmin && sinAsignar.length > 0 && (
        <div
          role="alert"
          className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
        >
          Quedan {sinAsignar.length} edificios por asignar
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        {integrantes.map((u) => (
          <div key={u.email} className="space-y-4">
            <IntegranteCard
              usuario={u}
              usuarios={usuariosQ.data}
              asignaciones={(asignacionesQ.data ?? []).filter(
                (a) => a.email.toLowerCase() === u.email.toLowerCase()
              )}
              directivas={(directivasQ.data ?? []).filter(
                (d) => d.asignadoA.toLowerCase() === u.email.toLowerCase()
              )}
              readOnly={!isAdmin}
              currentEmail={myEmail}
              isAdmin={isAdmin}
              mostrarDirectivas={isAdmin || u.email.toLowerCase() === myEmail}
              pendientes={pendientes}
            />
            <TareasAsignadasCard
              tareas={(tareasQ.data ?? []).filter(
                (t) => (t.asignadoA ?? "").toLowerCase() === u.email.toLowerCase()
              )}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
