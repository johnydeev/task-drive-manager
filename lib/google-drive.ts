import { google, drive_v3 } from "googleapis";
import { Readable } from "stream";
import { getGoogleAuth, getDriveRootFolderId } from "./google-auth";
import { isDemoMode } from "./demo-mode";

const FOLDER_MIME = "application/vnd.google-apps.folder";

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
    });
    folderId = created.data.id ?? undefined;
    if (!folderId) throw new Error(`No se pudo crear la carpeta ${name}`);
  }

  folderCache.set(cacheKey, folderId);
  return folderId;
}

// Sanitiza el nombre del objetivo para usar en path:
// minúsculas, espacios -> "_", quita acentos y caracteres especiales, trunca a 40.
export function sanitizeObjetivo(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s_-]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 40)
    .replace(/^_|_$/g, "");
}

// Devuelve timestamp YYYYMMDD_HHMMSS en zona Argentina (UTC-3).
function timestampArgentina(date = new Date()): string {
  // Forzamos offset -03:00 sin depender de TZ del server.
  const arg = new Date(date.getTime() - 3 * 60 * 60 * 1000);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    arg.getUTCFullYear().toString() +
    pad(arg.getUTCMonth() + 1) +
    pad(arg.getUTCDate()) +
    "_" +
    pad(arg.getUTCHours()) +
    pad(arg.getUTCMinutes()) +
    pad(arg.getUTCSeconds())
  );
}

function yearMonthArgentina(date = new Date()): string {
  const arg = new Date(date.getTime() - 3 * 60 * 60 * 1000);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${arg.getUTCFullYear()}-${pad(arg.getUTCMonth() + 1)}`;
}

// Construye/obtiene la carpeta destino para los archivos de una tarea:
// {root}/Tareas/{Edificio}/{YYYY-MM}/{YYYYMMDD_HHMMSS}_{objetivo}/
// Genera una "carpeta" fake en modo demo (en realidad solo un id sintético).
function demoFolderId(opts: { edificio: string; objetivo: string }): string {
  return `demo-${opts.edificio}-${opts.objetivo}`.replace(/\s+/g, "_").toLowerCase();
}

export async function ensureTareaFolder(opts: {
  edificio: string;
  objetivo: string;
  fecha?: Date;
}): Promise<string> {
  if (isDemoMode()) return demoFolderId(opts);
  const fecha = opts.fecha ?? new Date();
  const root = getDriveRootFolderId();
  const tareas = await ensureFolder("Tareas", root);
  const edificio = await ensureFolder(opts.edificio, tareas);
  const mes = await ensureFolder(yearMonthArgentina(fecha), edificio);
  const objetivoSanit = sanitizeObjetivo(opts.objetivo) || "tarea";
  const ts = timestampArgentina(fecha);
  const tareaFolder = await ensureFolder(`${ts}_${objetivoSanit}`, mes);
  return tareaFolder;
}

export interface UploadResult {
  fileId: string;
  url: string;
  name: string;
}

export async function uploadFile(opts: {
  buffer: Buffer;
  name: string;
  mimeType: string;
  folderId: string;
}): Promise<UploadResult> {
  if (isDemoMode()) {
    // En demo no subimos a Drive; devolvemos una URL fake con un id sintético.
    const fakeId = `demo-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    return {
      fileId: fakeId,
      name: opts.name,
      url: `https://drive.google.com/file/d/${fakeId}/view`,
    };
  }
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
  });

  const fileId = created.data.id;
  if (!fileId) throw new Error("Drive no retornó fileId");

  // Hacer el archivo accesible públicamente con la URL.
  await drive.permissions.create({
    fileId,
    requestBody: { role: "reader", type: "anyone" },
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
  await getDrive().files.delete({ fileId });
}
