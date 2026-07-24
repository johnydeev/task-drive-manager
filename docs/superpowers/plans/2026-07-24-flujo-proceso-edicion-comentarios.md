# Fecha estimada en la lista + flujo "En Proceso" + edición de comentarios — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** tres cambios: (#1) no mostrar "Estimada" cuando no hay fecha estimada (solo en la **lista**); (#2) reordenar el flujo del asignado en _En Proceso_ (renombrar botón + esconder "Pasar a En Revisión" hasta guardar el comentario, con salida opcional); (#3) que el asignado edite sus comentarios (en proceso y revisión) desde la card de Comentarios mientras la tarea siga activa.

**Architecture:** #1 y #2 son solo UI (`page.tsx`, `AccionesTarea.tsx`). #3 suma dos acciones al PATCH de tareas (`editarComentarioProceso`/`editarComentarioRevision`, asignado-only, bloqueadas en `Realizada`), propaga la unión de acciones por cliente/tipos, y agrega el componente `ComentarioEditable`. Sin columnas nuevas en la Sheet.

**Tech Stack:** Next.js 16 · TanStack Query · Zod · Vitest + RTL · Google Sheets.

**Spec:** [`../specs/2026-07-24-flujo-proceso-edicion-comentarios-design.md`](../specs/2026-07-24-flujo-proceso-edicion-comentarios-design.md)

> **Commits:** los hace Jony con GitLens. NO ejecutar `git commit`.
> **VS (cada checkpoint):** `npx vitest run` + `npx tsc --noEmit` + `npm run lint`. Build al final (Task 5).
> **Sin prerrequisitos manuales:** no hay columnas nuevas ni setup externo.

---

## Task 1: #1 — Ocultar "Estimada" sin fecha (solo la lista)

**Files:**
- Modify: `app/(app)/tareas/page.tsx`
- Test: render testeable de la lista, si existe (si no, este cambio se cubre en el smoke/verificación visual — no forzar un test frágil).

> **Decisión de Jony:** el **detalle** NO se toca — la `Row "Fecha estimada"` sigue mostrando la etiqueta con el valor vacío (formato campo/valor, se lee bien).

- [ ] **Step 1: Test que falla (si aplica).** Si hay un render testeable de la lista: una tarea con `fechaEstimada: ""` NO muestra "Estimada"; con `fechaEstimada: "2026-07-30"` muestra "Estimada 30/07/2026".

- [ ] **Step 2: Correr — falla.**

- [ ] **Step 3: Lista — `app/(app)/tareas/page.tsx` (~línea 210).**
  Cambiar la línea que hoy es:
  ```tsx
  Inicio {formatFecha(t.fechaInicio)} · Estimada {formatFecha(t.fechaEstimada)}
  ```
  por algo que solo agregue el tramo `· Estimada …` cuando `t.fechaEstimada` tenga valor, ej.:
  ```tsx
  Inicio {formatFecha(t.fechaInicio)}
  {t.fechaEstimada ? ` · Estimada ${formatFecha(t.fechaEstimada)}` : ""}
  ```

- [ ] **Step 4: Correr — pasa.** `npx vitest run` + `npx tsc --noEmit` + `npm run lint`. **Checkpoint.**

---

## Task 2: #2 — Flujo "En Proceso" (renombrar + gating del botón)

**Files:**
- Modify: `components/tareas/AccionesTarea.tsx`
- Test: `components/tareas/AccionesTarea.test.tsx` (nuevo, colocado)

- [ ] **Step 1: Test que falla — `AccionesTarea.test.tsx`.**
  Helpers de mocks de mutation (`asignar`, `transicionar`) tipo `UseMutationResult` con `mutate: vi.fn()`, `isPending: false`, `variables: undefined`, `isError: false`. Casos:
  - Tarea `Aceptada`, `esAsignado` → hay botón "Comenzar en Proceso" (y NO "Pasar a En Proceso").
  - Tarea `En Proceso`, `esAsignado`, `comentarioEnProceso: ""` → NO hay botón "Pasar a En Revisión"; sí un control "pasar a revisión sin comentar".
  - Tarea `En Proceso`, `esAsignado`, `comentarioEnProceso: "algo"` → sí hay botón "Pasar a En Revisión".

- [ ] **Step 2: Correr — falla.**

- [ ] **Step 3: Renombrar botón _Aceptada_ (~línea 119).** "Pasar a En Proceso" → **"Comenzar en Proceso"**.

- [ ] **Step 4: Gating en _En Proceso_ (~líneas 138-142).**
  Reemplazar el bloque donde hoy `!pasandoARevision` muestra directo el botón "Pasar a En Revisión", por:
  - Si `t.comentarioEnProceso?.trim()` → botón primario **"Pasar a En Revisión"** (`BTN_DARK`) que hace `setPasandoARevision(true)`.
  - Si no → enlace/botón discreto (texto chico, estilo link) **"pasar a revisión sin comentar"** que también hace `setPasandoARevision(true)`.
  - El bloque `pasandoARevision` (textarea de revisión + "Confirmar y pasar a En Revisión" + "Cancelar") queda igual.

- [ ] **Step 5: Correr — pasa.** VS. **Checkpoint.**

---

## Task 3: #3 backend — acciones de edición de comentarios

