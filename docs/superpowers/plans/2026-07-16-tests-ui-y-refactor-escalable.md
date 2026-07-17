# Tests de UI + refactor a arquitectura escalable — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans o superpowers:subagent-driven-development para implementar este plan task-by-task. Los steps usan checkbox (`- [ ]`). Cada task = 1 commit con SHA anotado en la tabla de Progreso.

> **⚠️ Convención de commits (regla global del usuario):** Claude **NUNCA ejecuta `git commit`**. Al cerrar cada task, Claude corre `git add` + deja el árbol verde y **frena con un mensaje de commit sugerido**; el commit lo ejecuta el usuario. Los bloques ```git commit ...``` de abajo son el **mensaje sugerido**, no un comando que Claude corre.

**Spec asociado:** [`docs/superpowers/specs/2026-07-16-tests-ui-y-refactor-escalable.md`](../specs/2026-07-16-tests-ui-y-refactor-escalable.md) — leer primero.

**Goal:** Llevar `task-drive-manager` al patrón validado en `ia-drive-doc-processor` (tests colocados, lógica en hooks finos, componentes reutilizables) sin cambiar comportamiento, aplicando los refactors del análisis de salud y subiendo la cobertura de UI. Se ejecuta en rebanadas verticales, empezando por el piloto `TareaForm`.

**Architecture:** La lógica de datos y de formularios migra de los componentes a **hooks testeables** (`useCachedQuery` → hooks por entidad → `useTareaForm`). Los componentes quedan como JSX fino. La validación se unifica en un único schema Zod. El boilerplate de los API routes se centraliza en un wrapper `withAuth`. Los helpers duplicados se consolidan en `lib/`. Una regla lint `max-lines` actúa de red preventiva. Todo con TDD estricto y la suite completa verde tras cada task.

**Tech Stack (sin cambios):**
- **Runtime:** Next.js 16, React 19, TypeScript 5
- **Testing:** Vitest 4 + @testing-library/react + user-event + jsdom (ya configurado)
- **Data fetching:** @tanstack/react-query 5
- **Validación:** Zod 4
- **Offline:** Dexie (IndexedDB) + Serwist

---

## Progreso (tracker live)

> **Para retomar tras un reset de cuota:** buscá la primera task con `[ ]` y arrancá desde ahí. `[~]` = en curso (revisar si el commit ya se hizo).

| # | Task | Status | Commit (GitLens) |
|---|---|---|---|
| 1 | Primitiva `useCachedQuery` (TDD) | [x] | pendiente — lo commiteás vos |
| 2 | Hooks de datos por entidad (TDD) | [x] | pendiente — lo commiteás vos |
| 3 | Unificar schema cliente/servidor (TDD) | [x] | pendiente — lo commiteás vos |
| 4 | Extraer `useTareaForm` (TDD) | [x] | pendiente — lo commiteás vos |
| 5 | `TareaForm` fino + test de componente | [x] | pendiente — lo commiteás vos |
| 6 | Helpers compartidos `thumbUrl` + `filterTareas` (TDD) | [x] | pendiente — lo commiteás vos |
| 7 | Wrapper `withAuth` para API routes (TDD) | [x] | pendiente — lo commiteás vos |
| 8 | Regla lint `max-lines` | [x] | pendiente — lo commiteás vos |
| 9 | Replicar patrón: `TareaDetalle` (hook + test) | [x] | pendiente — lo commiteás vos |
| 10 | Replicar patrón: `Dashboard` (tests de lógica) | [x] | pendiente — lo commiteás vos · FileUploader data-driven diferido (D7: emergente) |
| 11 | Documentar convención (testing + estructura) | [x] | pendiente — lo commiteás vos |
| 12 | [Gated] Split `google-sheets` por entidad | [x] | pendiente — lo commiteás vos · gate cumplido con `tests/lib/google-sheets-crud.test.ts` (11 tests). Split en `lib/sheets/{core,edificios,tareas,usuarios,config}.ts` + barrel. **Demo-mode como capa: diferido** (D7 — guards `if(isDemoMode())` ya localizados; sin valor urgente) |

**Leyenda:** `[ ]` Pendiente · `[~]` En curso · `[x]` Completada

---

## File Structure

### Archivos a crear

