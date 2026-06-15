import { getActiveSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { UsuariosManager } from "@/components/usuarios/UsuariosManager";

export default async function UsuariosPage() {
  const session = await getActiveSession();
  if (session?.user?.rol !== "admin") redirect("/tareas");

  return (
    <div className="px-4 py-4 md:px-8 md:py-6 max-w-4xl mx-auto w-full">
      <h2 className="text-xl font-semibold text-slate-900">Usuarios</h2>
      <p className="mt-1 text-sm text-slate-600">
        Administra los supervisores y admins que pueden iniciar sesión.
      </p>
      <div className="mt-4">
        <UsuariosManager />
      </div>
    </div>
  );
}
