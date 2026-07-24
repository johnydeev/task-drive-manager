# Colapsables + cierre obligatorio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) o superpowers:executing-plans. Steps con checkbox (`- [ ]`).

**Goal:** (#1) "Agregar archivos" colapsable en el detalle; (#2) nota de cierre obligatoria otra vez; (#3) media en una sola barra colapsable.

**Architecture:** nuevo `CollapsibleSection` (ui). Revert chico en `cerrar` (server + `AccionesTarea`). Refactor de las 3 cards de media del detalle a una colapsable.

**Tech Stack:** Next.js 16 · TanStack Query · Vitest + RTL.

**Spec:** [`../specs/2026-07-24-colapsables-y-cierre-obligatorio-design.md`](../specs/2026-07-24-colapsables-y-cierre-obligatorio-design.md)

> **Commits:** los hace Jony con GitLens. NO ejecutar `git commit`.
> **VS:** `npx vitest run` + `npx tsc --noEmit` + `npm run lint`. Build al final.

---

## Task 1: #2 — Cierre obligatorio otra vez

**Files:**
- Modify: `app/api/tareas/[id]/route.ts`
- Modify: `components/tareas/AccionesTarea.tsx`, `components/tareas/AccionesTarea.test.tsx`
- Modify: `tests/api/tareas-transiciones.test.ts`

- [ ] **Step 1: Tests que cambian.**
  - `tareas-transiciones.test.ts`: el test "cerrar sin nota → 200 Sin comentarios" vuelve a **"cerrar sin nota → 400"** (`updateTarea` no llamado).
  - `AccionesTarea.test.tsx`: el test "Cerrar habilitado (nota opcional)" pasa a **"con textarea vacío, Cerrar y Objetar deshabilitados"**.

- [ ] **Step 2: Correr — falla.**

- [ ] **Step 3: Backend.** En `cerrar`, restaurar antes del `updateTarea`:
  `if (!nota?.trim()) return jsonError(400, "La nota de cierre es requerida");`
  (Se puede dejar `comentarioRealizado: conDefault(nota)` o `nota.trim()`; con el 400 ya nunca llega vacío.)

- [ ] **Step 4: Cliente `AccionesTarea`.** En el bloque `puedeCerrar`:
  - Botón Cerrar: volver a `disabled={!notaCierre.trim() || transicionar.isPending}`.
  - Label: restaurar el asterisco de obligatorio.
  - Texto de ayuda: "Para cerrar u objetar debe existir un comentario." (cuando el textarea está vacío).

- [ ] **Step 5: Correr — pasa.** VS. **Checkpoint.**

---

## Task 2: `CollapsibleSection` + #1 + #3

**Files:**
- Create: `components/ui/CollapsibleSection.tsx`, `components/ui/CollapsibleSection.test.tsx`
- Modify: `components/tareas/TareaDetalle.tsx`, `tests/components/TareaDetalle.test.tsx`

- [ ] **Step 1: Test que falla — `CollapsibleSection.test.tsx`.**
  - Por defecto (colapsada): el contenido NO está visible; hay un botón con el título.
  - Al click en el header: el contenido aparece.
  - `defaultOpen` → arranca mostrando el contenido.

- [ ] **Step 2: Correr — falla.**

- [ ] **Step 3: Componente — `components/ui/CollapsibleSection.tsx`.**
  Card con header `<button aria-expanded>` (título + chevron que rota) que togglea el contenido. Props `{ title, defaultOpen?, children }`, estado local `open`.

- [ ] **Step 4: #1 en `TareaDetalle`.** Envolver la sección "Agregar archivos" en `CollapsibleSection title="Agregar archivos"` (colapsada por defecto). El contenido (AgregarArchivos) queda igual.

- [ ] **Step 5: #3 en `TareaDetalle`.** Reemplazar las 3 `Section` de Imágenes/Videos/Documentos por **una** `CollapsibleSection` `title={\`Archivos multimedia (${t.imagenes.length + t.videos.length + t.documentos.length})\`}` (colapsada por defecto), renderizada solo si hay al menos un archivo. Adentro, los 3 grupos (cada uno solo si tiene items) con su mini-encabezado.

- [ ] **Step 6: Test de integración — `tests/components/TareaDetalle.test.tsx`.**
  - Con media: aparece "Archivos multimedia (N)"; los links/imgs NO están hasta expandir; al click en la barra aparecen.
  - "Agregar archivos" (asignado, En Proceso/Objetada): existe como colapsable (el botón "Guardar archivos" aparece al expandir).
  - Ajustar los tests existentes que buscaban las cards de media directas (ej. "muestra la sección de documentos") para expandir primero, o reescribirlos al nuevo layout.

- [ ] **Step 7: Correr — pasa.** VS. **Checkpoint.**

---

## Task 3: Verificación final + docs

- [ ] **Step 1:** `npx vitest run` (verde) + `npx tsc --noEmit` + `npm run lint` + `npm run build`.
- [ ] **Step 2:** `CHANGELOG.md`: ajustar la nota del default (cierre vuelve a obligatorio) + agregar colapsables.
- [ ] **Step 3:** Avisar "listo para commitear". NO commitear.

---

## Notas

- El default "Sin comentarios" **se mantiene** para en proceso / revisión; solo el cierre vuelve a exigir nota.
- Colapsables siempre arrancan **cerrados** (no se persiste el estado).
