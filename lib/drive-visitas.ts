// Archivos de Drive de la feature Visitas (y las firmas de usuario).
// Separado de lib/google-drive.ts, que quedaba por encima del límite de 400 líneas
// del repo: ese módulo se ocupa del árbol de Tareas, éste del de Visitas.

import { getDriveRootFolderId } from "./google-auth";
import { isDemoMode } from "./demo-mode";
import {
  getDrive,
  ensureFolder,
  uploadFile,
  extFor,
  nextIndex,
  pad2,
  sanitizeSegment,
  nombreArchivoVisita,
  type UploadResult,
} from "./google-drive";
// Carpeta de visitas del consorcio: {raíz}/Visitas/{Edificio}/
// Rama propia, hermana de "Tareas": las visitas quedan todas juntas y separadas del
// árbol de tareas (por año y mes), que responde a otra lógica.
export async function ensureVisitasFolder(edificio: string): Promise<string> {
  if (isDemoMode()) return `demo-visitas-${edificio}`.replace(/\s+/g, "_").toLowerCase();
  const root = getDriveRootFolderId();
  const visitas = await ensureFolder("Visitas", root);
  return ensureFolder(sanitizeSegment(edificio) || "Sin edificio", visitas);
}

// Busca el primer número de copia libre para el nombre del PDF.
async function proximaCopia(folderId: string, edificio: string, fechaISO: string): Promise<number> {
  const drive = getDrive();
  for (let copia = 1; copia <= 50; copia++) {
    const nombre = nombreArchivoVisita(edificio, fechaISO, copia).replace(/'/g, "\'");
    const found = await drive.files.list({
      q: `name='${nombre}' and '${folderId}' in parents and trashed=false`,
      fields: "files(id)",
      spaces: "drive",
      pageSize: 1,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    if (!found.data.files?.length) return copia;
  }
  return 51;
}

// Sube el PDF de una visita a la carpeta Visitas del consorcio, con el nombre definitivo.
export async function uploadVisitaPdf(opts: {
  buffer: Buffer;
  edificio: string;
  fechaISO: string;
}): Promise<UploadResult> {
  if (isDemoMode()) {
    const fakeId = `demo-visita-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    return {
      fileId: fakeId,
      name: nombreArchivoVisita(opts.edificio, opts.fechaISO),
      url: `https://drive.google.com/file/d/${fakeId}/view`,
    };
  }
  const folderId = await ensureVisitasFolder(opts.edificio);
  const copia = await proximaCopia(folderId, opts.edificio, opts.fechaISO);
  const name = nombreArchivoVisita(opts.edificio, opts.fechaISO, copia);
  return uploadFile({ buffer: opts.buffer, name, mimeType: "application/pdf", folderId });
}

// Sube una foto de visita a la misma carpeta, numerada. El PDF después la embebe por URL.
export async function uploadVisitaFoto(opts: {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  edificio: string;
}): Promise<UploadResult> {
  const ext = extFor(opts.originalName, opts.mimeType);
  if (isDemoMode()) {
    const fakeId = `demo-visita-foto-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    return {
      fileId: fakeId,
      name: `foto-01${ext}`,
      url: `https://drive.google.com/file/d/${fakeId}/view`,
    };
  }
  const folderId = await ensureVisitasFolder(opts.edificio);
  const nn = await nextIndex(folderId);
  return uploadFile({
    buffer: opts.buffer,
    name: `foto-${pad2(nn)}${ext}`,
    mimeType: opts.mimeType,
    folderId,
  });
}

// Agrupa el PDF de una visita y sus fotos en una carpeta propia, dentro de la carpeta
// del consorcio. La carpeta lleva el mismo nombre que el PDF (sin extensión).
//
// Se hace DESPUÉS de subir todo porque las fotos se suben apenas se eligen, cuando el
// nombre del PDF todavía no existe (depende de la fecha y del número de copia). Mover un
// archivo en Drive no cambia su link, así que las URLs ya guardadas siguen sirviendo.
export async function agruparVisitaEnCarpeta(opts: {
  edificio: string;
  nombreCarpeta: string;
  fileIds: string[];
}): Promise<string> {
  if (isDemoMode()) return `demo-carpeta-${opts.nombreCarpeta}`;
  const padre = await ensureVisitasFolder(opts.edificio);
  const carpeta = await ensureFolder(opts.nombreCarpeta, padre);
  for (const fileId of opts.fileIds) {
    await getDrive().files.update({
      fileId,
      addParents: carpeta,
      removeParents: padre,
      supportsAllDrives: true,
    });
  }
  return carpeta;
}

// Baja un archivo de Drive por su id. Lo usa el endpoint que sirve el PDF de una visita
// desde nuestro propio origen: el navegador no puede hacer fetch directo a Drive (CORS),
// y sin el archivo en mano no se puede compartir como adjunto ni renombrar la descarga.
export async function descargarArchivo(
  fileId: string
): Promise<{ buffer: Buffer; nombre: string; mimeType: string }> {
  const drive = getDrive();
  const meta = await drive.files.get({
    fileId,
    fields: "name, mimeType",
    supportsAllDrives: true,
  });
  const contenido = await drive.files.get(
    { fileId, alt: "media", supportsAllDrives: true },
    { responseType: "arraybuffer" }
  );
  return {
    buffer: Buffer.from(contenido.data as ArrayBuffer),
    nombre: meta.data.name ?? "archivo.pdf",
    mimeType: meta.data.mimeType ?? "application/pdf",
  };
}

// Sube la firma de un usuario a {raíz}/_Firmas/.
export async function uploadFirma(opts: {
  buffer: Buffer;
  mimeType: string;
  email: string;
}): Promise<UploadResult> {
  if (isDemoMode()) {
    const fakeId = `demo-firma-${Date.now()}`;
    return {
      fileId: fakeId,
      name: "firma.png",
      url: `https://drive.google.com/file/d/${fakeId}/view`,
    };
  }
  const root = getDriveRootFolderId();
  const firmas = await ensureFolder("_Firmas", root);
  const name = `${sanitizeSegment(opts.email) || "firma"}-${Date.now()}.png`;
  return uploadFile({ buffer: opts.buffer, name, mimeType: opts.mimeType, folderId: firmas });
}
