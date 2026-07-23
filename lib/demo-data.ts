// Datos hardcoded para el modo demo. No tocan Google Sheets ni Drive.
// Las funciones devuelven copias frescas para que las mutaciones no afecten otras requests.

import type {
  Configuracion,
  Dpto,
  Edificio,
  Tarea,
  Usuario,
} from "@/types";

const EDIFICIOS: Edificio[] = [
  { nombre: "Av. de Mayo 1316" },
  { nombre: "Jufré 21" },
  { nombre: "Sarmiento 845" },
  { nombre: "Av. Corrientes 1234" },
  { nombre: "Lavalle 567" },
];

const DPTOS: Dpto[] = [
  // Av. de Mayo 1316
  { idDpto: "1316-1A", dpto: "1°A", edificioRef: "Av. de Mayo 1316" },
  { idDpto: "1316-1B", dpto: "1°B", edificioRef: "Av. de Mayo 1316" },
  { idDpto: "1316-2A", dpto: "2°A", edificioRef: "Av. de Mayo 1316" },
  { idDpto: "1316-PB", dpto: "PB", edificioRef: "Av. de Mayo 1316" },
  // Jufré 21
  { idDpto: "j21-1", dpto: "1", edificioRef: "Jufré 21" },
  { idDpto: "j21-2", dpto: "2", edificioRef: "Jufré 21" },
  { idDpto: "j21-3", dpto: "3", edificioRef: "Jufré 21" },
  // Sarmiento 845
  { idDpto: "s845-A", dpto: "A", edificioRef: "Sarmiento 845" },
  { idDpto: "s845-B", dpto: "B", edificioRef: "Sarmiento 845" },
  { idDpto: "s845-C", dpto: "C", edificioRef: "Sarmiento 845" },
  // Av. Corrientes 1234
  { idDpto: "c1234-1", dpto: "1°", edificioRef: "Av. Corrientes 1234" },
  { idDpto: "c1234-2", dpto: "2°", edificioRef: "Av. Corrientes 1234" },
  // Lavalle 567
  { idDpto: "l567-A", dpto: "A", edificioRef: "Lavalle 567" },
  { idDpto: "l567-B", dpto: "B", edificioRef: "Lavalle 567" },
  // Parte Común — "edificio" virtual que lista las partes comunes posibles de
  // cualquier consorcio. Aparece cuando se tilda "Parte común del edificio".
  { idDpto: "pc-hall", dpto: "Hall de entrada", edificioRef: "Parte Común" },
  { idDpto: "pc-palier", dpto: "Palier", edificioRef: "Parte Común" },
  { idDpto: "pc-escalera", dpto: "Escalera", edificioRef: "Parte Común" },
  { idDpto: "pc-terraza", dpto: "Terraza", edificioRef: "Parte Común" },
  { idDpto: "pc-cochera", dpto: "Cochera", edificioRef: "Parte Común" },
  { idDpto: "pc-sum", dpto: "SUM", edificioRef: "Parte Común" },
  { idDpto: "pc-tanque", dpto: "Tanque de agua", edificioRef: "Parte Común" },
  { idDpto: "pc-ascensor", dpto: "Ascensor", edificioRef: "Parte Común" },
  { idDpto: "pc-fachada", dpto: "Fachada", edificioRef: "Parte Común" },
];

// Proveedores demo — en producción salen de la hoja `_Proveedores` externa.
const PROVEEDORES: string[] = [
  "Ascensores Cóndor",
  "Electricista Matriculado SA",
  "Pinturería del Centro",
  "Plomería 24h",
  "Termo Service SRL",
];

const USUARIOS: Usuario[] = [
  {
    email: "demo@morinigo.local",
    nombre: "Demo Admin",
    rol: "admin",
    activo: true,
    creadoEn: "2026-01-15T10:00:00.000Z",
  },
  {
    email: "carlos.gomez@morinigo.local",
    nombre: "Carlos Gómez",
    rol: "supervisor",
    activo: true,
    creadoEn: "2026-02-10T14:30:00.000Z",
  },
  {
    email: "maria.lopez@morinigo.local",
    nombre: "María López",
    rol: "supervisor",
    activo: true,
    creadoEn: "2026-03-05T09:15:00.000Z",
  },
  {
    email: "pedro.ramirez@morinigo.local",
    nombre: "Pedro Ramírez",
    rol: "supervisor",
    activo: false,
    creadoEn: "2026-01-22T16:45:00.000Z",
  },
];

