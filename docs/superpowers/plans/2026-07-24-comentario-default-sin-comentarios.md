# Comentario por defecto "Sin comentarios" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) o superpowers:executing-plans. Steps con checkbox (`- [ ]`).

**Goal:** que los comentarios de **en proceso / revisión / cierre** guardados vacíos queden como **"Sin comentarios"** (editable después). El cierre deja de ser obligatorio. La objeción NO cambia.

**Architecture:** casi todo server-side (`route.ts`, helper `conDefault`). El cliente solo cambia el bloque de cierre (habilitar botón sin nota).

**Tech Stack:** Next.js 16 · TanStack Query · Zod · Vitest + RTL.

**Spec:** [`../specs/2026-07-24-comentario-default-sin-comentarios-design.md`](../specs/2026-07-24-comentario-default-sin-comentarios-design.md)

> **Commits:** los hace Jony con GitLens. NO ejecutar `git commit`.
> **VS:** `npx vitest run` + `npx tsc --noEmit` + `npm run lint`. Build al final.

---

## Task 1: Backend — default "Sin comentarios"

**Files:**
- Modify: `app/api/tareas/[id]/route.ts`
- Test: `tests/api/tareas-transiciones.test.ts`

- [ ] **Step 1: Tests que fallan / cambian.**
  - `empezar` con `comentario: ""` → `updateTarea` con `comentarioEnProceso: "Sin comentarios"`.
  - `revisar` con `comentario: ""` → `comentarioRevision: "Sin comentarios"`.
  - **Cambiar** el test existente `"cerrar sin nota → 400"`: ahora `cerrar` con `nota: "  "` → **200** y `comentarioRealizado: "Sin comentarios"`.
  - `editarComentarioProceso` con `comentario: ""` → `comentarioEnProceso: "Sin comentarios"`.
  - Verificar que sigue vivo: `objetar` con motivo vacío → **400** (no tocar).

- [ ] **Step 2: Correr — falla.**

- [ ] **Step 3: Implementar — `route.ts`.**
  - Agregar arriba del handler (o dentro): `const conDefault = (txt?: string) => (txt?.trim() ? txt.trim() : "Sin comentarios");`
  - `empezar`: `comentarioEnProceso: conDefault(comentario)`.
  - `revisar`: `comentarioRevision: conDefault(comentario)`.
  - `editarComentario*`: `[campo]: conDefault(comentario)`.
  - `cerrar`: quitar `if (!nota?.trim()) return jsonError(400, ...)`; usar `comentarioRealizado: conDefault(nota)`.
  - `objetar`: sin cambios.

- [ ] **Step 4: Correr — pasa.** VS. **Checkpoint.**

---

## Task 2: Cliente — cierre opcional en el panel

**Files:**
- Modify: `components/tareas/AccionesTarea.tsx`
- Modify: `components/tareas/AccionesTarea.test.tsx`

- [ ] **Step 1: Test que falla.** Admin, tarea `En Revisión`, textarea vacío:
  - botón "Cerrar (dar por realizada)" **habilitado** (no `disabled`).
  - botón "Objetar" **deshabilitado**.

- [ ] **Step 2: Correr — falla.**

- [ ] **Step 3: Implementar — `AccionesTarea.tsx`.** En el bloque `puedeCerrar`:
  - Botón Cerrar: `disabled={transicionar.isPending}` (sacar `!notaCierre.trim()`).
  - Botón Objetar: dejar `disabled={!notaCierre.trim() || transicionar.isPending}`.
  - Label: aclarar que la nota de cierre es opcional / motivo de objeción obligatorio.
  - Texto de ayuda: referirse solo a la objeción (visible cuando el textarea está vacío).

- [ ] **Step 4: Correr — pasa.** VS. **Checkpoint.**

---

## Task 3: Verificación final + docs

- [ ] **Step 1:** `npx vitest run` (verde) + `npx tsc --noEmit` + `npm run lint` + `npm run build`.
- [ ] **Step 2:** `CHANGELOG.md` (`[Unreleased]`): nota del default "Sin comentarios" + cierre opcional.
- [ ] **Step 3:** Avisar "listo para commitear". NO commitear.

---

## Notas

- El literal **"Sin comentarios"** vive en el helper `conDefault` de `route.ts` (único lugar que escribe estos campos).
- La objeción del admin **no** usa el default: `notaObjecion` sigue obligatoria (400 si vacía).