| Archivo | Responsabilidad | Task |
|---|---|---|
| `hooks/useCachedQuery.ts` (+`.test.tsx`) | Primitiva query con fallback offline | 1 ✅ |
| `hooks/queries.ts` (+`.test.tsx`) | Hooks de datos por entidad | 2 |
| `components/tareas/hooks/useTareaForm.ts` (+`.test.tsx`) | Lógica del form de tareas | 4 |
| `components/tareas/TareaForm.test.tsx` | Test de componente (user-event) | 5 |
| `lib/drive-url.ts` (+`.test.ts`) | `thumbUrl` centralizado | 6 |
| `lib/tareas-filter.ts` (+`.test.ts`) | `filterTareas` puro compartido | 6 |
| `lib/http/withAuth.ts` (+`.test.ts`) | Wrapper de auth/errores para routes | 7 |
| `components/tareas/hooks/useTareaDetalle.ts` (+`.test.tsx`) | Lógica del detalle | 9 |
| `docs/CONTRIBUTING-tests.md` | Convención de tests + estructura | 11 |

### Archivos a modificar

| Archivo | Cambio | Task |
|---|---|---|
| `vitest.config.ts` | Incluir tests colocados | 1 ✅ |
| `lib/schemas.ts` | Exponer schema base reutilizable | 3 |
| `components/tareas/TareaForm.tsx` | Consumir hooks; usar schema único; quedar fino | 3, 4, 5 |
| `components/tareas/FileUploader.tsx` | `thumbUrl` importado; data-driven | 6, 10 |
| `components/tareas/TareaDetalle.tsx` | `thumbUrl` importado; consumir hook | 6, 9 |
| `components/dashboard/Dashboard.tsx` | `filterTareas` importado | 6, 10 |
| `lib/google-sheets.ts` | `filterTareas` importado; (task 12) split | 6, 12 |
| `app/api/**/route.ts` | Adoptar `withAuth` | 7 |
| `eslint.config.mjs` | Regla `max-lines` | 8 |

---

## Tasks

### Task 1: Primitiva `useCachedQuery` (TDD) — ✅ HECHA (commit pendiente)

**Implements:** P1, AC-1
**Files:**
- Create: `hooks/useCachedQuery.ts`, `hooks/useCachedQuery.test.tsx`
- Modify: `vitest.config.ts`

Ya implementada y verde (6/6, suite completa 90/90). Solo resta commitear.

- [ ] **Step 1: Commit**

```powershell
git add hooks/useCachedQuery.ts hooks/useCachedQuery.test.tsx vitest.config.ts
git commit -m "feat(hooks): useCachedQuery — query con fallback offline reutilizable + habilitar tests colocados"
```

Anotar el SHA en la tabla de Progreso y marcar `[x]`.

---

### Task 2: Hooks de datos por entidad (TDD)

**Implements:** P1, Alcance §3, FR-1
**Files:**
- Create: `hooks/queries.ts`, `hooks/queries.test.tsx`

- [ ] **Step 1: Escribir tests fallidos** — que cada hook llame a su `api.X`, cachee, y respete `enabled`.

```tsx
// hooks/queries.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/api-client", () => ({
  api: {
    edificios: { list: vi.fn() },
    dptos: { list: vi.fn() },
    proveedores: { list: vi.fn() },
    configuracion: { get: vi.fn() },
  },
}));
vi.mock("@/lib/offline-db", () => ({
  cacheEdificios: vi.fn(), readCachedEdificios: vi.fn(),
  cacheDptos: vi.fn(), readCachedDptos: vi.fn(),
  cacheConfig: vi.fn(), readCachedConfig: vi.fn(),
  cacheProveedores: vi.fn(), readCachedProveedores: vi.fn(),
}));

import { api } from "@/lib/api-client";
import { useEdificios, useDptos, usePartesComunes, useConfig, useProveedores } from "./queries";

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

beforeEach(() => vi.clearAllMocks());

describe("hooks de datos", () => {
  it("useEdificios trae y cachea", async () => {
    vi.mocked(api.edificios.list).mockResolvedValue([{ nombre: "A" }]);
    const { result } = renderHook(() => useEdificios(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ nombre: "A" }]);
  });

  it("useDptos no ejecuta si no hay edificio", () => {
    const { result } = renderHook(() => useDptos("", false), { wrapper: wrapper() });
    expect(result.current.fetchStatus).toBe("idle");
    expect(api.dptos.list).not.toHaveBeenCalled();
  });

  it("usePartesComunes solo corre cuando parteComun=true", () => {
    const { result } = renderHook(() => usePartesComunes(false), { wrapper: wrapper() });
    expect(result.current.fetchStatus).toBe("idle");
  });
});
```

