import { Dashboard } from "@/components/dashboard/Dashboard";

export default function DashboardPage() {
  return (
    <div className="px-4 py-4 md:px-8 md:py-6 max-w-6xl mx-auto w-full">
      <h2 className="text-xl font-semibold text-slate-900">Dashboard</h2>
      <p className="mt-1 text-sm text-slate-600">
        Análisis de tareas por edificio, proveedor y evolución temporal. Los filtros se aplican a todas las visualizaciones.
      </p>
      <div className="mt-4">
        <Dashboard />
      </div>
    </div>
  );
}
