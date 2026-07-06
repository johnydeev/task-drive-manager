import { google, drive_v3 } from "googleapis";
import { Readable } from "stream";
import { getGoogleAuth, getDriveRootFolderId } from "./google-auth";
import { isDemoMode } from "./demo-mode";

const FOLDER_MIME = "application/vnd.google-apps.folder";

// Tipos de archivo que se guardan por tarea, con su subcarpeta destino.
export type TareaFileKind = "imagen" | "video" | "documento" | "reporte";

const SUBCARPETA: Record<TareaFileKind, string> = {
  imagen: "Imagenes",
  video: "Videos",
  documento: "Documentos",
  reporte: "Reporte",
};

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
] as const;

const MIME_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "application/pdf": ".pdf",
};

let driveClient: drive_v3.Drive | null = null;

function getDrive() {
  if (!driveClient) {
    driveClient = google.drive({ version: "v3", auth: getGoogleAuth() });
  }
  return driveClient;
}

// Cache en memoria de carpetas ya creadas/encontradas: clave = `${parent}::${name}`
const folderCache = new Map<string, string>();

async function ensureFolder(name: string, parentId: string): Promise<string> {
  const cacheKey = `${parentId}::${name}`;
  const cached = folderCache.get(cacheKey);
  if (cached) return cached;

  const drive = getDrive();
  const safeName = name.replace(/'/g, "\\'");
  const query = `mimeType='${FOLDER_MIME}' and name='${safeName}' and '${parentId}' in parents and trashed=false`;

  const found = await drive.files.list({
    q: query,
    fields: "files(id, name)",
    spaces: "drive",
    pageSize: 1,
    // Soporte para Unidades compartidas (Shared Drives): la SA no tiene cuota
    // propia, así que los archivos viven en la unidad compartida de la organización.
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  let folderId = found.data.files?.[0]?.id;
  if (!folderId) {
    const created = await drive.files.create({
      requestBody: {
        name,
        mimeType: FOLDER_MIME,
        parents: [parentId],
      },
      fields: "id",
      supportsAllDrives: true,
    });
    folderId = created.data.id ?? undefined;
    if (!folderId) throw new Error(`No se pudo crear la carpeta ${name}`);
  }

  folderCache.set(cacheKey, folderId);
  return folderId;
}

// Busca una carpeta por nombre SIN crearla. Devuelve el id o null.
async function findFolder(name: string, parentId: string): Promise<string | null> {
  const cacheKey = `${parentId}::${name}`;
  const cached = folderCache.get(cacheKey);
  if (cached) return cached;

  const safeName = name.replace(/'/g, "\\'");
  const query = `mimeType='${FOLDER_MIME}' and name='${safeName}' and '${parentId}' in parents and trashed=false`;
  const found = await getDrive().files.list({
    q: query,
    fields: "files(id)",
    spaces: "drive",
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  const id = found.data.files?.[0]?.id ?? null;
  if (id) folderCache.set(cacheKey, id);
  return id;
}

// Manda la carpeta de una tarea a la papelera de Drive (recuperable ~30 días).
// Recorre la ruta sin crear nada; si algún tramo no existe, es un no-op.
export async function trashTareaFolder(opts: {
  edificio: string;
  objetivo: string;
  ubicacion: string;
  rowId: string;
}): Promise<void> {
  if (isDemoMode()) return;

  const d = new Date(opts.rowId);
  const fecha = isNaN(d.getTime()) ? new Date() : d;
  const p = argParts(fecha);

  const root = getDriveRootFolderId();
  const tareas = await findFolder("Tareas", root);
  if (!tareas) return;
  const edificio = await findFolder(sanitizeSegment(opts.edificio) || "Sin edificio", tareas);
  if (!edificio) return;
  const anio = await findFolder(String(p.year), edificio);
  if (!anio) return;
  const mes = await findFolder(MESES[p.monthIndex], anio);
  if (!mes) return;
  const nombre = tareaFolderName({ rowId: opts.rowId, ubicacion: opts.ubicacion, objetivo: opts.objetivo });
  const tareaFolder = await findFolder(nombre, mes);
  if (!tareaFolder) return;

  await getDrive().files.update({
    fileId: tareaFolder,
    requestBody: { trashed: true },
    supportsAllDrives: true,
  });
  // El id ya no sirve (está en papelera): sacarlo del cache.
  folderCache.delete(`${mes}::${nombre}`);
}

// Cuenta los archivos existentes en una carpeta para calcular el próximo índice (NN).
async function nextIndex(folderId: string): Promise<number> {
  const res = await getDrive().files.list({
    q: `'${folderId}' in parents and trashed=false`,
    fields: "files(id)",
    spaces: "drive",
    pageSize: 1000,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  return (res.data.files?.length ?? 0) + 1;
}

// Descompone una fecha en partes de horario Argentina (UTC-3), sin depender de la TZ del server.
function argParts(date: Date) {
  const arg = new Date(date.getTime() - 3 * 60 * 60 * 1000);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return {
    year: arg.getUTCFullYear(),
    monthIndex: arg.getUTCMonth(), // 0-11
    month: arg.getUTCMonth() + 1,
    day: arg.getUTCDate(),
    pad,
  };
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

// Sanitiza un segmento de path para Drive: quita caracteres problemáticos y recorta.
// Mantiene mayúsculas, espacios y acentos para que sea legible.
export function sanitizeSegment(input: string, maxLen = 60): string {
  return input
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen)
    .trim();
}

// Extrae la extensión (con punto) del nombre original; fallback al mime.
function extFor(originalName: string, mimeType: string): string {
  const m = originalName.match(/\.[a-zA-Z0-9]+$/);
  if (m) return m[0].toLowerCase();
  return MIME_EXT[mimeType] ?? "";
}

// Nombre de la carpeta de una tarea: "{YYYY-MM-DD} · {ubicación} · {objetivo}".
// La fecha se deriva del rowId (timestamp ISO de creación), así todos los archivos
// de la tarea caen en la MISMA carpeta y el reporte (generado después) reconstruye
// el mismo nombre a partir de la fila en Sheets.
export function tareaFolderName(opts: { rowId: string; ubicacion: string; objetivo: string }): string {
  const d = new Date(opts.rowId);
  const fecha = isNaN(d.getTime()) ? new Date() : d;
  const p = argParts(fecha);
  const ymd = `${p.year}-${p.pad(p.month)}-${p.pad(p.day)}`;
  const ubic = sanitizeSegment(opts.ubicacion) || "Sin ubicacion";
  const obj = sanitizeSegment(opts.objetivo) || "Tarea";
  return `${ymd} · ${ubic} · ${obj}`;
}

function demoFolderId(opts: { edificio: string; objetivo: string }): string {
  return `demo-${opts.edificio}-${opts.objetivo}`.replace(/\s+/g, "_").toLowerCase();
}

// Construye/obtiene la carpeta de una tarea:
//   {raíz}/Tareas/{Edificio}/{Año}/{Mes}/{fecha · ubicación · objetivo}/
// Devuelve el id de la carpeta de la tarea (sin la subcarpeta por tipo).
export async function ensureTareaFolder(opts: {
  edificio: string;
  objetivo: string;
  ubicacion: string;
  rowId: string;
}): Promise<string> {
  if (isDemoMode()) return demoFolderId(opts);

  const d = new Date(opts.rowId);
  const fecha = isNaN(d.getTime()) ? new Date() : d;
  const p = argParts(fecha);

  const root = getDriveRootFolderId();
  const tareas = await ensureFolder("Tareas", root);
  const edificio = await ensureFolder(sanitizeSegment(opts.edificio) || "Sin edificio", tareas);
  const anio = await ensureFolder(String(p.year), edificio);
  const mes = await ensureFolder(MESES[p.monthIndex], anio);
  const nombre = tareaFolderName({ rowId: opts.rowId, ubicacion: opts.ubicacion, objetivo: opts.objetivo });
  const tareaFolder = await ensureFolder(nombre, mes);
  return tareaFolder;
}

export interface UploadResult {
  fileId: string;
  url: string;
  name: string;
}

// Sube un archivo de una tarea a su subcarpeta por tipo (Imagenes/Videos/Documentos/Reporte),
// renombrándolo a "{tipo}-NN.ext". Es el punto de entrada usado por la ruta de upload y por
// la generación de reportes.
export async function uploadTareaFile(opts: {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  kind: TareaFileKind;
  edificio: string;
  objetivo: string;
  ubicacion: string;
  rowId: string;
}): Promise<UploadResult> {
  const ext = extFor(opts.originalName, opts.mimeType);

  if (isDemoMode()) {
    const fakeId = `demo-${opts.kind}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    return {
      fileId: fakeId,
      name: `${opts.kind}-01${ext}`,
      url: `https://drive.google.com/file/d/${fakeId}/view`,
    };
  }

  const tareaFolderId = await ensureTareaFolder({
    edificio: opts.edificio,
    objetivo: opts.objetivo,
    ubicacion: opts.ubicacion,
    rowId: opts.rowId,
  });
  const subFolderId = await ensureFolder(SUBCARPETA[opts.kind], tareaFolderId);
  const nn = await nextIndex(subFolderId);
  const name = `${opts.kind}-${pad2(nn)}${ext}`;

  return uploadFile({ buffer: opts.buffer, name, mimeType: opts.mimeType, folderId: subFolderId });
}

// Subida de bajo nivel a una carpeta concreta. Hace el archivo público.
async function uploadFile(opts: {
  buffer: Buffer;
  name: string;
  mimeType: string;
  folderId: string;
}): Promise<UploadResult> {
  const drive = getDrive();
  const created = await drive.files.create({
    requestBody: {
      name: opts.name,
      parents: [opts.folderId],
    },
    media: {
      mimeType: opts.mimeType,
      body: Readable.from(opts.buffer),
    },
    fields: "id, name",
    supportsAllDrives: true,
  });

  const fileId = created.data.id;
  if (!fileId) throw new Error("Drive no retornó fileId");

  // Hacer el archivo accesible públicamente con la URL.
  await drive.permissions.create({
    fileId,
    requestBody: { role: "reader", type: "anyone" },
    supportsAllDrives: true,
  });

  return {
    fileId,
    name: created.data.name ?? opts.name,
    url: `https://drive.google.com/file/d/${fileId}/view`,
  };
}

// Extrae el fileId de una URL de Drive del formato /file/d/{id}/view.
export function extractFileId(url: string): string | null {
  const m = url.match(/\/file\/d\/([^/]+)/);
  return m ? m[1] : null;
}

export async function deleteFileByUrl(url: string): Promise<void> {
  if (isDemoMode()) return;
  const fileId = extractFileId(url);
  if (!fileId) return;
  await getDrive().files.delete({ fileId, supportsAllDrives: true });
}
