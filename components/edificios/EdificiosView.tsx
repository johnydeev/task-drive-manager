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

  const integrantes = useMemo(() => {
    const all = (usuariosQ.data ?? []).filter((u) => u.activo);
    if (isAdmin) return all;
    return all.filter((u) => u.email.toLowerCase() === myEmail);
  }, [usuariosQ.data, isAdmin, myEmail]);

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
