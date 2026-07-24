# Asistente simétrico de comentarios al cambiar de etapa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** unificar los dos saltos de etapa del asignado (Aceptada→En Proceso y En Proceso→En Revisión) en un mismo patrón: botón inicial → textarea + "Guardar y pasar a X" + "Cancelar" + modal si el textarea está vacío. El comentario en proceso se guarda al entrar (acción `empezar` extendida).

**Architecture:** cambio chico de backend (`empezar` acepta `comentario`) + reescritura del panel `AccionesTarea` (dos bloques simétricos con estado local + dos `ConfirmDialog`). Reusa `revisar` tal cual.

**Tech Stack:** Next.js 16 · TanStack Query · Zod · Vitest + RTL.

**Spec:** [`../specs/2026-07-24-asistente-comentarios-en-proceso-design.md`](../specs/2026-07-24-asistente-comentarios-en-proceso-design.md)

> **Commits:** los hace Jony con GitLens. NO ejecutar `git commit`.
> **VS:** `npx vitest run` + `npx tsc --noEmit` + `npm run lint`. Build al final (Task 3).

---

## Task 1: Backend — `empezar` guarda el comentario en proceso

**Files:**
- Modify: `app/api/tareas/[id]/route.ts`
- Test: `tests/api/tareas-transiciones.test.ts`

- [ ] **Step 1: Test que falla.** En el bloque de `empezar`:
  - asignado + `{ accion: "empezar", comentario: "arranco con esto" }` sobre tarea `Aceptada` → 200; `updateTarea` llamado con `estado: "En Proceso"` **y** `comentarioEnProceso: "arranco con esto"`.
  - Ajustar el test existente de `empezar` sin comentario para que espere `comentarioEnProceso: ""` (o `expect.objectContaining({ estado: "En Proceso" })`, que sigue pasando).

- [ ] **Step 2: Correr — falla.** `npx vitest run tests/api/tareas-transiciones.test.ts`.

- [ ] **Step 3: Implementar.** En `app/api/tareas/[id]/route.ts`, rama `empezar`:
  ```ts
  if (accion === "empezar") {
    if (!esAsignado) return jsonError(403, "Solo el asignado puede iniciar");
    if (t.estado !== "Aceptada") return jsonError(409, "La tarea no está en estado Aceptada");
    return NextResponse.json(
      await updateTarea({ rowId: t.rowId, estado: "En Proceso", comentarioEnProceso: comentario ?? "" })
    );
  }
  ```

- [ ] **Step 4: Correr — pasa.** VS. **Checkpoint.**

---

## Task 2: UI — panel simétrico en `AccionesTarea`

**Files:**
- Modify: `components/tareas/AccionesTarea.tsx`
- Modify: `components/tareas/AccionesTarea.test.tsx`

- [ ] **Step 1: Reescribir el test — `AccionesTarea.test.tsx`.** Casos:
  - `Aceptada`, sin iniciar → botón "Comenzar en Proceso"; NO hay textarea.
  - `Aceptada`, tras click "Comenzar en Proceso" → aparece textarea + "Guardar y pasar a En proceso" + "Cancelar".
  - `Aceptada`, click "Guardar y pasar a En proceso" con textarea vacío → aparece el modal ("¿… sin comentario?").
  - `En Proceso`, sin iniciar → botón "Pasar a revisión"; NO hay textarea; NO existe "Guardar comentario" ni "pasar a revisión sin comentar".
  - `En Proceso`, tras click "Pasar a revisión" → textarea + "Guardar y pasar a revisión" + "Cancelar".

- [ ] **Step 2: Correr — falla.**

- [ ] **Step 3: Implementar — `AccionesTarea.tsx`.**
  - Estados locales: `const [iniciandoProceso, setIniciandoProceso] = useState(false)`, mantener `pasandoARevision`, y `const [confirmSinComentario, setConfirmSinComentario] = useState<null | "proceso" | "revision">(null)`. Reusar `comProceso` / `comRevision`.
  - **Bloque `esAsignado && t.estado === "Aceptada"`:**
    - Si `!iniciandoProceso`: botón "Comenzar en Proceso" → `setIniciandoProceso(true)`.
    - Si `iniciandoProceso`: textarea (`comProceso`) + "Guardar y pasar a En proceso" + "Cancelar".
      - Guardar: si `!comProceso.trim()` → `setConfirmSinComentario("proceso")`; si no → `transicionar.mutate({ accion: "empezar", comentario: comProceso })`.
      - "Cancelar" → `setIniciandoProceso(false)`.
    - Botón con `disabled`/`Loader2` según `trPend("empezar")`.
  - **Bloque `esAsignado && t.estado === "En Proceso"`:** reescribir al patrón del salto B:
    - Si `!pasandoARevision`: botón "Pasar a revisión" → `setPasandoARevision(true)`.
    - Si `pasandoARevision`: textarea (`comRevision`) + "Guardar y pasar a revisión" + "Cancelar".
      - Guardar: si `!comRevision.trim()` → `setConfirmSinComentario("revision")`; si no → `transicionar.mutate({ accion: "revisar", comentario: comRevision })`.
      - "Cancelar" → `setPasandoARevision(false)`.
    - Quitar el textarea "Comentario (en proceso)", el botón "Guardar comentario" y el enlace "pasar a revisión sin comentar".
  - **Segundo `ConfirmDialog`** para `confirmSinComentario`:
    - `"proceso"` → título "Pasar sin comentario", msg "No cargaste un comentario en proceso. ¿Continuar igual?", onConfirm → `transicionar.mutate({ accion: "empezar", comentario: "" }); setConfirmSinComentario(null)`.
    - `"revision"` → título "Pasar a revisión sin comentario", msg "No cargaste un comentario de revisión. ¿Pasar la tarea a revisión igual?", onConfirm → `transicionar.mutate({ accion: "revisar", comentario: "" }); setConfirmSinComentario(null)`.

- [ ] **Step 4: Correr — pasa.** VS. **Checkpoint.**

---

## Task 3: Verificación final + docs

- [ ] **Step 1:** `npx vitest run` (todo verde) + `npx tsc --noEmit` + `npm run lint` + `npm run build`.
- [ ] **Step 2:** `CHANGELOG.md` (`[Unreleased] · Changed`): ajustar la nota del flujo "En Proceso" para reflejar el patrón simétrico (botón → textarea + "Guardar y pasar a X" + "Cancelar" + modal si vacío) y que el comentario en proceso se carga al entrar.
- [ ] **Step 3:** Avisar "listo para commitear". NO commitear.

---

## Notas

- Label del salto A destino: texto literal **"En proceso"** en el botón ("Guardar y pasar a En proceso"), como lo pidió Jony.
- `comentar` queda en el backend pero sin uso desde la UI (se deja).
- El comentario en proceso, una vez guardado, se edita desde la card de Comentarios (feature existente).