- [ ] **Step 2: Ejecutar — debe fallar**

```powershell
npx vitest run hooks/queries.test.tsx
```

- [ ] **Step 3: Crear `hooks/queries.ts`** sobre `useCachedQuery`.

```ts
"use client";
import { useCachedQuery } from "./useCachedQuery";
import { api } from "@/lib/api-client";
import {
  cacheEdificios, readCachedEdificios,
  cacheDptos, readCachedDptos,
  cacheConfig, readCachedConfig,
  cacheProveedores, readCachedProveedores,
} from "@/lib/offline-db";

// "Edificio" virtual en la hoja Dptos que agrupa las partes comunes.
export const PARTE_COMUN_EDIFICIO = "Parte Común";

export const useEdificios = () =>
  useCachedQuery({
    queryKey: ["edificios"],
    fetcher: api.edificios.list,
    cache: cacheEdificios,
    readCache: readCachedEdificios,
  });

export const useDptos = (edificio: string, parteComun: boolean) =>
  useCachedQuery({
    queryKey: ["dptos", edificio],
    fetcher: () => api.dptos.list(edificio),
    cache: (d) => cacheDptos(edificio, d),
    readCache: () => readCachedDptos(edificio),
    enabled: !!edificio && !parteComun,
  });

export const usePartesComunes = (parteComun: boolean) =>
  useCachedQuery({
    queryKey: ["dptos", PARTE_COMUN_EDIFICIO],
    fetcher: () => api.dptos.list(PARTE_COMUN_EDIFICIO),
    cache: (d) => cacheDptos(PARTE_COMUN_EDIFICIO, d),
    readCache: () => readCachedDptos(PARTE_COMUN_EDIFICIO),
    enabled: parteComun,
  });

export const useConfig = () =>
  useCachedQuery({
    queryKey: ["configuracion"],
    fetcher: api.configuracion.get,
    cache: cacheConfig,
    readCache: readCachedConfig,
  });

export const useProveedores = () =>
  useCachedQuery({
    queryKey: ["proveedores"],
    fetcher: api.proveedores.list,
    cache: cacheProveedores,
    readCache: readCachedProveedores,
  });
```

- [ ] **Step 4: Re-correr test + suite completa**

```powershell
npx vitest run hooks/queries.test.tsx
npm test
```

Expected: verde. **No se toca `TareaForm` todavía** (eso es Task 4/5).

- [ ] **Step 5: Commit**

```powershell
git add hooks/queries.ts hooks/queries.test.tsx
git commit -m "feat(hooks): hooks de datos por entidad sobre useCachedQuery"
```

---

### Task 3: Unificar schema cliente/servidor (TDD)

**Implements:** P2, FR-2, AC-3
**Files:**
- Modify: `lib/schemas.ts`, `components/tareas/TareaForm.tsx`
- Modify: `tests/lib/schemas.test.ts`

- [ ] **Step 1: Agregar casos al test de schema** que fijen la regla del `dpto` obligatorio (la que hoy está duplicada en el form).

```ts
// tests/lib/schemas.test.ts (sumar)
import { tareaNuevaSchema } from "@/lib/schemas";

it("exige dpto cuando parteComun=false", () => {
  const r = tareaNuevaSchema.safeParse({
    objetivo: "x", fechaInicio: "2026-07-16", fechaEstimada: "2026-07-20",
    edificio: "A", parteComun: false, informe: "y", prioridad: "Media",
  });
  expect(r.success).toBe(false);
});
```

- [ ] **Step 2: Ejecutar** — el caso debe pasar ya (el schema server ya tiene la regla); si falla, ajustar. Objetivo: dejar el test como red de seguridad antes de tocar el form.

- [ ] **Step 3: En `TareaForm.tsx`, eliminar `formSchema` y usar el schema compartido.**

- Borrar el bloque `const formSchema = z.object({...}).superRefine(...)` (líneas ~31-57).
- `resolver: zodResolver(tareaNuevaSchema)` importado de `@/lib/schemas`.
- Ajustar `FormValues` a `z.infer<typeof tareaNuevaSchema>` (o un `.pick`/`.omit` si sobran campos como `rowId`/arrays — resolver con un schema base en `schemas.ts` si hace falta).

