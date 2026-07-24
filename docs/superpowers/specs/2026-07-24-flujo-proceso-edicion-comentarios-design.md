# SPEC — Fecha estimada en la lista, flujo "En Proceso" y edición de comentarios

**Fecha:** 2026-07-24
**Estado:** Aprobado (rev. 2)
**Autor:** equipo task-drive-manager
**Plan asociado:** [`../plans/2026-07-24-flujo-proceso-edicion-comentarios.md`](../plans/2026-07-24-flujo-proceso-edicion-comentarios.md)

Tres cambios de una misma sesión. #1 es un tweak de UI; #2 reordena el flujo del asignado; #3 suma edición de comentarios (toca backend). Ninguno requiere columnas nuevas en la Sheet.

---

## #1 — Ocultar "Estimada" cuando no hay fecha estimada

La `fechaEstimada` es opcional. Hoy la **lista de tareas** siempre imprime `Inicio {fecha} · Estimada {fecha}`; cuando no hay fecha, `formatFecha("")` devuelve `""` y queda colgada la palabra **"Estimada"** sin nada al lado (`… · Estimada `), que se lee mal.

- **Lista** (`app/(app)/tareas/page.tsx`, ~línea 210): si `t.fechaEstimada` está vacía, mostrar solo `Inicio {fecha}` (sin el ` · Estimada …`). Con fecha, se mantiene igual.
- **Detalle** (`components/tareas/TareaDetalle.tsx`): **no se toca.** Por decisión de Jony, la `Row "Fecha estimada"` sigue mostrando la etiqueta con el valor vacío cuando no hay fecha (es un formato campo/valor, se lee bien vacío).

**Criterio:** una tarea sin fecha estimada NO muestra la palabra "Estimada" en la **lista**; con fecha, se muestra como hoy. El detalle queda sin cambios.

---

## #2 — Flujo "En Proceso" más claro (panel de acciones del asignado)

En `components/tareas/AccionesTarea.tsx`. Dos ajustes al recorrido del asignado:

**a. Renombrar el botón del estado _Aceptada_.** "Pasar a En Proceso" → **"Comenzar en Proceso"** (~línea 119). Solo texto.

**b. No mezclar el paso "pasar a revisión" con la carga del comentario en proceso.** Hoy, en estado _En Proceso_, el botón "Pasar a En Revisión" aparece **junto** al textarea del comentario en proceso, lo que confunde (parece parte de cargar el comentario). Nuevo comportamiento:

- Se muestra el textarea del comentario en proceso + botón **"Guardar comentario"** (sin cambios).
- El botón **primario "Pasar a En Revisión"** aparece **solo cuando ya hay un comentario en proceso guardado** — leído de `t.comentarioEnProceso` (dato del servidor), así también aparece al reabrir una tarea que ya tenía comentario.
- El comentario en proceso **sigue siendo opcional**: cuando NO hay comentario guardado, en lugar del botón primario se ofrece un **enlace discreto "pasar a revisión sin comentar"** que abre el mismo paso. Así nunca se bloquea a quien no tiene nada que comentar, pero el camino "normal" es comentar → guardar → botón.
- Al activar el paso (por el botón o el enlace), recién ahí se despliega el **textarea del comentario de revisión** con "Confirmar y pasar a En Revisión" + "Cancelar" (comportamiento actual, se mantiene).

Sin cambios de backend: reusa las acciones `comentar` y `revisar` existentes.

**Criterios:**
- En _Aceptada_, el botón dice "Comenzar en Proceso".
- En _En Proceso_ sin comentario guardado: se ve el textarea + "Guardar comentario" + el enlace "pasar a revisión sin comentar"; **no** el botón primario "Pasar a En Revisión".
- Tras guardar el comentario (o si la tarea ya tenía uno), aparece el botón primario "Pasar a En Revisión".
- Al activar el paso se muestra el textarea de comentario de revisión (como hoy).

---

## #3 — Editar comentarios (en proceso y revisión) desde la card de Comentarios

**Objetivo:** que **el asignado** (persona a cargo) pueda corregir sus comentarios ya guardados —**En proceso** y **Revisión**— desde la card de Comentarios del detalle, con un botón chico de editar. Objeción y Cierre NO se editan (son del admin / terminales).

### Regla de negocio

