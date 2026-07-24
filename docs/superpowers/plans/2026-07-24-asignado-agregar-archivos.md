# El asignado puede agregar archivos (En Proceso / Objetada) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) o superpowers:executing-plans. Steps con checkbox (`- [ ]`).

**Goal:** que el asignado sume imágenes/videos/PDFs a una tarea En Proceso u Objetada, sin borrar la media existente. Nueva acción `agregarArchivos` (append, asignado-only, estados acotados) + sección "Agregar archivos" en el detalle.

**Architecture:** backend = nueva rama en el PATCH que appendea media a `TareaArchivos` vía `updateTarea`. Cliente = método api + mutation + componente `AgregarArchivos` (staging local con `FileUploader` + botón Guardar).

**Tech Stack:** Next.js 16 · TanStack Query · Zod · Vitest + RTL · Google Sheets/Drive.

**Spec:** [`../specs/2026-07-24-asignado-agregar-archivos-design.md`](../specs/2026-07-24-asignado-agregar-archivos-design.md)

> **Commits:** los hace Jony con GitLens. NO ejecutar `git commit`.
> **VS:** `npx vitest run` + `npx tsc --noEmit` + `npm run lint`. Build al final.
> **Sin prerrequisitos manuales:** la hoja `TareaArchivos` ya existe.

---

## Task 1: Backend — acción `agregarArchivos`

**Files:**
- Modify: `lib/schemas.ts` (nuevo `tareaAgregarArchivosSchema`)
- Modify: `app/api/tareas/[id]/route.ts`
- Test: `tests/lib/schemas.test.ts`, `tests/api/tareas-transiciones.test.ts`

- [ ] **Step 1: Tests que fallan.**
  - `schemas.test.ts`: `tareaAgregarArchivosSchema` acepta `{ accion: "agregarArchivos", imagenes: ["https://drive.google.com/file/d/a/view"] }`; rechaza una url inválida.
  - `tareas-transiciones.test.ts`:
    - asignado + `agregarArchivos` con `imagenes` sobre tarea `En Proceso` → 200; `updateTarea` con `imagenes` = existentes **+** nuevas (append).
    - idem sobre `Objetada` → 200.
    - no-asignado → 403.
    - estado `Aceptada` (o `Realizada`) → 409.
    - dedup: enviar una URL que ya está no la duplica.
  (Para el append, la `tarea()` del helper puede setear `imagenes: ["https://.../ya.jpg"]`.)

- [ ] **Step 2: Correr — falla.**

- [ ] **Step 3: Schema — `lib/schemas.ts`.**
  ```ts
  export const tareaAgregarArchivosSchema = z.object({
    imagenes: z.array(z.string().url()).optional(),
    videos: z.array(z.string().url()).optional(),
    documentos: z.array(z.string().url()).optional(),
  });
  ```

- [ ] **Step 4: Handler — `app/api/tareas/[id]/route.ts`.** Insertar **antes** de `const { accion, comentario, nota } = tareaTransicionSchema.parse(body)`:
  ```ts
  if (body.accion === "agregarArchivos") {
    if (!esAsignado) return jsonError(403, "Solo el asignado puede agregar archivos");
    if (t.estado !== "En Proceso" && t.estado !== "Objetada") {
      return jsonError(409, "Solo se pueden agregar archivos con la tarea En Proceso u Objetada");
    }
    const { imagenes, videos, documentos } = tareaAgregarArchivosSchema.parse(body);
    const sumar = (curr: string[], add?: string[]) => [...curr, ...(add ?? []).filter((u) => !curr.includes(u))];
    return NextResponse.json(
      await updateTarea({
        rowId: t.rowId,
        imagenes: sumar(t.imagenes, imagenes),
        videos: sumar(t.videos, videos),
        documentos: sumar(t.documentos, documentos),
      })
    );
  }
  ```
  (Importar `tareaAgregarArchivosSchema`.)

