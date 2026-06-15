"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  buildKpis,
  downloadCsv,
  groupByEdificio,
  groupByProveedor,
  tareasToCsv,
  timelinePorMes,
} from "@/lib/dashboard";
import { api } from "@/lib/api-client";
import type { EstadoTarea, Prioridad, Tarea, Edificio } from "@/types";
import { cn, formatFecha } from "@/lib/utils";
import { Download, Loader2 } from "lucide-react";

const ESTADO_COLORS: Record<EstadoTarea, string> = {
  Pendiente: "#f59e0b",
  "En Proceso": "#3b82f6",
  Realizado: "#10b981",
};

const PRIORIDAD_COLORS: Record<Prioridad, string> = {
  Alta: "#ef4444",
  Media: "#f59e0b",
  Baja: "#94a3b8",
};

const ESTADOS: (EstadoTarea | "Todos")[] = ["Todos", "Pendiente", "En Proceso", "Realizado"];
const PRIORIDADES: (Prioridad | "Todas")[] = ["Todas", "Alta", "Media", "Baja"];

export function Dashboard() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.rol === "admin";

  const [edificio, setEdificio] = useState("");
  const [estado, setEstado] = useState<EstadoTarea | "Todos">("Todos");
  const [prioridad, setPrioridad] = useState<Prioridad | "Todas">("Todas");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const tareasQ = useQuery({
    queryKey: ["tareas-all"],
    queryFn: () => api.tareas.list({}),
  });
  const edificiosQ = useQuery({ queryKey: ["edificios"], queryFn: api.edificios.list });

  const tareasFiltradas = useMemo(() => {
    const all = tareasQ.data ?? [];
    return all.filter((t) => {
      if (edificio && t.edificio !== edificio) return false;
      if (estado !== "Todos" && t.estado !== estado) return false;
      if (prioridad !== "Todas" && t.prioridad !== prioridad) return false;
      if (desde && t.fechaInicio < desde) return false;
      if (hasta && t.fechaInicio > hasta) return false;
      return true;
    });
  }, [tareasQ.data, edificio, estado, prioridad, desde, hasta]);

  const kpis = useMemo(() => buildKpis(tareasFiltradas), [tareasFiltradas]);
  const porEdificio = useMemo(() => groupByEdificio(tareasFiltradas), [tareasFiltradas]);
  const porProveedor = useMemo(() => groupByProveedor(tareasFiltradas).slice(0, 8), [tareasFiltradas]);
  const timeline = useMemo(() => timelinePorMes(tareasFiltradas), [tareasFiltradas]);

  if (tareasQ.isLoading) {
    return (
      <div className="px-4 py-10 text-center text-slate-500">
        <Loader2 className="mx-auto animate-spin" />
        <p className="mt-2 text-sm">Cargando dashboard…</p>
      </div>
    );
  }

  if (tareasQ.isError) {
    return (
      <div className="px-4 py-10 text-center text-slate-600">
        No se pudieron cargar las tareas.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-5">
        <FiltroSelect label="Edificio" value={edificio} onChange={setEdificio}>
          <option value="">Todos</option>
          {edificiosQ.data?.map((e: Edificio) => (
            <option key={e.nombre} value={e.nombre}>{e.nombre}</option>
          ))}
        </FiltroSelect>
        <FiltroSelect label="Estado" value={estado} onChange={(v) => setEstado(v as EstadoTarea | "Todos")}>
          {ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
        </FiltroSelect>
        <FiltroSelect label="Prioridad" value={prioridad} onChange={(v) => setPrioridad(v as Prioridad | "Todas")}>
          {PRIORIDADES.map((p) => <option key={p} value={p}>{p}</option>)}
        </FiltroSelect>
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">Desde</span>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="input" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">Hasta</span>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="input" />
        </label>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Total" value={kpis.total} accent="bg-slate-900" />
        <Kpi label="Pendientes" value={kpis.porEstado.Pendiente} accent="bg-amber-500" />
        <Kpi label="En proceso" value={kpis.porEstado["En Proceso"]} accent="bg-blue-500" />
        <Kpi label="Realizadas" value={kpis.porEstado.Realizado} accent="bg-emerald-500" />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Kpi label="Prioridad alta" value={kpis.porPrioridad.Alta} accent="bg-red-500" />
        <Kpi label="Media" value={kpis.porPrioridad.Media} accent="bg-amber-500" />
        <Kpi label="Baja" value={kpis.porPrioridad.Baja} accent="bg-slate-400" />
      </div>

      {/* Tareas por edificio */}
      <Card title="Tareas por edificio" subtitle="Distribución por estado">
        {porEdificio.length === 0 ? (
          <Empty />
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={porEdificio.slice(0, 12)} margin={{ left: 8, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="edificio" angle={-25} textAnchor="end" height={70} tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="pendiente" stackId="a" fill={ESTADO_COLORS.Pendiente} name="Pendiente" />
                <Bar dataKey="enProceso" stackId="a" fill={ESTADO_COLORS["En Proceso"]} name="En proceso" />
                <Bar dataKey="realizado" stackId="a" fill={ESTADO_COLORS.Realizado} name="Realizado" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* Tareas por proveedor */}
      <Card title="Proveedores" subtitle="Top 8 por cantidad de tareas">
        {porProveedor.length === 0 ? (
          <Empty />
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={porProveedor} layout="vertical" margin={{ left: 16, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis dataKey="proveedor" type="category" width={140} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="total" fill="#0f172a" name="Tareas">
                  {porProveedor.map((p, i) => (
                    <Cell key={p.proveedor} fill={i === 0 ? "#0f172a" : "#475569"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* Timeline */}
      <Card title="Evolución mensual" subtitle="Tareas abiertas vs cerradas">
        {timeline.length === 0 ? (
          <Empty />
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timeline} margin={{ left: 8, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="abiertas" stroke="#3b82f6" name="Abiertas" strokeWidth={2} />
                <Line type="monotone" dataKey="cerradas" stroke="#10b981" name="Cerradas" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <TablaAnalitica tareas={tareasFiltradas} />

      {isAdmin && <VisitasSection />}
    </div>
  );
}

// =====================================================
// Sub componentes
// =====================================================

function Kpi({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <span className={cn("h-2 w-2 rounded-full", accent)} />
        <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      </div>
      <p className="mt-2 text-3xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-medium text-slate-900">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Empty() {
  return <div className="py-8 text-center text-sm text-slate-500">Sin datos para los filtros actuales.</div>;
}

function FiltroSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="text-sm">
      <span className="mb-1 block text-slate-600">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="input">
        {children}
      </select>
    </label>
  );
}

function TablaAnalitica({ tareas }: { tareas: Tarea[] }) {
  const [sortKey, setSortKey] = useState<"edificio" | "estado" | "prioridad" | "fechaInicio">("fechaInicio");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    const copy = [...tareas];
    copy.sort((a, b) => {
      const av = String(a[sortKey] ?? "");
      const bv = String(b[sortKey] ?? "");
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    return copy;
  }, [tareas, sortKey, sortDir]);

  const toggleSort = (k: typeof sortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("asc");
    }
  };

  const onExport = () => {
    const csv = tareasToCsv(sorted);
    downloadCsv(`tareas-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  return (
    <Card title="Tabla analítica" subtitle={`${tareas.length} fila${tareas.length !== 1 ? "s" : ""}`}>
      <div className="mb-2 flex justify-end">
        <button
          onClick={onExport}
          disabled={tareas.length === 0}
          className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <Download size={14} /> Exportar CSV
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <Th onClick={() => toggleSort("fechaInicio")} active={sortKey === "fechaInicio"} dir={sortDir}>Inicio</Th>
              <Th onClick={() => toggleSort("edificio")} active={sortKey === "edificio"} dir={sortDir}>Edificio</Th>
              <th className="px-3 py-2">Dpto</th>
              <th className="px-3 py-2">Objetivo</th>
              <Th onClick={() => toggleSort("estado")} active={sortKey === "estado"} dir={sortDir}>Estado</Th>
              <Th onClick={() => toggleSort("prioridad")} active={sortKey === "prioridad"} dir={sortDir}>Prioridad</Th>
              <th className="px-3 py-2">Proveedor</th>
              <th className="px-3 py-2 text-right">Presup.</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((t) => (
              <tr key={t.rowId} className="border-t border-slate-100">
                <td className="px-3 py-2 whitespace-nowrap">{formatFecha(t.fechaInicio)}</td>
                <td className="px-3 py-2">{t.edificio}</td>
                <td className="px-3 py-2 text-slate-600">{t.dpto || "—"}</td>
                <td className="px-3 py-2 text-slate-700 truncate max-w-[200px]">{t.objetivo}</td>
                <td className="px-3 py-2">
                  <span
                    className="inline-block rounded-full px-2 py-0.5 text-xs"
                    style={{ background: ESTADO_COLORS[t.estado] + "22", color: ESTADO_COLORS[t.estado] }}
                  >
                    {t.estado}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <span
                    className="inline-block rounded-full px-2 py-0.5 text-xs"
                    style={{ background: PRIORIDAD_COLORS[t.prioridad] + "22", color: PRIORIDAD_COLORS[t.prioridad] }}
                  >
                    {t.prioridad}
                  </span>
                </td>
                <td className="px-3 py-2 text-slate-600">{t.proveedor || "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {t.presupuesto != null ? `$${t.presupuesto.toLocaleString("es-AR")}` : "—"}
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                  Sin datos para los filtros actuales.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Th({
  children,
  onClick,
  active,
  dir,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  dir: "asc" | "desc";
}) {
  return (
    <th className="px-3 py-2">
      <button onClick={onClick} className={cn("flex items-center gap-1", active && "text-slate-900")}>
        {children}
        {active && <span>{dir === "asc" ? "↑" : "↓"}</span>}
      </button>
    </th>
  );
}

function VisitasSection() {
  const respuestasQ = useQuery({ queryKey: ["respuestas"], queryFn: api.respuestas.list });

  const porEdificio = useMemo(() => {
    const data = respuestasQ.data ?? [];
    const map = new Map<string, { edificio: string; visitas: number; ultima: string }>();
    for (const r of data) {
      const edif = r.edificio || "(sin edificio)";
      const entry = map.get(edif) ?? { edificio: edif, visitas: 0, ultima: "" };
      entry.visitas++;
      if (r.fecha > entry.ultima) entry.ultima = r.fecha;
      map.set(edif, entry);
    }
    return [...map.values()].sort((a, b) => b.visitas - a.visitas);
  }, [respuestasQ.data]);

  return (
    <Card title="Visitas por edificio" subtitle="Desde 'Respuestas de Trabajadores'">
      {respuestasQ.isLoading ? (
        <div className="py-6 text-center text-slate-500"><Loader2 className="mx-auto animate-spin" /></div>
      ) : porEdificio.length === 0 ? (
        <Empty />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Edificio</th>
                <th className="px-3 py-2 text-right">Visitas</th>
                <th className="px-3 py-2">Última</th>
              </tr>
            </thead>
            <tbody>
              {porEdificio.map((r) => (
                <tr key={r.edificio} className="border-t border-slate-100">
                  <td className="px-3 py-2 text-slate-900">{r.edificio}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.visitas}</td>
                  <td className="px-3 py-2 text-slate-600">{r.ultima ? formatFecha(r.ultima) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
