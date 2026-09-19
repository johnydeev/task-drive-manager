import { isDemoMode } from "../demo-mode";
import { EDIFICIO_FICHA_VACIA, type EdificioFicha } from "@/types";
import { readRange, SHEETS, writeRange } from "./core";
import { buildHeaderMap, type HeaderMap } from "./headers";
import { edificioMatches } from "../edificio-match";
import { nowBuenosAiresISO } from "../fecha-ar";

// Headers: edificio · seguro_poliza · ascensores · fumigacion · empresa_matafuego_venc
//        · encargado · caldera_termotanque · empresa_limpieza · horario_trabajo
//        · encargado_limpieza_hs · actualizado_en
const RANGE = `${SHEETS.edificioFicha}!A:K`;

function rowToFicha(h: HeaderMap, r: string[]): EdificioFicha {
  return {
    edificio: h.get(r, "edificio"),
    seguroPoliza: h.get(r, "seguro_poliza"),
    ascensores: h.get(r, "ascensores"),
    fumigacion: h.get(r, "fumigacion"),
    empresaMatafuegoVenc: h.get(r, "empresa_matafuego_venc"),
    encargado: h.get(r, "encargado"),
    calderaTermotanque: h.get(r, "caldera_termotanque"),
    empresaLimpieza: h.get(r, "empresa_limpieza"),
    horarioTrabajo: h.get(r, "horario_trabajo"),
    encargadoLimpiezaHs: h.get(r, "encargado_limpieza_hs"),
    actualizadoEn: h.get(r, "actualizado_en") || undefined,
  };
}

function fichaToRow(f: EdificioFicha): string[] {
  return [
    f.edificio,
    f.seguroPoliza,
    f.ascensores,
    f.fumigacion,
    f.empresaMatafuegoVenc,
    f.encargado,
    f.calderaTermotanque,
    f.empresaLimpieza,
    f.horarioTrabajo,
    f.encargadoLimpiezaHs,
    f.actualizadoEn ?? "",
  ];
}

// Busca la fila del edificio. Devuelve null si no está o si la hoja no existe aún.
async function findFichaRow(
  edificio: string
): Promise<{ ficha: EdificioFicha; rowNumber: number } | null> {
  let rows: string[][];
  try {
    rows = await readRange(RANGE);
  } catch {
    // La hoja todavía no fue creada en la planilla: se trata como "sin ficha".
    return null;
  }
  if (rows.length === 0) return null;
  const h = buildHeaderMap(rows[0] ?? []);
  const idx = rows.slice(1).findIndex((r) => edificioMatches(h.get(r, "edificio"), edificio));
  if (idx === -1) return null;
  return { ficha: rowToFicha(h, rows[idx + 1]), rowNumber: idx + 2 };
}

// Ficha del edificio para precargar el formulario. Si no hay nada cargado devuelve una
// ficha vacía: la primera visita de un consorcio arranca en blanco.
export async function getEdificioFicha(edificio: string): Promise<EdificioFicha> {
  if (isDemoMode()) return { edificio, ...EDIFICIO_FICHA_VACIA };
  const found = await findFichaRow(edificio);
  return found?.ficha ?? { edificio, ...EDIFICIO_FICHA_VACIA };
}

// Upsert: sobrescribe la fila del edificio con lo cargado en la visita, o la crea.
export async function guardarEdificioFicha(
  edificio: string,
  datos: Partial<Omit<EdificioFicha, "edificio" | "actualizadoEn">>
): Promise<EdificioFicha> {
  const found = await findFichaRow(edificio);
  const previa = found?.ficha ?? { edificio, ...EDIFICIO_FICHA_VACIA };
  const merged: EdificioFicha = {
    ...previa,
    ...datos,
    edificio,
    actualizadoEn: nowBuenosAiresISO(),
  };
  if (isDemoMode()) return merged;

  const rowNumber = found?.rowNumber ?? (await proximaFilaLibre());
  await writeRange(`${SHEETS.edificioFicha}!A${rowNumber}:K${rowNumber}`, [fichaToRow(merged)]);
  return merged;
}

// Fila libre por la columna A. Mismo criterio que el resto del data-layer: values.append
// dispersa las filas al fondo del grid en hojas grandes.
async function proximaFilaLibre(): Promise<number> {
  const colA = await readRange(`${SHEETS.edificioFicha}!A:A`);
  return colA.length + 1;
}
