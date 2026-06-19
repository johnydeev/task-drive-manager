import { google, sheets_v4 } from "googleapis";
import { getGoogleAuth, getSheetId } from "./google-auth";
import type {
  Configuracion,
  Dpto,
  Edificio,
  EstadoTarea,
  Prioridad,
  Rol,
  Tarea,
  TareaNuevaInput,
  TareaUpdateInput,
  Usuario,
} from "@/types";
import { CONFIGURACION_DEFAULT } from "@/types";
import { isDemoMode } from "./demo-mode";
import {
  createDemoTarea,
  createDemoUsuario,
  getDemoConfig,
  getDemoDptos,
  getDemoEdificios,
  getDemoTareaById,
  getDemoTareas,
  getDemoUsuarios,
  setDemoUsuarioActivo,
  updateDemoConfig,
  updateDemoTarea,
} from "./demo-data";

// Nombres de hojas — coinciden exactamente con los tabs de la spreadsheet.
export const SHEETS = {
  edificios: "Edificios",
  dptos: "Dptos",
  tareas: "Tareas",
  usuarios: "Usuarios",
  configuracion: "Configuración",
} as const;

export const TAREAS_RANGE = `${SHEETS.tareas}!A:Z`;

let sheetsClient: sheets_v4.Sheets | null = null;

function getSheets() {
  if (!sheetsClient) {
    sheetsClient = google.sheets({ version: "v4", auth: getGoogleAuth() });
  }
  return sheetsClient;
}

async function readRange(range: string): Promise<string[][]> {
  const res = await getSheets().spreadsheets.values.get({
    spreadsheetId: getSheetId(),
    range,
  });
  return (res.data.values ?? []) as string[][];
}

// =====================================================
// Edificios
// =====================================================

export async function getEdificios(): Promise<Edificio[]> {
  if (isDemoMode()) return getDemoEdificios();
  const rows = await readRange(`${SHEETS.edificios}!A2:A`);
  return rows
    .map((r) => (r[0] ?? "").trim())
    .filter(Boolean)
    .map((nombre) => ({ nombre }));
}

// =====================================================
// Dptos
// =====================================================

// Normaliza un nombre de edificio para comparar entre hojas distintas:
// minúsculas, sin acentos, sin espacios extra. Necesario porque los edificios
// vienen de _Consorcios (nombre canónico, ej. "BELGRANO 1429") pero los Dptos
// referencian con el nombre de la app vieja (ej. "Belgrano 1429").
function normalizeEdificio(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
}

export function edificioMatches(a: string, b: string): boolean {
  const na = normalizeEdificio(a);
  const nb = normalizeEdificio(b);
  return na !== "" && na === nb;
}

export async function getDptos(edificio?: string): Promise<Dpto[]> {
  if (isDemoMode()) return getDemoDptos(edificio);
  const rows = await readRange(`${SHEETS.dptos}!A2:C`);
  const all = rows
    .filter((r) => r.length >= 3)
    .map<Dpto>((r) => ({
      idDpto: (r[0] ?? "").trim(),
      dpto: (r[1] ?? "").trim(),
      edificioRef: (r[2] ?? "").trim(),
    }))
    .filter((d) => d.idDpto && d.dpto);

  if (!edificio) return all;
  return all.filter((d) => edificioMatches(d.edificioRef, edificio));
}

// =====================================================
// Tareas — tab "Tareas"
// =====================================================