- Editable **solo el asignado** de la tarea.
- Editable **mientras la tarea siga activa** — es decir, mientras el estado **persistido** no sea `Realizada`. Una vez `Realizada` (cierre explícito del admin, que además genera el reporte), los comentarios quedan **fijos**, para no desincronizar el PDF ya emitido.
- Editar un comentario **no cambia el estado ni toca timestamps** (`revisionEn`, etc.): solo pisa el texto del campo.
- El botón de editar aparece por bloque solo si ese comentario **existe** (la card ya renderiza cada bloque únicamente cuando tiene contenido) y se cumplen las dos reglas de arriba.

### Backend (API)

`tareaTransicionSchema.accion` (`lib/schemas.ts`) suma dos acciones:
- `editarComentarioProceso` — pisa `comentarioEnProceso` con `comentario`.
- `editarComentarioRevision` — pisa `comentarioRevision` con `comentario`.

`PATCH /api/tareas/[id]` (`app/api/tareas/[id]/route.ts`) — dos ramas nuevas, validando contra el estado **persistido** (`getTareaPersistida`, como el resto):
- Permiso: **solo el asignado** (403 si no).
- Guard de estado: 409 si la tarea está `Realizada`.
- Efecto: `updateTarea({ rowId, comentarioEnProceso | comentarioRevision: comentario ?? "" })`. Sin tocar estado ni fechas.

### Cliente / tipos

La unión de acciones de `transicionar` suma las dos nuevas en los tres lugares que la declaran: `lib/api-client.ts` (`api.tareas.transicionar`), `components/tareas/AccionesTarea.tsx` (`TransicionInput`) y `components/tareas/hooks/useTareaDetalle.ts` (mutation `transicionar`).

### UI

Nuevo componente `components/tareas/ComentarioEditable.tsx`:
- Props: `{ label: string; fecha?: string; valor: string; editable: boolean; saving: boolean; onSave: (texto: string) => void }`.
- Vista lectura: el subtítulo (`label` + fecha opcional) y el texto (`whitespace-pre-wrap`), + un **botón chico de editar** (ícono `Edit3`) a la derecha del subtítulo, visible solo si `editable`.
- Vista edición (toggle local): textarea precargado con `valor` + botones **"Guardar"** (con spinner `Loader2` mientras `saving`, deshabilitado mientras guarda — regla global de la UI) y **"Cancelar"** (vuelve a lectura sin cambios).
- Al guardar llama `onSave(texto)`.

En `TareaDetalle.tsx`, la card **Comentarios** usa `ComentarioEditable` para los bloques **En proceso** y **Revisión**, con `editable = esAsignado && t.estado !== "Realizada"`, `saving = transicionar.isPending`, y `onSave` = `transicionar.mutate({ accion: "editarComentarioProceso" | "editarComentarioRevision", comentario })`. Los bloques **Objeción** y **Cierre** quedan como texto de solo lectura (sin el componente, o con `editable={false}`).

**Criterios:**
- El asignado ve el botón de editar en "En proceso" y "Revisión" de una tarea activa; edita, guarda y el texto se actualiza sin cambiar el estado.
- Un no-asignado (otro supervisor, o el admin) NO ve los botones de editar; el server rechaza la acción de un no-asignado (403).
- En una tarea `Realizada`, los botones no aparecen y el server rechaza la edición (409).
- Objeción y Cierre nunca muestran botón de editar.

---

## Testing

- **#1:** RTL — la **lista** no muestra "Estimada" cuando `fechaEstimada` está vacía; sí cuando tiene valor. (El detalle no se testea: no cambia.)
- **#2:** RTL de `AccionesTarea` — _Aceptada_ muestra "Comenzar en Proceso"; _En Proceso_ sin comentario oculta el botón primario y muestra el enlace "pasar a revisión sin comentar"; con `comentarioEnProceso` seteado muestra el botón primario; activar el paso despliega el textarea de revisión.
- **#3:**
  - Schema: `tareaTransicionSchema` acepta `editarComentarioProceso` / `editarComentarioRevision`.
  - API (`tests/api/tareas-transiciones.test.ts`): asignado edita cada comentario (200, pisa el campo, no cambia estado); no-asignado 403; tarea `Realizada` 409.
  - RTL: `ComentarioEditable` (toggle lectura/edición, spinner al guardar, cancelar no cambia); `TareaDetalle` muestra el botón de editar solo para asignado en tarea activa.
- Mantener verde: `vitest` + `tsc` + `lint` + `build`.

## Fuera de alcance

- Que el admin edite los comentarios del asignado (queda solo el asignado, por pedido).
- Historial de ediciones (se pisa el texto, sin versionado).
- Regenerar el reporte al editar (no aplica: en `Realizada` la edición está bloqueada).
- Notificaciones.
