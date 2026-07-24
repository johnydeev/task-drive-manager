# SPEC — El asignado puede agregar archivos (En Proceso / Objetada)

**Fecha:** 2026-07-24
**Estado:** Propuesto (rev. 1)
**Autor:** equipo task-drive-manager
**Plan asociado:** [`../plans/2026-07-24-asignado-agregar-archivos.md`](../plans/2026-07-24-asignado-agregar-archivos.md)

## Objetivo

Que el **responsable** (asignado) de una tarea pueda **agregar** archivos multimedia
(imágenes, videos, PDFs) desde el detalle, mientras la tarea está **En Proceso** o **Objetada**
(los dos estados en que la tarea está en sus manos para trabajar o corregir tras una objeción).
Hoy solo el creador (al crear) o el admin (al editar) pueden adjuntar archivos.

**Alcance:** **solo agregar** (no borrar archivos ya guardados). El asignado puede descartar un
archivo que subió por error **antes de guardarlo** (staging), pero no toca la media existente.

## Contexto técnico (ya disponible)

- La media vive en la hoja hija `TareaArchivos` (1 fila por archivo); `getTareaPersistida`/`getTareaByRowId`
  ya devuelven las arrays `imagenes/videos/documentos`.
- `POST /api/upload` solo exige sesión (no admin) → el asignado **ya puede subir a Drive**.
- `updateTarea` sincroniza `TareaArchivos` cuando el input trae arrays de media (reemplazo total).
- El `FileUploader` (cámara/galería/grabar/PDF, compresión, límites) es reutilizable.

## Cambios

### Backend — nueva acción `agregarArchivos` en `PATCH /api/tareas/[id]`

- **Body:** `{ accion: "agregarArchivos", imagenes?: string[], videos?: string[], documentos?: string[] }`
  (URLs ya subidas a Drive). Nuevo `tareaAgregarArchivosSchema` (Zod: arrays de `string().url()` opcionales).
- **Permiso:** solo el **asignado** (403 si no).
- **Guard de estado (persistido):** solo `En Proceso` o `Objetada` (409 en cualquier otro).
- **Efecto:** **append** a la media persistida (dedup por URL, no reemplazo):
  `updateTarea({ rowId, imagenes: [...t.imagenes, ...nuevas], videos: [...], documentos: [...] })`.
  No toca estado ni timestamps del ciclo.
- Se despacha **antes** del `tareaTransicionSchema.parse` (payload distinto). No entra en la
  unión de acciones de `transicionar`.

### Cliente

- **`api-client`:** `api.tareas.agregarArchivos(rowId, { imagenes?, videos?, documentos? })` → PATCH con `{ accion: "agregarArchivos", ... }`.
- **`useTareaDetalle`:** mutation `agregarArchivos` que, al éxito, refresca `["tarea", rowId]` + `["tareas"]`.
- **UI en `TareaDetalle`:** nueva sección **"Agregar archivos"**, visible solo si
  `esAsignado && (t.estado === "En Proceso" || t.estado === "Objetada")`. Componente nuevo
  `components/tareas/AgregarArchivos.tsx`:
  - Mantiene un **staging local** `{ imagenes, videos, documentos }` (arranca vacío) y usa el
    `FileUploader` con esas arrays (así el uploader muestra/permite borrar **solo lo recién
    subido**, nunca la media existente).
  - Botón **"Guardar archivos"** (con `Loader2` + `disabled` mientras `isPending`, y deshabilitado
    si no hay nada staged): llama `agregarArchivos` con el staging; al éxito, resetea el staging
    (la media guardada ya aparece en las galerías del detalle al refrescar).
  - Necesita `config` (de `useConfig`) para los límites del `FileUploader`.

## Criterios de aceptación

- El asignado, en una tarea **En Proceso** u **Objetada**, ve la sección "Agregar archivos",
  sube imágenes/videos/PDFs y al "Guardar archivos" quedan **sumados** a la media de la tarea
  (visibles en las galerías; incluidos en el reporte al cerrar).
- Un **no-asignado** (otro supervisor o el admin) **no** ve la sección; la acción del server
  rechaza a un no-asignado (403).
- En estados que no son En Proceso/Objetada (ej. Asignada, En Revisión, Realizada) la sección
  **no** aparece y el server responde 409.
- El asignado **no puede borrar** archivos ya guardados (la sección solo agrega; puede descartar
  lo staged antes de guardar).
- Los archivos nuevos van a la **misma carpeta de Drive** de la tarea (mismo `edificio/objetivo/dpto/rowId`).

## Fuera de alcance

- Que el asignado **borre** o reordene media existente.
- Agregar archivos en otros estados (Aceptada, En Revisión) o por otros roles (el admin ya
  adjunta desde la edición).
- Notificaciones al admin cuando el asignado agrega archivos.