Si el server schema tiene campos que el form no maneja, en `lib/schemas.ts` extraer un `tareaFormSchema = tareaNuevaSchema.omit({ rowId: true, imagenes: true, videos: true, documentos: true })` y que el form use ese; el server sigue con `tareaNuevaSchema`. **La regla del `dpto` vive una sola vez.**

- [ ] **Step 4: Correr suite + typecheck**

```powershell
npm test
npx tsc --noEmit
```

Expected: verde. Comportamiento del form idéntico.

- [ ] **Step 5: Commit**

```powershell
git add lib/schemas.ts components/tareas/TareaForm.tsx tests/lib/schemas.test.ts
git commit -m "refactor(schemas): schema único de tareas compartido cliente/servidor"
```

---

### Task 4: Extraer `useTareaForm` (TDD)

**Implements:** P3, FR-1, AC-4
**Files:**
- Create: `components/tareas/hooks/useTareaForm.ts`, `components/tareas/hooks/useTareaForm.test.tsx`
- Modify: `components/tareas/TareaForm.tsx`

- [ ] **Step 1: Escribir tests del hook** (renderHook), calcando `useConsortiumForm.test`: submit online (create) llama `api.tareas.create` y setea success; sin red encola (`enqueueTarea` + `registerBackgroundSync`); modo edit llama `update`; error setea `submitError`.

```tsx
// components/tareas/hooks/useTareaForm.test.tsx (esqueleto)
vi.mock("@/lib/api-client", () => ({ api: { tareas: { create: vi.fn(), update: vi.fn() } } }));
vi.mock("@/lib/offline-db", () => ({ enqueueTarea: vi.fn() }));
vi.mock("@/lib/background-sync", () => ({ registerBackgroundSync: vi.fn() }));
// ... renderHook(() => useTareaForm({ mode: "create", online: true }))
// act submit → expect api.tareas.create llamado, success seteado
```

- [ ] **Step 2: Ejecutar — debe fallar**

- [ ] **Step 3: Crear `useTareaForm.ts`** — mover desde `TareaForm.tsx`: estado de archivos (`imagenes/videos/documentos`), `taskRowId`, `submitError`, `successMsg/successResult`, la función `onSubmit` (create/edit/offline) y `handleSuccessClose`. Recibe `{ mode, initial, online, onSubmitSuccess }` y devuelve lo que el componente necesita. Los datos (`useEdificios`, etc.) pueden quedar en el hook o en el componente; preferir en el hook para dejar el JSX limpio.

- [ ] **Step 4: Re-correr tests + suite + typecheck**

