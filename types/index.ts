// Tipos centrales del dominio. Coinciden con la estructura de columnas de la Google Sheet.

export type Rol = "admin" | "supervisor";

export type EstadoTarea = "Pendiente" | "En Proceso" | "Realizado";

export type Prioridad = "Alta" | "Media" | "Baja";

export interface Edificio {
  nombre: string;
  cuit?: string | null;
}

export interface Dpto {
  idDpto: string;
  dpto: string;
  edificioRef: string;
}

export interface Usuario {
  email: string;
  nombre: string;
  rol: Rol;
  activo: boolean;
  creadoEn: string; // ISO datetime
}

// Estructura de una tarea según hoja "Ingreso de Pendiente".
// El rowId es interno (índice de fila en la Sheet) — no se expone al usuario.
export interface Tarea {
  rowId: string; // timestamp ISO generado al crear, primera columna
  rowNumber?: number; // número de fila en la Sheet (para updates)
  objetivo: string;
  fechaInicio: string; // ISO date
  fechaEstimada: string; // ISO date
  edificio: string;
  parteComun: boolean;
  dpto: string; // si parteComun=true, valor = "Parte Común"
  informe: string;
  comentarioEnProceso?: string;
  comentarioRealizado?: string;
  imagenes: string[];    // URLs públicas de Drive
  videos: string[];      // URLs públicas de Drive
  documentos: string[];  // URLs públicas de Drive (PDFs adjuntos: facturas, presupuestos, planos)
  reporteUrl?: string;   // URL del PDF de reporte generado por la app
  proveedor?: string;
  estado: EstadoTarea;
  presupuesto?: number;
  fechaRealizado?: string; // ISO date
  prioridad: Prioridad;
  supervisor: string; // email del usuario que la creó/asignó
}

// DTO para crear una tarea desde el cliente.
export type TareaNuevaInput = Omit<
  Tarea,
  "rowId" | "rowNumber" | "comentarioEnProceso" | "comentarioRealizado" | "fechaRealizado" | "supervisor" | "reporteUrl"
> & {
  imagenes?: string[];
  videos?: string[];
  documentos?: string[];
};

// DTO para edición (todos los campos opcionales excepto rowId).
export type TareaUpdateInput = Partial<Omit<Tarea, "rowId" | "rowNumber">> & {
  rowId: string;
};

export interface Configuracion {
  maxImagenes: number;
  maxVideos: number;
  maxDocumentos: number;
  maxSizeImagenMB: number;
  maxSizeVideoMB: number;
  maxSizePdfMB: number;
}

export const CONFIGURACION_DEFAULT: Configuracion = {
  maxImagenes: 10,
  maxVideos: 3,
  maxDocumentos: 5,
  maxSizeImagenMB: 10,
  maxSizeVideoMB: 100,
  maxSizePdfMB: 20,
};

// Tarea pendiente de sync (vive en IndexedDB).
export interface TareaPendiente extends TareaNuevaInput {
  localId: string;
  pendingSync: boolean;
  createdAt: string; // ISO datetime
  retries: number;
  sheetRowId?: string; // se setea al sincronizar
}