**Files:**
- Modify: `lib/schemas.ts`
- Modify: `app/api/tareas/[id]/route.ts`
- Test: `tests/lib/schemas.test.ts`, `tests/api/tareas-transiciones.test.ts`

- [ ] **Step 1: Tests que fallan.**
  - `schemas.test.ts`: `tareaTransicionSchema` acepta `{ accion: "editarComentarioProceso", comentario: "x" }` y `"editarComentarioRevision"`.
  - `tareas-transiciones.test.ts`: (a) asignado + `editarComentarioProceso` sobre tarea `En Revisión` → 200, `updateTarea` llamado con `comentarioEnProceso` = nuevo y **sin** `estado`; (b) asignado + `editarComentarioRevision` → 200 con `comentarioRevision`; (c) no-asignado → 403; (d) tarea `Realizada` → 409.

- [ ] **Step 2: Correr — falla.**

- [ ] **Step 3: Schema — `lib/schemas.ts`.**
  En `tareaTransicionSchema.accion` sumar `"editarComentarioProceso"` y `"editarComentarioRevision"` al enum.

- [ ] **Step 4: PATCH — `app/api/tareas/[id]/route.ts`.**
  Después de las ramas existentes (antes de la de `cerrar`), agregar:
  ```ts
  if (accion === "editarComentarioProceso" || accion === "editarComentarioRevision") {
    if (!esAsignado) return jsonError(403, "Solo el asignado puede editar sus comentarios");
    if (t.estado === "Realizada") return jsonError(409, "La tarea está cerrada: no se pueden editar los comentarios");
    const campo = accion === "editarComentarioProceso" ? "comentarioEnProceso" : "comentarioRevision";
    return NextResponse.json(await updateTarea({ rowId: t.rowId, [campo]: comentario ?? "" }));
  }
  ```
  (No toca estado ni timestamps.)

- [ ] **Step 5: Correr — pasa.** VS. **Checkpoint.**

---

## Task 4: #3 cliente + UI — ComentarioEditable en la card de Comentarios

**Files:**
- Modify: `lib/api-client.ts`, `components/tareas/AccionesTarea.tsx` (tipo `TransicionInput`), `components/tareas/hooks/useTareaDetalle.ts`
- Create: `components/tareas/ComentarioEditable.tsx`
- Modify: `components/tareas/TareaDetalle.tsx`
- Test: `components/tareas/ComentarioEditable.test.tsx` (nuevo), `tests/components/TareaDetalle.test.tsx`

- [ ] **Step 1: Extender la unión de acciones (3 lugares).**
  Sumar `"editarComentarioProceso" | "editarComentarioRevision"` a la unión de `accion` en: `api.tareas.transicionar` (`lib/api-client.ts`), `TransicionInput` (`AccionesTarea.tsx`), y la mutation `transicionar` de `useTareaDetalle.ts`.

- [ ] **Step 2: Test que falla — `ComentarioEditable.test.tsx`.**
  - `editable={false}` → no hay botón de editar.
  - `editable`, click en editar → aparece textarea con `valor`; "Guardar" llama `onSave` con el texto; "Cancelar" vuelve a lectura sin llamar `onSave`.
  - `saving` → botón "Guardar" deshabilitado con spinner.

- [ ] **Step 3: Componente — `components/tareas/ComentarioEditable.tsx`.**
  Según spec (props `{ label, fecha?, valor, editable, saving, onSave }`; toggle lectura/edición; spinner `Loader2` + `disabled` mientras `saving`).

- [ ] **Step 4: Integrar en `TareaDetalle.tsx` (card Comentarios, ~228-259).**
  Usar `ComentarioEditable` para **En proceso** y **Revisión** con:
  - `editable = esAsignado && t.estado !== "Realizada"`, `saving = transicionar.isPending`.
  - `onSave = (texto) => transicionar.mutate({ accion: "editarComentarioProceso" | "editarComentarioRevision", comentario: texto })`.
  Objeción y Cierre quedan de solo lectura (sin el componente o con `editable={false}`).

- [ ] **Step 5: Test de integración — `TareaDetalle.test.tsx`.**
  Botón de editar visible para asignado en tarea activa; oculto para no-asignado; oculto en tarea `Realizada`.

- [ ] **Step 6: Correr — pasa.** VS. **Checkpoint.**

---

## Task 5: Verificación final + docs

- [ ] **Step 1:** `npx vitest run` (todo verde) + `npx tsc --noEmit` + `npm run lint` + `npm run build`.
- [ ] **Step 2:** Actualizar `CHANGELOG.md` (sección `[Unreleased]`): #1 en _Changed/Fixed_, #2 en _Changed_, #3 en _Added_.
- [ ] **Step 3:** Avisar "listo para commitear". NO commitear.

---

## Notas de diseño

- **Estado persistido vs derivado:** el guard de `Realizada` en #3 mira el estado **persistido** (`getTareaPersistida`), consistente con el resto del PATCH. Una tarea derivada-`Realizada` por las 72 h (persistida `En Revisión`, sin reporte generado) sigue siendo editable — correcto, no hay PDF que desincronizar.
- **Permiso de #3 = solo asignado** (por pedido). El admin no edita estos comentarios; ya tiene el PUT de campos para lo suyo.
- **#2 sin backend:** reusa `comentar` y `revisar`. El "gating" es puramente de presentación sobre `t.comentarioEnProceso`.