const TAREAS: Tarea[] = [
  {
    rowId: "2026-05-28T14:30:22.000Z",
    rowNumber: 2,
    objetivo: "Pintura exterior fachada",
    fechaInicio: "2026-05-28",
    fechaEstimada: "2026-06-15",
    edificio: "Av. de Mayo 1316",
    parteComun: true,
    dpto: "Parte Común",
    informe: "Repintar toda la fachada que da a la avenida. Hay zonas con humedad y pintura descascarada.",
    comentarioEnProceso: "Andamios montados. Empezamos por el frente.",
    imagenes: [],
    videos: [],
    documentos: ["https://drive.google.com/file/d/demo-presupuesto-pintureria/view"],
    proveedor: "Pinturería del Centro",
    estado: "En Proceso",
    presupuesto: 850000,
    prioridad: "Alta",
    supervisor: "carlos.gomez@morinigo.local",
  },
  {
    rowId: "2026-05-20T09:15:00.000Z",
    rowNumber: 3,
    objetivo: "Reparación caldera",
    fechaInicio: "2026-05-20",
    fechaEstimada: "2026-05-25",
    edificio: "Jufré 21",
    parteComun: true,
    dpto: "Parte Común",
    informe: "Caldera principal con fallas intermitentes en el quemador.",
    comentarioRealizado: "Reemplazado el quemador y la válvula de gas. Probado por 24h.",
    imagenes: [],
    videos: [],
    documentos: ["https://drive.google.com/file/d/demo-factura-termoservice/view"],
    reporteUrl: "https://drive.google.com/file/d/demo-reporte-caldera/view",
    proveedor: "Termo Service SRL",
    estado: "Realizada",
    presupuesto: 320000,
    fechaRealizado: "2026-05-24",
    prioridad: "Alta",
    supervisor: "maria.lopez@morinigo.local",
  },
  {
    rowId: "2026-06-01T11:00:00.000Z",
    rowNumber: 4,
    objetivo: "Cambio de cerradura",
    fechaInicio: "2026-06-01",
    fechaEstimada: "2026-06-03",
    edificio: "Sarmiento 845",
    parteComun: false,
    dpto: "B",
    informe: "Inquilino del dpto B reporta que la cerradura no traba bien. Posible intento de violación.",
    imagenes: [],
    videos: [],
    documentos: [],
    estado: "Sin asignar",
    prioridad: "Alta",
    supervisor: "demo@morinigo.local",
  },
  {
    rowId: "2026-05-15T16:20:00.000Z",
    rowNumber: 5,
    objetivo: "Mantenimiento ascensor",
    fechaInicio: "2026-05-15",
    fechaEstimada: "2026-05-20",
    edificio: "Av. Corrientes 1234",
    parteComun: true,
    dpto: "Parte Común",
    informe: "Mantenimiento mensual programado del ascensor principal.",
    comentarioRealizado: "Cambio de aceite y revisión de cables. Todo OK.",
    imagenes: [],
    videos: [],
    documentos: [],
    proveedor: "Ascensores Cóndor",
    estado: "Realizada",
    presupuesto: 95000,
    fechaRealizado: "2026-05-18",
    prioridad: "Media",
    supervisor: "carlos.gomez@morinigo.local",
  },
  {
    rowId: "2026-06-02T10:45:00.000Z",
    rowNumber: 6,
    objetivo: "Limpieza tanque agua",
    fechaInicio: "2026-06-02",
    fechaEstimada: "2026-06-10",
    edificio: "Lavalle 567",
    parteComun: true,
    dpto: "Parte Común",
    informe: "Limpieza semestral obligatoria del tanque de reserva.",
    imagenes: [],
    videos: [],
    documentos: [],
    estado: "Sin asignar",
    presupuesto: 45000,
    prioridad: "Media",
    supervisor: "maria.lopez@morinigo.local",
  },
  {
    rowId: "2026-05-30T13:00:00.000Z",
    rowNumber: 7,
    objetivo: "Goteo en cocina",
    fechaInicio: "2026-05-30",
    fechaEstimada: "2026-06-05",
    edificio: "Av. de Mayo 1316",
    parteComun: false,
    dpto: "2°A",
    informe: "Pérdida en la canilla de la cocina, gotea constante.",
    comentarioEnProceso: "Plomero confirmó. Necesita cambiar la grifería completa.",
    imagenes: [],
    videos: [],
    documentos: [],
    proveedor: "Plomería 24h",
    estado: "En Proceso",
    presupuesto: 38000,
    prioridad: "Baja",
    supervisor: "demo@morinigo.local",
  },
  {
    rowId: "2026-04-22T08:30:00.000Z",
    rowNumber: 8,
    objetivo: "Pintura palier",
    fechaInicio: "2026-04-22",
    fechaEstimada: "2026-04-30",
    edificio: "Jufré 21",
    parteComun: true,
    dpto: "Parte Común",
    informe: "Pintura del palier de planta baja.",
    comentarioRealizado: "Terminado. Color blanco satinado en paredes y zócalos en gris.",
    imagenes: [],
    videos: [],
    documentos: [],
    proveedor: "Pinturería del Centro",
    estado: "Realizada",
    presupuesto: 220000,
    fechaRealizado: "2026-04-28",
    prioridad: "Baja",
    supervisor: "carlos.gomez@morinigo.local",
  },
  {
    rowId: "2026-06-03T09:00:00.000Z",
    rowNumber: 9,
    objetivo: "Revisión instalación eléctrica",
    fechaInicio: "2026-06-03",
    fechaEstimada: "2026-06-20",
    edificio: "Sarmiento 845",
    parteComun: true,
    dpto: "Parte Común",
    informe: "Revisión anual del tablero principal y disyuntores.",
    imagenes: [],
    videos: [],
    documentos: [],
    proveedor: "Electricista Matriculado SA",
    estado: "Sin asignar",
    presupuesto: 180000,
    prioridad: "Media",
    supervisor: "maria.lopez@morinigo.local",
  },
];

