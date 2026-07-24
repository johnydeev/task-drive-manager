# SPEC — Comentario por defecto "Sin comentarios" al guardar vacío

**Fecha:** 2026-07-24
**Estado:** Propuesto (rev. 1)
**Autor:** equipo task-drive-manager
**Plan asociado:** [`../plans/2026-07-24-comentario-default-sin-comentarios.md`](../plans/2026-07-24-comentario-default-sin-comentarios.md)

## Objetivo

Cuando un comentario del ciclo de vida se guarda **vacío**, en vez de quedar en blanco se
persiste el texto literal **"Sin comentarios"**. Así el admin siempre ve un bloque con
información explícita ("no hubo comentarios") y el texto queda **editable** después desde la
card de Comentarios.

Aplica a: **comentario en proceso**, **comentario de revisión** y **comentario de cierre**.
**NO** aplica a la **objeción** del admin (sigue exigiendo un motivo escrito: el responsable
necesita saber qué corregir).

## Cambios

### Backend (`app/api/tareas/[id]/route.ts`) — fuente de verdad

Helper local: `const conDefault = (txt?: string) => (txt?.trim() ? txt.trim() : "Sin comentarios");`

Aplicarlo al escribir estos campos:
- **`empezar`** → `comentarioEnProceso: conDefault(comentario)`.
- **`revisar`** → `comentarioRevision: conDefault(comentario)` (incluye el reenvío desde `Objetada`).
- **`cerrar`** → **quitar** la validación `if (!nota?.trim()) return 400` (la nota deja de ser
  obligatoria) y escribir `comentarioRealizado: conDefault(nota)`.
- **`editarComentarioProceso` / `editarComentarioRevision`** → `[campo]: conDefault(comentario)`
  (editar a vacío también vuelve a "Sin comentarios", coherente con "nunca en blanco").

**Sin cambios:**
- **`objetar`** sigue igual: `notaObjecion` obligatoria, 400 si viene vacía.
- El resto de las transiciones (`aceptar`) no tienen comentario.

Como el default lo pone el server, el cliente para **en proceso** y **revisión** no cambia:
ya manda `comentario: ""` en el caso vacío (desde el modal "¿pasar sin comentario?") y el
server lo convierte.

### Cliente (`components/tareas/AccionesTarea.tsx`) — solo el cierre

El bloque admin de `En Revisión` comparte un textarea entre Cerrar y Objetar. Como el cierre
pasa a ser opcional pero la objeción no:
- Botón **"Cerrar (dar por realizada)"**: se saca `!notaCierre.trim()` del `disabled` (queda
  habilitado; solo `disabled` mientras `transicionar.isPending`).
- Botón **"Objetar"**: mantiene `disabled={!notaCierre.trim() || isPending}`.
- Label: sacar el asterisco de obligatorio genérico; aclarar que la nota de cierre es opcional
  y el motivo de objeción es obligatorio (ej. label "Comentario (nota de cierre opcional /
  motivo de objeción)").
- Texto de ayuda: pasa a referirse solo a la objeción (ej. "El motivo es obligatorio para
  objetar."), visible cuando el textarea está vacío.

El modal de confirmación de cierre existente se mantiene (al confirmar con el textarea vacío,
el server guarda "Sin comentarios").

## Criterios de aceptación

- `empezar` / `revisar` con comentario vacío → guardan **"Sin comentarios"**; con texto, guardan el texto.
- `cerrar` con nota vacía → **200** (ya no 400) y `comentarioRealizado = "Sin comentarios"`; con texto, guarda el texto.
- `editarComentarioProceso` / `editarComentarioRevision` a vacío → guardan "Sin comentarios".
- `objetar` con motivo vacío → **sigue devolviendo 400**.
- En la UI, el admin puede tocar "Cerrar (dar por realizada)" **sin** escribir nota; "Objetar" sigue deshabilitado sin motivo.

## Fuera de alcance

- La objeción (queda obligatoria).
- Cambiar el PDF de reporte (mostrará "Sin comentarios" donde corresponda, sin lógica nueva).