// Mapea una fila plana del Sheet a Tarea tipada.
// Las posiciones son 0-indexed (A=0).
export function rowToTarea(row: string[], rowNumber: number): Tarea {
  const safeJsonArr = (v?: string): string[] => {
    if (!v) return [];
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
    } catch {
      return [];
    }
  };

  return {
    rowId: row[0] ?? "",
    rowNumber,
    objetivo: row[1] ?? "",
    fechaInicio: row[2] ?? "",
    fechaEstimada: row[3] ?? "",
    edificio: row[4] ?? "",
    parteComun: (row[5] ?? "").toString().toLowerCase() === "true" || row[5] === "Sí",
    dpto: row[6] ?? "",
    informe: row[7] ?? "",
    comentarioEnProceso: row[8] || undefined,
    comentarioRealizado: row[9] || undefined,
    imagenes: safeJsonArr(row[10]),
    videos: safeJsonArr(row[11]),
    documentos: safeJsonArr(row[12]),
    reporteUrl: row[13] || undefined,
    proveedor: row[16] || undefined,
    estado: ((row[17] as EstadoTarea) || "Pendiente") as EstadoTarea,
    presupuesto: row[18] ? Number(row[18]) || undefined : undefined,
    fechaRealizado: row[19] || undefined,
    prioridad: ((row[20] as Prioridad) || "Media") as Prioridad,
    supervisor: row[21] ?? "",
  };
}

export function tareaToRow(t: Partial<Tarea> & { rowId: string }): (string | number | boolean)[] {
  // Devuelve un array de 22 columnas (A:V). Las reservadas (23-26) quedan fuera.
  const row: (string | number | boolean)[] = new Array(22).fill("");
  row[0] = t.rowId;
  row[1] = t.objetivo ?? "";
  row[2] = t.fechaInicio ?? "";
  row[3] = t.fechaEstimada ?? "";
  row[4] = t.edificio ?? "";
  row[5] = t.parteComun ? "TRUE" : "FALSE";
  row[6] = t.dpto ?? "";
  row[7] = t.informe ?? "";
  row[8] = t.comentarioEnProceso ?? "";
  row[9] = t.comentarioRealizado ?? "";
  row[10] = JSON.stringify(t.imagenes ?? []);
  row[11] = JSON.stringify(t.videos ?? []);
  row[12] = JSON.stringify(t.documentos ?? []);
  row[13] = t.reporteUrl ?? "";
  // 14-15 reservadas, quedan ""
  row[16] = t.proveedor ?? "";
  row[17] = t.estado ?? "Pendiente";
  row[18] = t.presupuesto ?? "";
  row[19] = t.fechaRealizado ?? "";
  row[20] = t.prioridad ?? "Media";
  row[21] = t.supervisor ?? "";
  return row;
}

export interface TareaFilters {
  edificio?: string;
  estado?: EstadoTarea;
  prioridad?: Prioridad;
  supervisor?: string;
  desde?: string; // ISO date
  hasta?: string; // ISO date
}

// Detecta si la celda A de una fila parece un rowId válido (timestamp ISO).
// Permite distinguir filas de datos de: header, filas vacías o basura.
function looksLikeRowId(value: string | undefined): boolean {
  if (!value) return false;
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value.trim());
}

// Convierte las filas crudas de la Sheet a Tareas, filtrando por contenido
// (no por posición): solo incluye filas cuya columna A es un rowId válido.
// Esto tolera: hoja sin header, hoja con header, y filas vacías intercaladas.
// El rowNumber refleja la fila real de la Sheet (1-indexed).
export function parseTareasRows(rows: string[][]): Tarea[] {
  return rows
    .map((r, i) => ({ r, rowNumber: i + 1 }))
    .filter(({ r }) => looksLikeRowId(r[0]))
    .map(({ r, rowNumber }) => rowToTarea(r, rowNumber));
}

export async function getTareas(filters: TareaFilters = {}): Promise<Tarea[]> {
  if (isDemoMode()) {
    return getDemoTareas(filters).filter((t) => {
      if (filters.desde && t.fechaInicio < filters.desde) return false;
      if (filters.hasta && t.fechaInicio > filters.hasta) return false;
      return true;
    });
  }
  const rows = await readRange(TAREAS_RANGE);
  const tareas = parseTareasRows(rows);

  return tareas.filter((t) => {
    if (filters.edificio && t.edificio !== filters.edificio) return false;
    if (filters.estado && t.estado !== filters.estado) return false;
    if (filters.prioridad && t.prioridad !== filters.prioridad) return false;
    if (filters.supervisor && t.supervisor !== filters.supervisor) return false;
    if (filters.desde && t.fechaInicio < filters.desde) return false;
    if (filters.hasta && t.fechaInicio > filters.hasta) return false;
    return true;
  });
}

