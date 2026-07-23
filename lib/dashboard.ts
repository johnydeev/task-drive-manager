import type { EstadoTarea, Prioridad, Tarea } from "@/types";

export interface KpiSummary {
  total: number;
  porEstado: Record<EstadoTarea, number>;
  porPrioridad: Record<Prioridad, number>;
}

const ESTADOS: EstadoTarea[] = [
  "Sin asignar", "Asignada", "Aceptada", "En Proceso", "En Revisión", "Realizada",
];
const PRIORIDADES: Prioridad[] = ["Alta", "Media", "Baja"];

export function buildKpis(tareas: Tarea[]): KpiSummary {
  const porEstado: Record<EstadoTarea, number> = {
    "Sin asignar": 0, Asignada: 0, Aceptada: 0, "En Proceso": 0, "En Revisión": 0, Realizada: 0,
  };
  const porPrioridad: Record<Prioridad, number> = { Alta: 0, Media: 0, Baja: 0 };
  for (const t of tareas) {
    if (ESTADOS.includes(t.estado)) porEstado[t.estado]++;
    if (PRIORIDADES.includes(t.prioridad)) porPrioridad[t.prioridad]++;
  }
  return { total: tareas.length, porEstado, porPrioridad };
}

export interface EdificioStat {
  edificio: string;
  total: number;
  pendiente: number;
  enProceso: number;
  realizado: number;
}

export function groupByEdificio(tareas: Tarea[]): EdificioStat[] {
  const map = new Map<string, EdificioStat>();
  for (const t of tareas) {
    const e = t.edificio || "(sin edificio)";
    const entry = map.get(e) ?? {
      edificio: e,
      total: 0,
      pendiente: 0,
      enProceso: 0,
      realizado: 0,
    };
    entry.total++;
    if (t.estado === "Realizada") entry.realizado++;
    else if (t.estado === "En Proceso" || t.estado === "En Revisión") entry.enProceso++;
    else entry.pendiente++; // Sin asignar / Asignada / Aceptada
    map.set(e, entry);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

export interface ProveedorStat {
  proveedor: string;
  total: number;
  presupuestoTotal: number;
}

export function groupByProveedor(tareas: Tarea[]): ProveedorStat[] {
  const map = new Map<string, ProveedorStat>();
  for (const t of tareas) {
    const p = (t.proveedor || "").trim();
    if (!p) continue;
    const entry = map.get(p) ?? { proveedor: p, total: 0, presupuestoTotal: 0 };
    entry.total++;
    entry.presupuestoTotal += t.presupuesto ?? 0;
    map.set(p, entry);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

export interface MesStat {
  mes: string; // YYYY-MM
  abiertas: number; // creadas en ese mes
  cerradas: number; // realizadas en ese mes (por fechaRealizado)
}

function toMonth(iso?: string): string | null {
  if (!iso) return null;
  const m = iso.match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}` : null;
}

export function timelinePorMes(tareas: Tarea[]): MesStat[] {
  const map = new Map<string, MesStat>();
  const ensure = (mes: string) => {
    if (!map.has(mes)) map.set(mes, { mes, abiertas: 0, cerradas: 0 });
    return map.get(mes)!;
  };
  for (const t of tareas) {
    const abiertasMes = toMonth(t.fechaInicio) ?? toMonth(t.rowId);
    if (abiertasMes) ensure(abiertasMes).abiertas++;
    const cerradasMes = t.estado === "Realizada" ? toMonth(t.fechaRealizado) : null;
    if (cerradasMes) ensure(cerradasMes).cerradas++;
  }
  return [...map.values()].sort((a, b) => a.mes.localeCompare(b.mes));
}

// =====================================================
// CSV export
// =====================================================

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function tareasToCsv(tareas: Tarea[]): string {
  const headers = [
    "rowId",
    "objetivo",
    "fechaInicio",
    "fechaEstimada",
    "edificio",
    "parteComun",
    "dpto",
    "informe",
    "comentarioEnProceso",
    "comentarioRealizado",
    "proveedor",
    "estado",
    "presupuesto",
    "fechaRealizado",
    "prioridad",
    "supervisor",
    "imagenes",
    "videos",
  ];
  const lines = [headers.join(",")];
  for (const t of tareas) {
    lines.push(
      [
        t.rowId,
        t.objetivo,
        t.fechaInicio,
        t.fechaEstimada,
        t.edificio,
        t.parteComun ? "TRUE" : "FALSE",
        t.dpto,
        t.informe,
        t.comentarioEnProceso ?? "",
        t.comentarioRealizado ?? "",
        t.proveedor ?? "",
        t.estado,
        t.presupuesto ?? "",
        t.fechaRealizado ?? "",
        t.prioridad,
        t.supervisor,
        t.imagenes.join(" | "),
        t.videos.join(" | "),
      ]
        .map(csvEscape)
        .join(",")
    );
  }
  return lines.join("\n");
}

export function downloadCsv(filename: string, csv: string): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
