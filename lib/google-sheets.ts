// Barrel de la capa de datos de Google Sheets.
// La implementación vive dividida por entidad en lib/sheets/*. Este archivo re-exporta
// todo para no romper los imports históricos `from "@/lib/google-sheets"`.
export { SHEETS, TAREAS_RANGE, readRange, writeRanges } from "./sheets/core";
export { getEdificios, edificioMatches, getDptos } from "./sheets/edificios";
export {
  rowToTarea,
  tareaToRow,
  parseTareasRows,
  getTareas,
  getTareaByRowId,
  getTareaPersistida,
  appendTarea,
  deleteTarea,
  updateTarea,
  type TareaFilters,
} from "./sheets/tareas";
export { getUsuarios, getUsuarioByEmail, appendUsuario, setUsuarioActivo, setUsuarioFirma } from "./sheets/usuarios";
export { getConfiguracion, updateConfiguracion, resetConfigCache, getConfigValor, setConfigValor } from "./sheets/config";
export { getSuscripciones, upsertSuscripcion, deleteSuscripcion } from "./sheets/suscripciones";
export { getAvisos, appendAvisos, reemplazarRecordatorios, marcarLeidos, purgarAvisos } from "./sheets/avisos";
export { getVisitas, getVisitaById, appendVisita, deleteVisita, rowsToVisitas } from "./sheets/visitas";
export { getEdificioFicha, guardarEdificioFicha } from "./sheets/edificio-ficha";
