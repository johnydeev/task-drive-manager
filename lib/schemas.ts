import { z } from "zod";

export const estadoEnum = z.enum(["Pendiente", "En Proceso", "Realizado"]);
export const prioridadEnum = z.enum(["Alta", "Media", "Baja"]);
export const rolEnum = z.enum(["admin", "supervisor"]);

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}/, "Fecha en formato ISO requerida");

// Regla compartida: el Dpto/Parte común siempre es obligatorio. Si parteComun=false
// hay que elegir un dpto; si parteComun=true, una parte común. Vive UNA sola vez y la
// usan tanto el schema del servidor (tareaNuevaSchema) como el del form (tareaFormSchema),
// para que la validación no pueda divergir entre cliente y servidor.
function dptoRequiredRefine(
  d: { dpto?: string; parteComun?: boolean },
  ctx: z.RefinementCtx
) {
  if (!d.dpto || d.dpto.trim().length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["dpto"],
      message: d.parteComun ? "Seleccioná una parte común" : "Seleccioná un dpto",
    });
  }
}

// Campos base de una tarea, compartidos entre el form del cliente y el POST del servidor.
// `estado` NO va acá: el servidor lo acepta opcional con default, pero el form siempre lo
// provee (requerido) — mezclarlos rompe el tipado de react-hook-form (input ≠ output).
const tareaBaseFields = {
  objetivo: z.string().min(1, "Objetivo requerido"),
  fechaInicio: isoDate,
  fechaEstimada: isoDate,
  edificio: z.string().min(1, "Edificio requerido"),
  parteComun: z.boolean(),
  dpto: z.string().optional(),
  informe: z.string().min(1, "Informe requerido"),
  proveedor: z.string().optional(),
  presupuesto: z.number().nonnegative().optional(),
  prioridad: prioridadEnum,
};

// Crear nueva tarea (servidor). Suma rowId + arrays de URLs de adjuntos.
export const tareaNuevaSchema = z
  .object({
    // Generado por el cliente (timestamp ISO) para alinear la tarea con su carpeta de Drive.
    rowId: z.string().optional(),
    ...tareaBaseFields,
    estado: estadoEnum.optional().default("Pendiente"),
    imagenes: z.array(z.string().url()).optional().default([]),
    videos: z.array(z.string().url()).optional().default([]),
    documentos: z.array(z.string().url()).optional().default([]),
  })
  .superRefine(dptoRequiredRefine);

// Form del cliente. Mismos campos base + comentarios de edición; sin rowId ni arrays
// de adjuntos (esos los maneja el componente por separado). Comparte la regla del dpto.
export const tareaFormSchema = z
  .object({
    ...tareaBaseFields,
    estado: estadoEnum,
    comentarioEnProceso: z.string().optional(),
    comentarioRealizado: z.string().optional(),
  })
  .superRefine(dptoRequiredRefine);

export const tareaUpdateSchema = z
  .object({
    objetivo: z.string().min(1).optional(),
    fechaInicio: isoDate.optional(),
    fechaEstimada: isoDate.optional(),
    edificio: z.string().min(1).optional(),
    parteComun: z.boolean().optional(),
    dpto: z.string().optional(),
    informe: z.string().optional(),
    comentarioEnProceso: z.string().optional(),
    comentarioRealizado: z.string().optional(),
    imagenes: z.array(z.string().url()).optional(),
    videos: z.array(z.string().url()).optional(),
    documentos: z.array(z.string().url()).optional(),
    proveedor: z.string().optional(),
    estado: estadoEnum.optional(),
    presupuesto: z.number().nonnegative().optional(),
    fechaRealizado: isoDate.optional(),
    prioridad: prioridadEnum.optional(),
  })
  .superRefine((d, ctx) => {
    // En edición los campos son parciales. Solo validamos el dpto cuando viene incluido
    // (o cuando se está cambiando parteComun): en ese caso no puede quedar vacío.
    if (d.dpto !== undefined || d.parteComun !== undefined) {
      const vacio = !d.dpto || d.dpto.trim().length === 0;
      if (vacio) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["dpto"],
          message: d.parteComun ? "Seleccioná una parte común" : "Seleccioná un dpto",
        });
      }
    }
  });

export const tareaPatchEstadoSchema = z.object({
  estado: estadoEnum,
  comentarioEnProceso: z.string().optional(),
  comentarioRealizado: z.string().optional(),
});

export const usuarioNuevoSchema = z.object({
  email: z.string().email().transform((e) => e.toLowerCase()),
  nombre: z.string().min(1),
  rol: rolEnum,
  activo: z.boolean().optional().default(true),
});

export const usuarioPatchSchema = z.object({
  activo: z.boolean(),
});

export const configuracionSchema = z.object({
  maxImagenes: z.number().int().min(1),
  maxVideos: z.number().int().min(0),
  maxDocumentos: z.number().int().min(0),
  maxSizeImagenMB: z.number().positive(),
  maxSizeVideoMB: z.number().positive(),
  maxSizePdfMB: z.number().positive(),
});

// Directiva que el admin crea/asigna a un integrante. Reusa isoDate.
export const directivaNuevaSchema = z.object({
  descripcion: z.string().min(1, "Descripción requerida"),
  fecha: isoDate,
  asignadoA: z.string().email().transform((e) => e.toLowerCase()),
});

// Asignación organizativa usuario↔edificio.
export const asignacionSchema = z.object({
  email: z.string().email().transform((e) => e.toLowerCase()),
  edificio: z.string().min(1, "Edificio requerido"),
});