export async function getTareaByRowId(rowId: string): Promise<Tarea | null> {
  if (isDemoMode()) return getDemoTareaById(rowId);
  const tareas = await getTareas();
  return tareas.find((t) => t.rowId === rowId) ?? null;
}

export async function appendTarea(
  input: TareaNuevaInput,
  supervisor: string
): Promise<Tarea> {
  if (isDemoMode()) {
    return createDemoTarea(
      {
        objetivo: input.objetivo,
        fechaInicio: input.fechaInicio,
        fechaEstimada: input.fechaEstimada,
        edificio: input.edificio,
        parteComun: input.parteComun,
        dpto: input.parteComun ? "Parte Común" : input.dpto,
        informe: input.informe,
        imagenes: input.imagenes ?? [],
        videos: input.videos ?? [],
        documentos: input.documentos ?? [],
        proveedor: input.proveedor,
        estado: input.estado ?? "Pendiente",
        presupuesto: input.presupuesto,
        prioridad: input.prioridad,
      },
      supervisor
    );
  }
  const rowId = new Date().toISOString();
  const tarea: Tarea = {
    rowId,
    objetivo: input.objetivo,
    fechaInicio: input.fechaInicio,
    fechaEstimada: input.fechaEstimada,
    edificio: input.edificio,
    parteComun: input.parteComun,
    dpto: input.parteComun ? "Parte Común" : input.dpto,
    informe: input.informe,
    imagenes: input.imagenes ?? [],
    videos: input.videos ?? [],
    documentos: input.documentos ?? [],
    proveedor: input.proveedor,
    estado: input.estado ?? "Pendiente",
    presupuesto: input.presupuesto,
    prioridad: input.prioridad,
    supervisor,
  };

  const values = [tareaToRow(tarea)];
  const res = await getSheets().spreadsheets.values.append({
    spreadsheetId: getSheetId(),
    range: TAREAS_RANGE,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values },
  });

  // Intentar extraer el número de fila del updatedRange (ej: "Sheet!A12:V12")
  const updatedRange = res.data.updates?.updatedRange ?? "";
  const match = updatedRange.match(/!A(\d+):/);
  tarea.rowNumber = match ? Number(match[1]) : undefined;

  return tarea;
}

export async function updateTarea(input: TareaUpdateInput): Promise<Tarea> {
  if (isDemoMode()) {
    const updated = updateDemoTarea(input.rowId, input);
    if (!updated) throw new Error(`Tarea con rowId ${input.rowId} no encontrada`);
    return updated;
  }
  const current = await getTareaByRowId(input.rowId);
  if (!current) throw new Error(`Tarea con rowId ${input.rowId} no encontrada`);
  if (!current.rowNumber) throw new Error("rowNumber no disponible para update");

  const merged: Tarea = { ...current, ...input, rowId: current.rowId };
  if (merged.parteComun) merged.dpto = "Parte Común";

  await getSheets().spreadsheets.values.update({
    spreadsheetId: getSheetId(),
    range: `${SHEETS.tareas}!A${current.rowNumber}:V${current.rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [tareaToRow(merged)] },
  });

  return merged;
}

// =====================================================
// Usuarios
// =====================================================

function rowToUsuario(row: string[]): Usuario {
  // Normalizamos el rol a minúscula para tolerar "ADMIN", "Admin", "admin"
  // (la hoja la editan humanos a mano y pueden variar mayúsculas).
  const rolRaw = (row[2] ?? "").trim().toLowerCase();
  const rol: Rol = rolRaw === "admin" ? "admin" : "supervisor";
  return {
    email: (row[0] ?? "").trim().toLowerCase(),
    nombre: row[1] ?? "",
    rol,
    activo: (row[3] ?? "").toString().trim().toLowerCase() !== "false",
    creadoEn: row[4] ?? "",
  };
}

export async function getUsuarios(): Promise<Usuario[]> {
  if (isDemoMode()) return getDemoUsuarios();
  const rows = await readRange(`${SHEETS.usuarios}!A2:E`);
  return rows.filter((r) => r[0]).map(rowToUsuario);
}

export async function getUsuarioByEmail(email: string): Promise<Usuario | null> {
  const target = email.trim().toLowerCase();
  const usuarios = await getUsuarios();
  return usuarios.find((u) => u.email === target) ?? null;
}

export async function appendUsuario(u: Omit<Usuario, "creadoEn">): Promise<Usuario> {
  if (isDemoMode()) return createDemoUsuario(u);
  const usuario: Usuario = { ...u, creadoEn: new Date().toISOString() };
  await getSheets().spreadsheets.values.append({
    spreadsheetId: getSheetId(),
    range: `${SHEETS.usuarios}!A:E`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [[usuario.email, usuario.nombre, usuario.rol, usuario.activo, usuario.creadoEn]],
    },
  });
  return usuario;
}

export async function setUsuarioActivo(email: string, activo: boolean): Promise<void> {
  if (isDemoMode()) {
    if (!setDemoUsuarioActivo(email, activo)) throw new Error(`Usuario ${email} no encontrado`);
    return;
  }
  const rows = await readRange(`${SHEETS.usuarios}!A2:E`);
  const idx = rows.findIndex((r) => (r[0] ?? "").trim().toLowerCase() === email.trim().toLowerCase());
  if (idx === -1) throw new Error(`Usuario ${email} no encontrado`);
  const rowNumber = idx + 2;
  await getSheets().spreadsheets.values.update({
    spreadsheetId: getSheetId(),
    range: `${SHEETS.usuarios}!D${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[activo]] },
  });
}

