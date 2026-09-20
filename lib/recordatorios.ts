import type { Aviso, EstadoTarea, Tarea, Usuario } from "@/types";

export const UMBRAL_TRABADA_MS = 24 * 60 * 60 * 1000;

// Timestamp del estado actual; sin él, actualizadoEn; sin ninguno, undefined (se ignora).
function desdeCuando(t: Tarea): number | undefined {
  const porEstado: Partial<Record<EstadoTarea, string | undefined>> = {
    Asignada: t.asignadaEn,
    Aceptada: t.aceptadaEn,
    Objetada: t.objetadaEn,
    "En Revisión": t.revisionEn,
  };
  const iso = porEstado[t.estado] || t.actualizadoEn;
  if (!iso) return undefined;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? undefined : ms;
}

function trabada(t: Tarea, now: number): boolean {
  const desde = desdeCuando(t);
  return desde !== undefined && now - desde >= UMBRAL_TRABADA_MS;
}

// Estados que esperan una acción del asignado (En Proceso es trabajo en curso: no se apura).
const MOTIVO: Partial<Record<EstadoTarea, string>> = {
  Asignada: "sin aceptar",
  Aceptada: "sin empezar",
  Objetada: "objetada",
};

function lugar(t: Tarea): string {
  return [t.objetivo || "(sin objetivo)", t.edificio].filter(Boolean).join(" · ");
}

export interface Recordatorio {
  email: string;
  aviso: Aviso;
}

// Un aviso por destinatario: a cada admin activo por las En Revisión trabadas; a cada asignado
// activo por sus Asignada/Aceptada/Objetada trabadas. Puro: no lee reloj ni Sheet.
export function armarRecordatorios(tareas: Tarea[], usuarios: Usuario[], now: number): Recordatorio[] {
  const activos = usuarios.filter((u) => u.activo);
  const admins = activos.filter((u) => u.rol === "admin");
  const activosPorEmail = new Set(activos.map((u) => u.email.toLowerCase()));
  const out: Recordatorio[] = [];

  const enRevision = tareas.filter((t) => t.estado === "En Revisión" && trabada(t, now));
  if (enRevision.length > 0) {
    const n = enRevision.length;
    const cuerpo =
      n === 1
        ? `${lugar(enRevision[0])} espera tu revisión`
        : `${n} tareas en revisión hace más de un día`;
    const aviso: Aviso = {
      titulo: "Tareas esperando tu revisión",
      cuerpo,
      url: `/tareas?${new URLSearchParams({ estado: "En Revisión", orden: "antiguas" })}`,
      tag: "recordatorio-revision",
    };
    for (const a of admins) out.push({ email: a.email.toLowerCase(), aviso });
  }

  const porAsignado = new Map<string, Tarea[]>();
  for (const t of tareas) {
    if (!MOTIVO[t.estado] || !trabada(t, now)) continue;
    const email = (t.asignadoA ?? "").toLowerCase();
    if (!email || !activosPorEmail.has(email)) continue;
    porAsignado.set(email, [...(porAsignado.get(email) ?? []), t]);
  }
  for (const [email, mias] of porAsignado) {
    const n = mias.length;
    const cuerpo =
      n === 1 ? `${lugar(mias[0])}: ${MOTIVO[mias[0].estado]}` : `${n} tareas esperan tu acción`;
    out.push({
      email,
      aviso: {
        titulo: "Tenés tareas sin avanzar",
        cuerpo,
        url: `/tareas?${new URLSearchParams({ mias: "1", orden: "antiguas" })}`,
        tag: "recordatorio-mias",
      },
    });
  }
  return out;
}