- [ ] **Step 5: Correr — pasa.** VS. **Checkpoint.**

---

## Task 2: Cliente — api + mutation + sección "Agregar archivos"

**Files:**
- Modify: `lib/api-client.ts`
- Modify: `components/tareas/hooks/useTareaDetalle.ts`
- Create: `components/tareas/AgregarArchivos.tsx`
- Modify: `components/tareas/TareaDetalle.tsx`
- Test: `components/tareas/AgregarArchivos.test.tsx` (nuevo), `tests/components/TareaDetalle.test.tsx`

- [ ] **Step 1: api-client.** En `api.tareas`:
  ```ts
  agregarArchivos: (rowId: string, media: { imagenes?: string[]; videos?: string[]; documentos?: string[] }) =>
    request<Tarea>(`/api/tareas/${encodeURIComponent(rowId)}`, {
      method: "PATCH",
      body: JSON.stringify({ accion: "agregarArchivos", ...media }),
    }),
  ```

- [ ] **Step 2: useTareaDetalle.** Nueva mutation `agregarArchivos` (mutationFn → `api.tareas.agregarArchivos(rowId, media)`, `onSuccess: refresh`). Exponerla en el return.

- [ ] **Step 3: Test que falla — `AgregarArchivos.test.tsx`.**
  - Renderiza el `FileUploader` (mockeando `api`/`FileUploader` según convenga) con staging vacío.
  - El botón "Guardar archivos" está deshabilitado si no hay nada staged.
  - Con media staged, al click llama `onGuardar` (o la mutation) con esa media.
  (Test acotado al componente; el flujo real de subida ya está cubierto por los tests del FileUploader.)

- [ ] **Step 4: Componente — `components/tareas/AgregarArchivos.tsx`.**
  - Props: `{ tarea: Tarea; config: Configuracion; onGuardar: (media) => void; guardando: boolean }` (o recibe la mutation).
  - Estado local `nuevos = { imagenes: [], videos: [], documentos: [] }`; `FileUploader` con `edificio/objetivo/dpto/rowId` de la tarea y esas arrays + `onChange={setNuevos}`.
  - Botón "Guardar archivos" (`Loader2` + `disabled` si `guardando` o si no hay nada nuevo) → `onGuardar(nuevos)`. Al éxito, el padre resetea (o resetear `nuevos` en `onSuccess`).

- [ ] **Step 5: Integrar en `TareaDetalle.tsx`.** Sección "Agregar archivos" visible si `esAsignado && (t.estado === "En Proceso" || t.estado === "Objetada")`. Traer `config` con `useConfig`. Conectar con la mutation `agregarArchivos` (resetear staging + refrescar al éxito).

- [ ] **Step 6: Test de integración — `tests/components/TareaDetalle.test.tsx`.** La sección aparece para el asignado en En Proceso/Objetada; NO para no-asignado ni en otros estados (ej. Realizada).

- [ ] **Step 7: Correr — pasa.** VS. **Checkpoint.**

---

## Task 3: Verificación final + docs

- [ ] **Step 1:** `npx vitest run` (verde) + `npx tsc --noEmit` + `npm run lint` + `npm run build`.
- [ ] **Step 2:** `CHANGELOG.md` (`[Unreleased] · Added`): el asignado puede agregar archivos en En Proceso/Objetada.
- [ ] **Step 3:** Avisar "listo para commitear". NO commitear.

---

## Notas

- **Append con dedup:** el cliente manda solo lo nuevo; el server appendea a lo persistido y filtra URLs repetidas.
- **Add-only real:** el `FileUploader` de esta sección arranca con arrays vacías, así nunca muestra ni permite borrar la media ya guardada; el borrado de staging (antes de guardar) usa el trash-de-sesión ya existente del FileUploader.
- Los archivos nuevos caen en la misma carpeta de Drive de la tarea (mismo `rowId`).
