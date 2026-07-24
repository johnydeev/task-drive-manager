"use client";

import { useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { FileUploader } from "./FileUploader";
import type { Configuracion, Tarea } from "@/types";

export interface MediaStaging {
  imagenes: string[];
  videos: string[];
  documentos: string[];
}

const EMPTY: MediaStaging = { imagenes: [], videos: [], documentos: [] };

// Sección "Agregar archivos" del detalle, para el asignado (En Proceso / Objetada).
// Solo AGREGA: arranca con arrays vacías, así el FileUploader nunca muestra ni deja borrar
// la media ya guardada de la tarea. Los archivos se suben a Drive al elegirlos (staging) y
// se adjuntan a la tarea recién al tocar "Guardar archivos".
export function AgregarArchivos({
  tarea,
  config,
  guardando,
  onGuardar,
}: {
  tarea: Tarea;
  config: Configuracion;
  guardando: boolean;
  onGuardar: (media: MediaStaging) => void;
}) {
  const [nuevos, setNuevos] = useState<MediaStaging>(EMPTY);

  const hayNuevos =
    nuevos.imagenes.length > 0 || nuevos.videos.length > 0 || nuevos.documentos.length > 0;

  return (
    <div className="space-y-3">
      <FileUploader
        edificio={tarea.edificio}
        objetivo={tarea.objetivo}
        dpto={tarea.dpto}
        rowId={tarea.rowId}
        config={config}
        imagenes={nuevos.imagenes}
        videos={nuevos.videos}
        documentos={nuevos.documentos}
        onChange={setNuevos}
        disabled={guardando}
      />
      <button
        type="button"
        disabled={!hayNuevos || guardando}
        onClick={() => onGuardar(nuevos)}
        className="flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50 disabled:hover:bg-slate-900"
      >
        {guardando ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
        Guardar archivos
      </button>
    </div>
  );
}
