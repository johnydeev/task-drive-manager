// Barrel de la capa de datos de Google Sheets.
// La implementación vive dividida por entidad en lib/sheets/*. Este archivo re-exporta
// todo para no romper los imports históricos `from "@/lib/google-sheets"`.
export { SHEETS, TAREAS_RANGE, getSheets, readRange } from "./sheets/core";
export { getEdificios, edificioMatches, getDptos } from "./sheets/edificios";
export {
  rowToTarea,
  tareaToRow,
  parseTareasRows,
  getTareas,
  getTareaByRowId,
  appendTarea,
  deleteTarea,
  updateTarea,
  type TareaFilters,
} from "./sheets/tareas";
export { getUsuarios, getUsuarioByEmail, appendUsuario, setUsuarioActivo } from "./sheets/usuarios";
export { getConfiguracion, updateConfiguracion } from "./sheets/config";
