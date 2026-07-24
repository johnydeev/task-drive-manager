# SPEC — Asistente simétrico de comentarios al cambiar de etapa (Aceptada→En Proceso, En Proceso→En Revisión)

**Fecha:** 2026-07-24
**Estado:** Aprobado (rev. 2)
**Autor:** equipo task-drive-manager
**Plan asociado:** [`../plans/2026-07-24-asistente-comentarios-en-proceso.md`](../plans/2026-07-24-asistente-comentarios-en-proceso.md)

Refina el panel de acciones del asignado (`components/tareas/AccionesTarea.tsx`). Reemplaza la
feature #2 del spec [`2026-07-24-flujo-proceso-edicion-comentarios-design.md`](2026-07-24-flujo-proceso-edicion-comentarios-design.md)
(que había quedado con dos botones mezclados y confundía) por **un patrón único y simétrico**
para los dos saltos de etapa que hace el asignado.

> **rev. 2:** el comentario en proceso ahora se carga **al entrar** a En Proceso (no después),
> con el botón "Guardar y pasar a En proceso". Así los dos saltos son idénticos.

## Problema

El bloque `En Proceso` mostraba a la vez el textarea "Comentario (en proceso)" + "Guardar
comentario" **y** un control para pasar a revisión. Dos acciones distintas en el mismo lugar →
confuso, y se podía saltar el comentario sin querer.

## Solución — un solo patrón para "entrar a una etapa"

Los dos saltos que hace el asignado usan **exactamente la misma UX**:

```
[ botón para iniciar el salto ]
   └─(click)─▶ textarea de comentario + [ Guardar y pasar a X ] [ Cancelar ]
                  ├─ con texto  → guarda el comentario y hace la transición
                  ├─ vacío      → modal "¿pasar a X sin comentario?" → confirma → transición sin comentario
                  └─ Cancelar   → vuelve al botón inicial
```

### Salto A — Aceptada → En Proceso
- Botón inicial: **"Comenzar en Proceso"**.
- Al tocarlo → se abre: textarea **"Comentario (en proceso)"** + **"Guardar y pasar a En proceso"** + **"Cancelar"**.
- "Guardar y pasar a En proceso":
  - Con texto → `transicionar({ accion: "empezar", comentario })` → estado **En Proceso**, guardando `comentarioEnProceso`.
  - Vacío → modal *"¿Pasar a En proceso sin comentario?"* → al confirmar, `transicionar({ accion: "empezar", comentario: "" })`.
- "Cancelar" → vuelve al botón "Comenzar en Proceso".

### Salto B — En Proceso → En Revisión
- Botón inicial: **"Pasar a revisión"**.
- Al tocarlo → se abre: textarea **"Comentario de revisión (qué hiciste)"** + **"Guardar y pasar a revisión"** + **"Cancelar"**.
- "Guardar y pasar a revisión":
  - Con texto → `transicionar({ accion: "revisar", comentario })` → estado **En Revisión**.
  - Vacío → modal *"¿Pasar a revisión sin comentario?"* → al confirmar, `transicionar({ accion: "revisar", comentario: "" })`.
- "Cancelar" → vuelve al botón "Pasar a revisión".

El comentario en proceso, una vez guardado, sigue siendo **editable** desde la card de
Comentarios (feature ya existente). Ya **no** hay un paso "Guardar comentario" suelto dentro de
En Proceso.

### Modales

Dos confirmaciones (reusan `ConfirmDialog`), solo cuando el textarea del salto está vacío:
- Salto A vacío → "Pasar sin comentario" / "No cargaste un comentario en proceso. ¿Continuar igual?".
- Salto B vacío → "Pasar a revisión sin comentario" / "No cargaste un comentario de revisión. ¿Pasar la tarea a revisión igual?".

### Spinner / disabled

Los botones que disparan mutación (`empezar`, `revisar`) muestran `Loader2` animado y quedan
`disabled` mientras `transicionar.isPending` (regla global de la UI).

## Backend

Un solo cambio: la acción **`empezar`** (`app/api/tareas/[id]/route.ts`) pasa a **aceptar un
comentario opcional** que se guarda en `comentarioEnProceso` al transicionar Aceptada→En Proceso.

```ts
if (accion === "empezar") {
  if (!esAsignado) return jsonError(403, "Solo el asignado puede iniciar");
  if (t.estado !== "Aceptada") return jsonError(409, "La tarea no está en estado Aceptada");
  return NextResponse.json(
    await updateTarea({ rowId: t.rowId, estado: "En Proceso", comentarioEnProceso: comentario ?? "" })
  );
}
```

- **Sin cambio de schema:** `tareaTransicionSchema` ya tiene `comentario` opcional.
- La acción `comentar` (que usaba el viejo botón "Guardar comentario") queda **sin uso desde la
  UI**, pero se **mantiene** en el backend (válida, inofensiva; quitarla es churn innecesario).

## Criterios de aceptación

- **Aceptada**, sin iniciar: se ve solo el botón "Comenzar en Proceso" (sin textarea).
- Tocar "Comenzar en Proceso" abre el textarea "Comentario (en proceso)" + "Guardar y pasar a En proceso" + "Cancelar".
- "Guardar y pasar a En proceso" con texto → tarea **En Proceso** con `comentarioEnProceso` guardado.
- "Guardar y pasar a En proceso" con textarea vacío → modal "¿Pasar a En proceso sin comentario?"; al confirmar, tarea **En Proceso** sin comentario.
- "Cancelar" (salto A) vuelve al botón "Comenzar en Proceso" sin cambiar de estado.
- **En Proceso**, sin iniciar: se ve solo el botón "Pasar a revisión".
- Tocar "Pasar a revisión" abre el textarea de revisión + "Guardar y pasar a revisión" + "Cancelar".
- "Guardar y pasar a revisión" con texto → **En Revisión** con el comentario; vacío → modal → confirma → **En Revisión** sin comentario.
- "Cancelar" (salto B) vuelve al botón "Pasar a revisión".
- API: `empezar` guarda `comentarioEnProceso` cuando viene comentario; sigue siendo asignado-only (403) y exige origen `Aceptada` (409).

## Fuera de alcance

- Otros cambios de backend/schema (solo se extiende `empezar`).
- El estado `Objetada` (su "Reenviar a revisión" queda igual).
- La edición de comentarios desde la card de Comentarios (ya hecha).
- Quitar la acción `comentar` del backend (se deja, aunque la UI ya no la use).
