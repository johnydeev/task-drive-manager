import { z } from "zod";

export const estadoEnum = z.enum(["Pendiente", "En Proceso", "Realizado"]);
export const prioridadEnum = z.enum(["Alta", "Media", "Baja"]);
export const rolEnum = z.enum(["admin", "supervisor"]);

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}/, "Fecha en formato ISO requerida");

// Crear nueva tarea — el Dpto/Parte común siempre es obligatorio: si parteComun=false
// hay que elegir un dpto; si parteComun=true hay que elegir una parte común.
export const tareaNuevaSchema = z
  .object({
    // Generado por el cliente (timestamp ISO) para alinear la tarea con su carpeta de Drive.
    rowId: z.string().optional(),
    objetivo: z.string().min(1, "Objetivo requerido"),
    fechaInicio: isoDate,
    fechaEstimada: isoDate,
    edificio: z.string().min(1, "Edificio requerido"),
    parteComun: z.boolean(),
    dpto: z.string().optional(),
    informe: z.string().min(1, "Informe requerido"),
    imagenes: z.array(z.string().url()).optional().default([]),
    videos: z.array(z.string().url()).optional().default([]),
    documentos: z.array(z.string().url()).optional().default([]),
    proveedor: z.string().optional(),
    estado: estadoEnum.optional().default("Pendiente"),
    presupuesto: z.number().nonnegative().optional(),
    prioridad: prioridadEnum,
  })
  .superRefine((d, ctx) => {
    if (!d.dpto || d.dpto.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dpto"],
        message: d.parteComun ? "Seleccioná una parte común" : "Seleccioná un dpto",
      });
    }
  });

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
