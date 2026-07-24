"use client";

import { useRef, useState } from "react";
import imageCompression from "browser-image-compression";
import { api } from "@/lib/api-client";
import { thumbUrl } from "@/lib/drive-url";
import {
  formatMB,
  limiteMB,
  mensajeArchivoPesado,
  mensajeErrorSubida,
  pesoMB,
} from "@/lib/upload-limits";
import type { Configuracion } from "@/types";
import {
  Camera,
  FileText,
  Film,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  Trash2,
  Upload,
  Video,
} from "lucide-react";

interface Props {
  edificio: string;
  objetivo: string;
  dpto: string; // ubicación: dpto o parte común — forma parte del nombre de la carpeta en Drive
  rowId: string; // id estable de la tarea — agrupa todos los archivos en una sola carpeta
  config: Configuracion;
  imagenes: string[];
  videos: string[];
  documentos: string[];
  onChange: (next: { imagenes: string[]; videos: string[]; documentos: string[] }) => void;
  disabled?: boolean;
}

const IMAGE_MIMES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const VIDEO_MIMES = ["video/mp4", "video/quicktime"];
const PDF_MIMES = ["application/pdf"];

export function FileUploader({
  edificio,
  objetivo,
  dpto,
  rowId,
  config,
  imagenes,
  videos,
  documentos,
  onChange,
  disabled,
}: Props) {
  // Inputs separados para cámara (capture) y galería/archivos (sin capture),
  // así el usuario elige entre tomar/grabar en el momento o buscar en el teléfono.
  const imgCameraInput = useRef<HTMLInputElement | null>(null);
  const imgGalleryInput = useRef<HTMLInputElement | null>(null);
  const vidCameraInput = useRef<HTMLInputElement | null>(null);
  const vidBrowseInput = useRef<HTMLInputElement | null>(null);
  const docInput = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // URLs subidas en ESTA sesión (no las que ya venían de una tarea en edición).
  // Solo estas se mandan a papelera de Drive al eliminar la preview.
  const uploadedThisSession = useRef<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<string | null>(null);

  const imgFull = imagenes.length >= config.maxImagenes;
  const vidFull = videos.length >= config.maxVideos;
  const docFull = documentos.length >= config.maxDocumentos;
  const canUpload = !!edificio && !!objetivo && !!dpto;

  const handleFiles = async (files: FileList | null, kind: "imagen" | "video" | "documento") => {
    if (!files || files.length === 0) return;
    if (!canUpload) {
      setError("Completá edificio, objetivo y la ubicación (dpto/parte común) antes de subir archivos");
      return;
    }
    setError(null);
    setBusy(true);

    // Archivo que está viajando ahora mismo: si el fetch se cae sin respuesta, el catch
    // necesita saber qué era y cuánto pesaba para dar un mensaje útil.
    let enVuelo: { kind: typeof kind; size: number } | null = null;

    try {
      const newImgs = [...imagenes];
      const newVids = [...videos];
      const newDocs = [...documentos];

      for (const raw of Array.from(files)) {
        const isImage = IMAGE_MIMES.includes(raw.type);
        const isVideo = VIDEO_MIMES.includes(raw.type);
        const isPdf = PDF_MIMES.includes(raw.type);

        if (kind === "imagen" && !isImage) {
          setError(`Tipo no permitido para imagen: ${raw.type}`);
          continue;
        }
        if (kind === "video" && !isVideo) {
          setError(`Tipo no permitido para video: ${raw.type}`);
          continue;
        }
        if (kind === "documento" && !isPdf) {
          setError(`Tipo no permitido para documento: ${raw.type}`);
          continue;
        }

        if (kind === "imagen" && newImgs.length >= config.maxImagenes) break;
        if (kind === "video" && newVids.length >= config.maxVideos) break;
        if (kind === "documento" && newDocs.length >= config.maxDocumentos) break;

        let file = raw;
        if (isImage) {
          // Compresión en cliente: max 1200px, calidad 80%.
          file = await imageCompression(raw, {
            maxWidthOrHeight: 1200,
            initialQuality: 0.8,
            useWebWorker: true,
            maxSizeMB: config.maxSizeImagenMB,
          });
        }

        // Cortamos acá, antes de gastar datos del celular: el límite es el de la hoja
        // Configuracion, topeado por lo que la infra puede transportar (ver upload-limits).
        // Para las imágenes se mide el archivo YA comprimido, que es el que viaja.
        const limite = limiteMB(kind, config);
        if (pesoMB(file.size) > limite) {
          setError(mensajeArchivoPesado(kind, file.size, limite));
          continue;
        }

        enVuelo = { kind, size: file.size };
        const result = await api.upload(file, edificio, objetivo, dpto, rowId);
        enVuelo = null;
        if (result.kind === "imagen") newImgs.push(result.url);
        else if (result.kind === "video") newVids.push(result.url);
        else newDocs.push(result.url);
        uploadedThisSession.current.add(result.url);
      }

      onChange({ imagenes: newImgs, videos: newVids, documentos: newDocs });
    } catch (e) {
      setError(
        enVuelo
          ? mensajeErrorSubida(e, enVuelo.kind, enVuelo.size)
          : e instanceof Error
            ? e.message
            : "Error al subir archivo"
      );
    } finally {
      setBusy(false);
      // Limpiar inputs para permitir reselección del mismo archivo.
      if (imgCameraInput.current) imgCameraInput.current.value = "";
      if (imgGalleryInput.current) imgGalleryInput.current.value = "";
      if (vidCameraInput.current) vidCameraInput.current.value = "";
      if (vidBrowseInput.current) vidBrowseInput.current.value = "";
      if (docInput.current) docInput.current.value = "";
    }
  };

  // Si la URL se subió en esta sesión, mandarla a papelera de Drive antes de sacarla
  // del array (evita dejar el archivo huérfano al borrar la preview antes de crear).
  // Las URLs iniciales (edición) no se tocan en Drive hasta guardar.
  const trashIfSession = async (url: string): Promise<boolean> => {
    if (!uploadedThisSession.current.has(url)) return true;
    setDeleting(url);
    setError(null);
    try {
      await api.upload.remove(url);
      uploadedThisSession.current.delete(url);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo borrar el archivo de Drive");
      return false;
    } finally {
      setDeleting(null);
    }
  };

  const removeImagen = async (url: string) => {
    if (!(await trashIfSession(url))) return;
    onChange({ imagenes: imagenes.filter((u) => u !== url), videos, documentos });
  };
  const removeVideo = async (url: string) => {
    if (!(await trashIfSession(url))) return;
    onChange({ imagenes, videos: videos.filter((u) => u !== url), documentos });
  };
  const removeDocumento = async (url: string) => {
    if (!(await trashIfSession(url))) return;
    onChange({ imagenes, videos, documentos: documentos.filter((u) => u !== url) });
  };

  return (
    <div className="space-y-3">
      {/* Imagen: cámara (capture) vs galería (sin capture) */}
      <input
        ref={imgCameraInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        hidden
        onChange={(e) => handleFiles(e.target.files, "imagen")}
      />
      <input
        ref={imgGalleryInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        onChange={(e) => handleFiles(e.target.files, "imagen")}
      />
      {/* Video: grabar (capture) vs buscar en el teléfono (sin capture) */}
      <input
        ref={vidCameraInput}
        type="file"
        accept="video/mp4,video/quicktime"
        capture="environment"
        hidden
        onChange={(e) => handleFiles(e.target.files, "video")}
      />
      <input
        ref={vidBrowseInput}
        type="file"
        accept="video/mp4,video/quicktime"
        hidden
        onChange={(e) => handleFiles(e.target.files, "video")}
      />
      <input
        ref={docInput}
        type="file"
        accept="application/pdf"
        multiple
        hidden
        onChange={(e) => handleFiles(e.target.files, "documento")}
      />

      <div className="space-y-3">
        {/* Imágenes */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-slate-600">
            Imágenes ({imagenes.length}/{config.maxImagenes})
            <span className="font-normal text-slate-500"> · máx {formatMB(limiteMB("imagen", config))} c/u</span>
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={disabled || busy || imgFull || !canUpload}
              onClick={() => imgCameraInput.current?.click()}
              className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm font-medium text-slate-700 disabled:opacity-50"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
              Tomar foto
            </button>
            <button
              type="button"
              disabled={disabled || busy || imgFull || !canUpload}
              onClick={() => imgGalleryInput.current?.click()}
              className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm font-medium text-slate-700 disabled:opacity-50"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16} />}
              Galería
            </button>
          </div>
        </div>

        {/* Videos */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-slate-600">
            Videos ({videos.length}/{config.maxVideos})
            <span className="font-normal text-slate-500"> · máx {formatMB(limiteMB("video", config))} c/u</span>
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={disabled || busy || vidFull || !canUpload}
              onClick={() => vidCameraInput.current?.click()}
              className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm font-medium text-slate-700 disabled:opacity-50"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Video size={16} />}
              Grabar
            </button>
            <button
              type="button"
              disabled={disabled || busy || vidFull || !canUpload}
              onClick={() => vidBrowseInput.current?.click()}
              className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm font-medium text-slate-700 disabled:opacity-50"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <FolderOpen size={16} />}
              Buscar
            </button>
          </div>
        </div>

        {/* Documentos */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-slate-600">
            Documentos ({documentos.length}/{config.maxDocumentos})
            <span className="font-normal text-slate-500"> · máx {formatMB(limiteMB("documento", config))} c/u</span>
          </p>
          <button
            type="button"
            disabled={disabled || busy || docFull || !canUpload}
            onClick={() => docInput.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm font-medium text-slate-700 disabled:opacity-50"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
            Adjuntar PDF
          </button>
        </div>
      </div>

      {!canUpload && (
        <p className="text-xs text-slate-500 flex items-center gap-1">
          <Upload size={12} /> Completá Edificio, Objetivo y la ubicación (dpto/parte común) para habilitar subida.
        </p>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {imagenes.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {imagenes.map((url) => (
            <div key={url} className="relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={thumbUrl(url)} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => removeImagen(url)}
                disabled={busy || deleting === url}
                className="absolute top-1 right-1 rounded-full bg-white/90 p-1 text-red-600 shadow disabled:opacity-50"
                aria-label="Eliminar imagen"
              >
                {deleting === url ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              </button>
            </div>
          ))}
        </div>
      )}

      {videos.length > 0 && (
        <ul className="space-y-1">
          {videos.map((url) => (
            <li key={url} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
              <span className="flex items-center gap-2 truncate text-slate-700">
                <Film size={14} />
                <a href={url} target="_blank" rel="noreferrer" className="underline truncate">
                  Video adjunto
                </a>
              </span>
              <button
                type="button"
                onClick={() => removeVideo(url)}
                disabled={busy || deleting === url}
                className="text-red-600 disabled:opacity-50"
                aria-label="Eliminar video"
              >
                {deleting === url ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              </button>
            </li>
          ))}
        </ul>
      )}

      {documentos.length > 0 && (
        <ul className="space-y-1">
          {documentos.map((url) => (
            <li key={url} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 truncate text-slate-700 underline"
              >
                <FileText size={14} />
                Documento adjunto
              </a>
              <button
                type="button"
                onClick={() => removeDocumento(url)}
                disabled={busy || deleting === url}
                className="text-red-600 disabled:opacity-50"
                aria-label="Eliminar documento"
              >
                {deleting === url ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
