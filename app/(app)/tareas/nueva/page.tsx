import { TareaForm } from "@/components/tareas/TareaForm";

export default function NuevaTareaPage() {
  return (
    <div className="px-4 py-4 md:px-8 md:py-6 max-w-3xl mx-auto w-full">
      <h2 className="text-xl font-semibold text-slate-900">Nueva tarea</h2>
      <p className="mt-1 text-sm text-slate-600">
        Completá los datos. Los archivos se suben a Drive automáticamente al seleccionarlos.
      </p>
      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 md:p-6">
        <TareaForm mode="create" />
      </div>
    </div>
  );
}