// =====================================================
// Configuración (clave/valor)
// =====================================================

const CONFIG_TTL_MS = 5 * 60 * 1000;
let configCache: { data: Configuracion; expires: number } | null = null;

export async function getConfiguracion(): Promise<Configuracion> {
  if (isDemoMode()) return getDemoConfig();
  if (configCache && configCache.expires > Date.now()) return configCache.data;

  try {
    const rows = await readRange(`${SHEETS.configuracion}!A2:B`);
    const map = new Map<string, string>();
    for (const r of rows) {
      if (r[0]) map.set(r[0].trim(), (r[1] ?? "").toString().trim());
    }

    const data: Configuracion = {
      maxImagenes: Number(map.get("max_imagenes")) || CONFIGURACION_DEFAULT.maxImagenes,
      maxVideos: Number(map.get("max_videos")) || CONFIGURACION_DEFAULT.maxVideos,
      maxDocumentos: Number(map.get("max_documentos")) || CONFIGURACION_DEFAULT.maxDocumentos,
      maxSizeImagenMB: Number(map.get("max_size_imagen_mb")) || CONFIGURACION_DEFAULT.maxSizeImagenMB,
      maxSizeVideoMB: Number(map.get("max_size_video_mb")) || CONFIGURACION_DEFAULT.maxSizeVideoMB,
      maxSizePdfMB: Number(map.get("max_size_pdf_mb")) || CONFIGURACION_DEFAULT.maxSizePdfMB,
    };

    configCache = { data, expires: Date.now() + CONFIG_TTL_MS };
    return data;
  } catch {
    return CONFIGURACION_DEFAULT;
  }
}

export async function updateConfiguracion(cfg: Configuracion): Promise<void> {
  if (isDemoMode()) {
    updateDemoConfig(cfg);
    return;
  }
  const entries: [string, number][] = [
    ["max_imagenes", cfg.maxImagenes],
    ["max_videos", cfg.maxVideos],
    ["max_documentos", cfg.maxDocumentos],
    ["max_size_imagen_mb", cfg.maxSizeImagenMB],
    ["max_size_video_mb", cfg.maxSizeVideoMB],
    ["max_size_pdf_mb", cfg.maxSizePdfMB],
  ];

  // Estrategia simple: limpiar y reescribir desde A2.
  await getSheets().spreadsheets.values.update({
    spreadsheetId: getSheetId(),
    range: `${SHEETS.configuracion}!A2:B${entries.length + 1}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: entries },
  });

  configCache = { data: cfg, expires: Date.now() + CONFIG_TTL_MS };
}