```powershell
npx vitest run components/tareas/hooks/useTareaForm.test.tsx
npm test && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```powershell
git add components/tareas/hooks/useTareaForm.ts components/tareas/hooks/useTareaForm.test.tsx components/tareas/TareaForm.tsx
git commit -m "refactor(tareas): extraer useTareaForm (estado + submit + offline)"
```

---

### Task 5: `TareaForm` fino + test de componente

**Implements:** P3, P6, AC-5
**Files:**
- Modify: `components/tareas/TareaForm.tsx`
- Create: `components/tareas/TareaForm.test.tsx`

- [ ] **Step 1: Test de componente (user-event)** — render con `QueryClientProvider`, mock de `api`; completar campos requeridos, submit, y assert que se llamó `api.tareas.create` (o que se muestra el estado de éxito). También un caso de validación (submit vacío → mensajes de error).

- [ ] **Step 2: Ejecutar — ajustar hasta verde.** El componente ya consume `useTareaForm` + hooks de datos; su cuerpo queda JSX.

- [ ] **Step 3: Verificar tamaño** (AC-5)

```powershell
(Get-Content components/tareas/TareaForm.tsx | Measure-Object -Line).Lines
```

Expected: **≤ ~250 líneas**.

- [ ] **Step 4: Suite + typecheck + build**

```powershell
npm test && npx tsc --noEmit && npm run build
```

- [ ] **Step 5: Commit**

```powershell
git add components/tareas/TareaForm.tsx components/tareas/TareaForm.test.tsx
git commit -m "refactor(tareas): TareaForm fino consumiendo hooks + test de componente"
```

**→ Fin del piloto. El molde queda fijado: hook fino + componente fino + tests colocados.**

---

### Task 6: Helpers compartidos `thumbUrl` + `filterTareas` (TDD)

**Implements:** P5, AC-6
**Files:**
- Create: `lib/drive-url.ts` (+test), `lib/tareas-filter.ts` (+test)
- Modify: `FileUploader.tsx`, `TareaDetalle.tsx`, `Dashboard.tsx`, `lib/google-sheets.ts`

- [ ] **Step 1: Tests** de `thumbUrl(url, size)` (extrae fileId, arma thumbnail, fallback si no matchea) y `filterTareas(tareas, filters)` (las 6 condiciones: edificio/estado/prioridad/supervisor/desde/hasta).

- [ ] **Step 2: Ejecutar — fallan.**

- [ ] **Step 3: Crear helpers** y reemplazar los duplicados:
  - `thumbUrl` en `FileUploader.tsx:37` y `TareaDetalle.tsx:30` → import de `lib/drive-url`.
  - Filtro en `Dashboard.tsx:60-68` y `google-sheets.ts:222-230` → `filterTareas`.

- [ ] **Step 4: Suite completa** (asegura que Dashboard/detalle/uploader siguen igual).

- [ ] **Step 5: Commit**

```powershell
git add lib/drive-url.ts lib/tareas-filter.ts lib/*.test.ts components/tareas/FileUploader.tsx components/tareas/TareaDetalle.tsx components/dashboard/Dashboard.tsx lib/google-sheets.ts
git commit -m "refactor(lib): centralizar thumbUrl y filterTareas con tests"
```

---

### Task 7: Wrapper `withAuth` para API routes (TDD)

**Implements:** P4, FR-3, AC-7
**Files:**
- Create: `lib/http/withAuth.ts`, `lib/http/withAuth.test.ts`
- Modify: `app/api/**/route.ts`

- [ ] **Step 1: Test** — `withAuth(handler)` corre `requireSession`, pasa la sesión al handler, y mapea errores con `handleApiError` (401/403/404/400/500 preservados). Inspirarse en `apiHandler.test.ts` / `routeAuthGuard.test.ts` de ia-drive.

- [ ] **Step 2: Ejecutar — falla.**

- [ ] **Step 3: Crear `withAuth`** + un helper `getOwnedTarea` reutilizable (hoy duplicado 4× en `[id]/route.ts`). Adoptarlo primero en `tareas/route.ts` y `tareas/[id]/route.ts`; luego el resto.

- [ ] **Step 4: Suite completa** — los tests de rutas existentes (`tests/api/*`) deben seguir verdes sin cambios (garantía de que los status no cambiaron).

- [ ] **Step 5: Commit**

```powershell
git add lib/http/ app/api
git commit -m "refactor(api): wrapper withAuth + helper de recurso con dueño"
```

---

### Task 8: Regla lint `max-lines`

**Implements:** P7, AC-8
**Files:**
- Modify: `eslint.config.mjs`

- [ ] **Step 1: Agregar reglas** (`warn`, no `error`, para no bloquear):

```js
"max-lines": ["warn", { max: 400, skipBlankLines: true, skipComments: true }],
"max-lines-per-function": ["warn", { max: 150, skipBlankLines: true, skipComments: true }],
```

- [ ] **Step 2: Correr lint** y revisar qué archivos ya exceden (esperable: `google-sheets.ts` hasta la Task 12). Documentar, no forzar.

```powershell
npm run lint
```

- [ ] **Step 3: Commit**

```powershell
git add eslint.config.mjs
git commit -m "chore(lint): regla max-lines como red preventiva de tamaño"
```

---

### Task 9: Replicar patrón — `TareaDetalle` (hook + test)

**Implements:** P3, P6
**Files:**
- Create: `components/tareas/hooks/useTareaDetalle.ts` (+test)
- Modify: `components/tareas/TareaDetalle.tsx`

- [ ] **Step 1: Test del hook** — mutations (delete/patchEstado/generarReporte) y permisos (`canDelete`).
- [ ] **Step 2: Extraer `useTareaDetalle`** (query + 3 mutations + navegación). Componente queda JSX.
- [ ] **Step 3: Test de componente** (ampliar el existente `tests/components/TareaDetalle.test.tsx` o colocarlo).
- [ ] **Step 4: Suite + typecheck.**
- [ ] **Step 5: Commit** — `refactor(tareas): extraer useTareaDetalle + tests`.

---

### Task 10: Replicar patrón — `FileUploader` data-driven + `Dashboard`

**Implements:** P3 (FileUploader §6 del reporte)
**Files:**
- Modify: `components/tareas/FileUploader.tsx`, `components/dashboard/Dashboard.tsx`

- [ ] **Step 1:** `FileUploader` — extraer un `<UploadSection>` y un array de config para los 3 tipos, respetando las asimetrías (compresión de imagen, cámara/galería). Ampliar el test colocado existente.
- [ ] **Step 2:** `Dashboard` — mover `TablaAnalitica` a su archivo si conviene; usar `filterTareas`. Test de al menos KPIs/tabla.
- [ ] **Step 3: Suite + typecheck.**
- [ ] **Step 4: Commit(s)** por componente.

---

### Task 11: Documentar convención (testing + estructura)

**Implements:** P8, AC-11
**Files:**
- Create: `docs/CONTRIBUTING-tests.md`

- [ ] **Step 1: Escribir la convención**: tests colocados, feature-folders `components/<f>/hooks/`, lógica en hooks finos, estilo `renderHook`/`user-event`, mockear el boundary `api-client`, wrapper `QueryClientProvider` con `retry:false`, regla `max-lines`. Enlazar a `ia-drive-doc-processor` como referencia.
- [ ] **Step 2: Link desde README.**
- [ ] **Step 3: Commit** — `docs: convención de tests y estructura escalable`.

---

### Task 12: [Gated] Split `google-sheets` + aislar `demo-mode`

**Implements:** P3 (§3 del reporte)
**Precondición:** tasks 6 y anteriores completas; cobertura de tests sobre las funciones de `google-sheets` (`tests/lib/google-sheets-*`) verde. **No arrancar sin esa red.**
**Files:**
- Create: `lib/sheets/tareas.ts`, `lib/sheets/usuarios.ts`, `lib/sheets/config.ts`, `lib/sheets/core.ts`, `lib/sheets/index.ts`

- [ ] **Step 1:** Confirmar cobertura existente; sumar tests si falta antes de mover nada.
- [ ] **Step 2:** Split por entidad, re-exportando desde `lib/sheets/index.ts` para no romper imports.
- [ ] **Step 3:** Aislar `demo-mode`: seleccionar implementación (real vs demo) una sola vez en vez de branchear en cada función.
- [ ] **Step 4: Suite completa + typecheck + build** — comportamiento idéntico.
- [ ] **Step 5: Commit** — `refactor(sheets): split por entidad + demo-mode como capa`.

---

## Self-Review (post-write)

### Spec coverage
- [x] P1 queries duplicadas → Tasks 1, 2, 4
- [x] P2 schema duplicado → Task 3
- [x] P3 lógica en componentes → Tasks 4, 5, 9, 10, 12
- [x] P4 boilerplate routes → Task 7
- [x] P5 helpers duplicados → Task 6
- [x] P6 cobertura UI → Tasks 5, 9, 10
- [x] P7 red preventiva → Task 8
- [x] P8 convención → Task 11
- [x] AC-1..AC-11 → distribuidos en las tasks

### Riesgos (con mitigación en el plan)
1. **Refactor rompe comportamiento** → cada task deja la suite verde; los tests de rutas existentes son la red para Task 7; schema test para Task 3.
2. **Sobre-abstracción** → FileUploader/Dashboard (Task 10) respetan asimetrías; componentes UI solo emergentes.
3. **Split de sheets sin cobertura** → Task 12 gated tras verificar tests.

### Orden recomendado de ejecución
1. **Bloque piloto:** Tasks 1 → 2 → 3 → 4 → 5 (fija el molde).
2. **Bloque limpieza:** Tasks 6 → 7 → 8.
3. **Bloque replicación:** Tasks 9 → 10 → 11.
4. **Bloque profundo (gated):** Task 12.

---

## Estimación

- Piloto (1-5): ~3-4h
- Limpieza (6-8): ~2h
- Replicación (9-11): ~2-3h
- Split gated (12): ~2-3h

**Total: ~10-12h** con TDD estricto. Cada task es independiente y commiteable; se puede pausar entre bloques sin dejar el árbol a medias.
