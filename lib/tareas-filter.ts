import type { EstadoTarea, Prioridad, Tarea } from "@/types";

// Filtros de tareas. Todos opcionales: un campo vacío/undefined no filtra.
export interface TareaFilters {
  edificio?: string;
  estado?: EstadoTarea;
  prioridad?: Prioridad;
  supervisor?: string;
  asignado?: string; // email del responsable de ejecución
  sinAsignar?: boolean; // solo tareas sin responsable
  desde?: string; // ISO date, compara contra fechaInicio
  hasta?: string; // ISO date, compara contra fechaInicio
}

// Filtra una lista de tareas por los criterios dados. Función pura, compartida entre
// el filtrado del servidor (getTareas) y el del dashboard en el cliente.
export function filterTareas(tareas: Tarea[], filters: TareaFilters): Tarea[] {
  return tareas.filter((t) => {
    if (filters.edificio && t.edificio !== filters.edificio) return false;
    if (filters.estado && t.estado !== filters.estado) return false;
    if (filters.prioridad && t.prioridad !== filters.prioridad) return false;
    if (filters.supervisor && t.supervisor !== filters.supervisor) return false;
    if (filters.asignado && (t.asignadoA ?? "").toLowerCase() !== filters.asignado.toLowerCase()) return false;
    if (filters.sinAsignar && (t.asignadoA ?? "").trim() !== "") return false;
    if (filters.desde && t.fechaInicio < filters.desde) return false;
    if (filters.hasta && t.fechaInicio > filters.hasta) return false;
    return true;
  });
}
