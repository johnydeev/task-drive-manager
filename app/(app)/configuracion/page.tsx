import { getActiveSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ConfiguracionForm } from "@/components/configuracion/ConfiguracionForm";

export default async function ConfiguracionPage() {
  const session = await getActiveSession();
  if (session?.user?.rol !== "admin") redirect("/tareas");

  return (
    <div className="px-4 py-4 md:px-8 md:py-6 max-w-2xl mx-auto w-full">
      <h2 className="text-xl font-semibold text-slate-900">Configuración</h2>
      <p className="mt-1 text-sm text-slate-600">
        Ajustes que se sincronizan con la hoja <code className="rounded bg-slate-100 px-1 py-0.5">Configuración</code>.
      </p>
      <div className="mt-4">
        <ConfiguracionForm />
      </div>
    </div>
  );
}