const CONFIG: Configuracion = {
  maxImagenes: 10,
  maxVideos: 3,
  maxDocumentos: 5,
  maxSizeImagenMB: 10,
  maxSizeVideoMB: 100,
  maxSizePdfMB: 20,
};

// =====================================================
// Estado mutable en memoria (sobrevive al request, no al restart del server)
// =====================================================

const state = {
  tareas: [...TAREAS],
  usuarios: [...USUARIOS],
  config: { ...CONFIG },
};

// Reset al estado original (útil para testing).
export function resetDemoState() {
  state.tareas = [...TAREAS];
  state.usuarios = [...USUARIOS];
  state.config = { ...CONFIG };
}

// =====================================================
// Lecturas
// =====================================================

export function getDemoEdificios(): Edificio[] {
  return [...EDIFICIOS];
}

export function getDemoDptos(edificio?: string): Dpto[] {
  return edificio ? DPTOS.filter((d) => d.edificioRef === edificio) : [...DPTOS];
}

export function getDemoProveedores(): string[] {
  return [...PROVEEDORES];
}

export function getDemoTareas(filters: {
  edificio?: string;
  estado?: string;
  prioridad?: string;
  supervisor?: string;
} = {}): Tarea[] {
  return state.tareas.filter((t) => {
    if (filters.edificio && t.edificio !== filters.edificio) return false;
    if (filters.estado && t.estado !== filters.estado) return false;
    if (filters.prioridad && t.prioridad !== filters.prioridad) return false;
    if (filters.supervisor && t.supervisor !== filters.supervisor) return false;
    return true;
  });
}

export function getDemoTareaById(rowId: string): Tarea | null {
  return state.tareas.find((t) => t.rowId === rowId) ?? null;
}

export function getDemoUsuarios(): Usuario[] {
  return [...state.usuarios];
}

export function getDemoConfig(): Configuracion {
  return { ...state.config };
}

// =====================================================
// Escrituras (mutan el estado en memoria)
// =====================================================

export function createDemoTarea(
  input: Omit<Tarea, "rowId" | "rowNumber" | "supervisor" | "reporteUrl">,
  supervisor: string
): Tarea {
  const nueva: Tarea = {
    ...input,
    documentos: input.documentos ?? [],
    rowId: new Date().toISOString(),
    rowNumber: state.tareas.length + 2,
    supervisor,
  };
  state.tareas.unshift(nueva);
  return nueva;
}

export function updateDemoTarea(rowId: string, patch: Partial<Tarea>): Tarea | null {
  const idx = state.tareas.findIndex((t) => t.rowId === rowId);
  if (idx === -1) return null;
  state.tareas[idx] = { ...state.tareas[idx], ...patch };
  return state.tareas[idx];
}

export function deleteDemoTarea(rowId: string): boolean {
  const idx = state.tareas.findIndex((t) => t.rowId === rowId);
  if (idx === -1) return false;
  state.tareas.splice(idx, 1);
  return true;
}

export function createDemoUsuario(input: Omit<Usuario, "creadoEn">): Usuario {
  const nuevo: Usuario = { ...input, creadoEn: new Date().toISOString() };
  state.usuarios.push(nuevo);
  return nuevo;
}

export function setDemoUsuarioActivo(email: string, activo: boolean): boolean {
  const u = state.usuarios.find((u) => u.email === email);
  if (!u) return false;
  u.activo = activo;
  return true;
}

export function updateDemoConfig(input: Configuracion): Configuracion {
  state.config = { ...input };
  return state.config;
}
