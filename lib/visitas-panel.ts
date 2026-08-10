// Resumen del panel de visitas: para cada consorcio, cuándo fue la última y hace cuánto.
// Lógica PURA (sin IO), para poder testearla sin tocar Sheets.

import type { Edificio, Visita } from "@/types";
import { edificioMatches } from "./edificio-match";

// A partir de este atraso el consorcio se resalta. Es una constante, no configuración:
// la frecuencia la decide el administrador y la app solo señala (decisión 11 del spec).
export const UMBRAL_ATRASO_DIAS = 45;

const MS_POR_DIA = 24 * 60 * 60 * 1000;

export interface ResumenVisitas {
  edificio: string;
  ultima: Visita | null;
  dias: number | null; // null = nunca visitado
  atrasado: boolean;
}

export function resumenPorEdificio(
  edificios: Edificio[],
  visitas: Visita[],
  now: number = Date.now()
): ResumenVisitas[] {
  const filas: ResumenVisitas[] = edificios.map((e) => {
    const suyas = visitas
      .filter((v) => edificioMatches(v.edificio, e.nombre))
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
    const ultima = suyas[0] ?? null;
    const dias = ultima ? diasDesde(ultima.fecha, now) : null;
    return {
      edificio: e.nombre,
      ultima,
      dias,
      atrasado: dias === null || dias > UMBRAL_ATRASO_DIAS,
    };
  });

  // Sin visitas primero; después, del más atrasado al más reciente.
  return filas.sort((a, b) => {
    if (a.dias === null && b.dias === null) return a.edificio.localeCompare(b.edificio);
    if (a.dias === null) return -1;
    if (b.dias === null) return 1;
    return b.dias - a.dias;
  });
}

function diasDesde(fechaISO: string, now: number): number {
  const [y, m, d] = fechaISO.slice(0, 10).split("-").map(Number);
  // Mediodía UTC: evita que el desfasaje horario corra el resultado un día.
  const ts = Date.UTC(y, (m ?? 1) - 1, d ?? 1, 12);
  return Math.max(0, Math.floor((now - ts) / MS_POR_DIA));
}
