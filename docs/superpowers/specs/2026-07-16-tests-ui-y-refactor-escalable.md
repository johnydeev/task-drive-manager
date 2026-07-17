# SPEC — Tests de UI + refactor a arquitectura escalable (hooks + componentes reutilizables)

**Fecha:** 2026-07-16
**Estado:** Aprobado
**Autor:** equipo task-drive-manager
**Plan asociado:** [`docs/superpowers/plans/2026-07-16-tests-ui-y-refactor-escalable.md`](../plans/2026-07-16-tests-ui-y-refactor-escalable.md)
**Referencia de convención:** `ia-drive-doc-processor` (tests colocados, feature-folders `components/hooks/lib`, lógica en hooks finos, primitivas compartidas testeadas)

---

## 1. Contexto

`task-drive-manager` está en producción (Docker self-hosted + Cloudflare Tunnel, v1.0.0) y funcionalmente completo. El código está **sano hoy**: arquitectura por capas clara, componentes organizados por feature, y una base de tests real (23 archivos / 90 tests: API + `lib/` + 2 de componentes) con Vitest + Testing Library + `user-event` ya instalados.

El objetivo de esta iniciativa **no es arreglar algo roto**, es **preparar el proyecto para crecer sin volverse espagueti**. Un análisis de salud de código identificó *puntos de acumulación*: lugares donde, si se siguen agregando features sin tocarlos, se convierten en archivos de miles de líneas difíciles de testear (ej. `TareaForm.tsx` con 500 líneas concentra 5 queries duplicadas + schema duplicado + submit + lógica offline).

El proyecto hermano `ia-drive-doc-processor` ya resolvió este problema con un patrón validado: **tests colocados**, feature-folders con `components/hooks/lib`, **la lógica vive en hooks finos** (`useConsortiumForm`) testeados con `renderHook`, y **componentes casi solo JSX**. Esta iniciativa lleva `task-drive-manager` a ese mismo patrón.

Se ejecuta con la metodología documentada en `docs/superpowers/`: **spec → plan → (por task) TDD → commit → SHA en tracker**.

## 2. Problema a resolver

| # | Problema | Hoy | Después de este cambio |
|---|---|---|---|
| P1 | Queries con fallback offline duplicadas | El patrón `try api → cachear → si falla, leer cache` está copiado 5× en `TareaForm` (~80 líneas) | Un hook `useCachedQuery` + hooks por entidad reutilizables |
| P2 | Schema de validación duplicado cliente/servidor | `formSchema` en `TareaForm` es copia de `tareaNuevaSchema` (incluido el `superRefine`) | Fuente única en `lib/schemas.ts`, el form la deriva |
| P3 | Lógica de negocio embebida en componentes | `TareaForm` (500 líneas) mezcla datos + submit + offline + UI → casi intesteable por unidad | Lógica en `useTareaForm`; componente fino testeable con `user-event` |
| P4 | Boilerplate repetido en API routes | `try/requireSession/handleApiError` + guard de dueño repetido 4× en `[id]/route.ts` | Wrapper `withAuth` (patrón `apiHandler` de ia-drive) |
| P5 | Helpers duplicados | `thumbUrl` copiado en 2 componentes; filtro de tareas duplicado server/cliente | Centralizados en `lib/` con test |
| P6 | Cobertura de UI casi nula | Solo 2 tests de componentes; hooks y forms sin cubrir | Cada hook y componente refactorizado nace con test colocado |
| P7 | Sin red preventiva de tamaño | Nada avisa cuando un archivo se vuelve un monstruo | Regla lint `max-lines` que alerta antes de que pase |
| P8 | Convención de tests/estructura no documentada | Tests en `tests/` central, sin patrón de hooks por feature | Convención escrita y aplicada (colocados + feature-folders) |

## 3. Alcance

### Dentro de scope

- **Primitiva `useCachedQuery`** (query con fallback offline) — *ya implementada como piloto de la task 1, con test colocado.*
- **Hooks de datos por entidad** sobre esa primitiva: `useEdificios`, `useDptos`, `usePartesComunes`, `useConfig`, `useProveedores`.
- **Unificar el schema** de tareas: `tareaNuevaSchema` como fuente única; el form lo consume.
- **Extraer `useTareaForm`** (estado + submit + offline + success); dejar `TareaForm.tsx` como JSX fino.
- **Replicar el patrón** (hook fino + componente + tests colocados) en `TareaDetalle`, `Dashboard` y `FileUploader` según necesidad.
- **Helpers compartidos**: `thumbUrl(url, size)` y `filterTareas(tareas, filters)` en `lib/`, con test.
- **Wrapper de API routes** `withAuth` / helper de recurso con dueño (inspirado en `apiHandler`/`routeAuthGuard` de ia-drive), con test.
- **Componentes UI reutilizables emergentes** (ej. `Field`, `Card`, `Section`): extraer a `components/ui/` cuando se repitan, no de forma anticipada.
- **Split de `lib/google-sheets.ts`** por entidad + aislar `demo-mode` como capa — **solo después** de que existan tests que cubran esas funciones.
- **Regla lint** `max-lines` (warn) como red preventiva.
- **Convención documentada** (colocados + feature-folders + hooks finos) en el repo.
- **Tests colocados** para cada unidad nueva o refactorizada.

### Fuera de scope

- **Migrar a Vercel** — decidido: se sigue self-hosted. (El análisis de viabilidad quedó documentado aparte.)
- **Refactor de upload directo a Drive** — solo tenía sentido para Vercel; no se toca.
- **Reescribir la arquitectura por capas** — está bien, no se reorganiza.
- **Migración big-bang de los ~20 tests existentes** de `tests/` a colocados — se reubican de forma gradual, solo al tocar cada zona.
- **Tests E2E con Playwright/Cypress** — Vitest + Testing Library cubren lo necesario.
- **Cambiar comportamiento observable** de cualquier feature — esta iniciativa es refactor + tests, comportamiento idéntico.
- **Tests de `lib/` y `api/` existentes** que ya están en `tests/` — se quedan ahí; lo colocado aplica a **componentes y hooks** nuevos.

## 4. Decisiones tomadas

Confirmadas en la conversación previa:

| # | Decisión | Valor |
|---|---|---|
| D1 | Ubicación de tests nuevos | **Colocados** al lado del archivo (`.test.tsx`), como ia-drive |
| D2 | Tests viejos en `tests/` | **Migración gradual**, sin big-bang; `lib/` y `api/` pueden quedarse |
| D3 | Estrategia de ejecución | **Rebanadas verticales**; piloto = `TareaForm` |
| D4 | Dónde vive la lógica | En **hooks finos** testeables; componentes casi solo JSX |
| D5 | Disciplina por task | **TDD** (test primero → mínimo → verde → commit), 1 commit por task, SHA en tracker |
| D6 | Comportamiento | **No cambia**; refactor de forma, no de fondo |
| D7 | Componentes reutilizables | **Emergentes**: extraer al 2.º/3.er uso, no anticipado |
| D8 | Primitivas de ia-drive | Traer/adaptar donde apliquen (`withAuth`, `useAsyncAction`) sin sobre-portar |
| D9 | Red preventiva | Regla lint `max-lines` (warn ~400 líneas) |
| D10 | Estructura de carpetas | Feature-folders con `hooks/` cuando la feature lo justifique |

## 5. Requisitos de proceso y funcionales

- **PR-1** — Cada task DEBE seguir TDD: test que falla → implementación mínima → verde → commit.
- **PR-2** — Toda unidad nueva o refactorizada (hook o componente) DEBE quedar con un test colocado.
- **PR-3** — Tras cada task, la **suite completa** (`npm test`) DEBE quedar en verde.
- **PR-4** — Tras cada task, `npx tsc --noEmit` DEBE pasar sin errores.
- **PR-5** — Cada refactor DEBE preservar el **comportamiento observable** de la feature (misma UI, mismos requests, mismos estados).
- **PR-6** — Un split o extracción NO se hace si no hay test que cubra el comportamiento previo (red de seguridad primero).
- **FR-1** — Los hooks de datos DEBEN mantener el fallback offline actual (red → cache → error si no hay cache).
- **FR-2** — La validación del form y del servidor DEBEN derivar del mismo schema (no pueden divergir).
- **FR-3** — El wrapper de API routes DEBE preservar los mismos status/errores actuales (401/403/404/400/500).

## 6. Requisitos no funcionales

- **NFR-1** — Ningún archivo de componente/hook nuevo debería superar ~400 líneas (regla lint `warn`).
- **NFR-2** — Los tests de hooks corren con `renderHook`; los de componentes con `render` + `user-event`, mockeando el boundary (`api-client`).
- **NFR-3** — Los tests no deben depender de red real ni credenciales (mocks de `api`/`googleapis`).
- **NFR-4** — La suite completa debe seguir corriendo en tiempos razonables (< ~15s local).
- **NFR-5** — Cero regresiones: los 90 tests actuales siguen verdes durante toda la iniciativa.
- **NFR-6** — `npm run build` sigue compilando sin errores.

## 7. Estrategia técnica

### 7.1 Arquitectura objetivo (por feature)

```
components/tareas/
  TareaForm.tsx            (fino: JSX + wiring)
  TareaForm.test.tsx       (componente, user-event)
  hooks/
    useTareaForm.ts        (estado + submit + offline)
    useTareaForm.test.tsx  (renderHook)
hooks/                     (cross-feature)
  useCachedQuery.ts (+test)   ← primitiva [task 1, hecha]
  queries.ts (+test)          ← useEdificios/useDptos/useConfig/...
lib/
  schemas.ts                  ← fuente única de validación
  drive-url.ts (+test)        ← thumbUrl
  tareas-filter.ts (+test)    ← filterTareas
  http/withAuth.ts (+test)    ← wrapper de routes
```

### 7.2 Patrón de rebanada vertical

Cada feature se lleva de punta a punta al patrón objetivo antes de pasar a la siguiente. El **piloto `TareaForm`** fija el molde; el resto lo copia. Orden del piloto:

1. `useCachedQuery` (primitiva) — **hecha.**
2. Hooks de datos por entidad sobre la primitiva.
3. Unificar schema (form usa `tareaNuevaSchema`).
4. Extraer `useTareaForm`.
5. `TareaForm.tsx` fino + test de componente.

### 7.3 Referencia de estilo de test

Se calca el estilo de ia-drive: `renderHook` + `act`/`waitFor` para hooks (ver `useConsortiumForm.test`), mock del boundary (`api-client`), wrapper de `QueryClientProvider` con `retry:false` para hooks de query.

## 8. Criterios de aceptación

| # | Criterio | Validación |
|---|---|---|
| AC-1 | `useCachedQuery` cubre red-ok, fallback a cache, error sin cache, cache que falla, `enabled:false` | Test colocado verde |
| AC-2 | `TareaForm` no contiene ningún bloque `useQuery` con try/cache/catch duplicado | Lectura del archivo |
| AC-3 | Existe un único schema de tareas; el form y el server lo comparten | `formSchema` eliminado; test de schema |
| AC-4 | La lógica de submit/offline vive en `useTareaForm` con su test | `renderHook`: create online, enqueue offline, edit, error |
| AC-5 | `TareaForm.tsx` queda por debajo de ~250 líneas y con test de componente | `wc -l` + test `user-event` |
| AC-6 | `thumbUrl` y `filterTareas` existen una sola vez, con test | Grep + tests verdes |
| AC-7 | Los API routes usan el wrapper y conservan sus status/errores | Tests de rutas verdes |
| AC-8 | Regla lint `max-lines` activa y sin errores nuevos | `npm run lint` |
| AC-9 | Suite completa verde tras cada task (≥ 90 tests, creciendo) | `npm test` |
| AC-10 | `npx tsc --noEmit` y `npm run build` sin errores | Local |
| AC-11 | Convención de tests/estructura documentada en el repo | Doc presente |

## 9. Riesgos y mitigaciones

| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| Sobre-abstracción (hooks/componentes genéricos de más) | Media | Complejidad innecesaria | D7: extraer solo al 2.º/3.er uso; wrappers finos y explícitos |
| Un refactor cambia comportamiento sin que un test lo note | Media | Regresión en prod | PR-5/PR-6: test que cubra el comportamiento **antes** de refactorizar |
| Scope creep (querer refactorizar todo de una) | Media | Iniciativa interminable | Rebanadas verticales; una feature a la vez; plan con tasks cerradas |
| Migrar tests viejos de golpe rompe algo | Baja | Ruido/regresión | D2: migración gradual, no big-bang |
| Split de `google-sheets` sin cobertura previa | Media | Romper la capa de datos | Gated: solo tras tests que cubran esas funciones |
| Divergencia con el patrón de ia-drive | Baja | Inconsistencia entre proyectos | Calcar `renderHook`/`apiHandler`; revisar contra el hermano |

## 10. Definición de "hecho"

La iniciativa (o cada rebanada) está completa cuando:

1. Los criterios de aceptación aplicables (AC-1 a AC-11) están verdes.
2. El plan asociado tiene sus tasks completadas, cada una con su commit + SHA en el tracker.
3. `npm test`, `npx tsc --noEmit` y `npm run build` pasan sin errores.
4. Ningún comportamiento observable de la app cambió (verificado por tests + revisión).
5. La convención queda documentada y aplicada de forma consistente.

## 11. Notas para implementadores

- Seguir TDD estricto: test que falla → implementación mínima → verde → commit (1 commit por task).
- Tests de hooks de query: wrapper `QueryClientProvider` con `retry:false` y `QueryClient` **por test** (aislamiento).
- Mockear siempre el boundary (`@/lib/api-client`), nunca `googleapis` desde la UI.
- No mover los tests de `tests/` salvo que ya se esté tocando esa zona (D2).
- Extraer componentes UI recién al segundo/tercer uso real, no antes (D7).
- El split de `google-sheets` y el aislamiento de `demo-mode` van al final y solo con cobertura previa.
- La primitiva `useCachedQuery` ya está hecha (task 1): el plan la registra como completada, pendiente de su commit.
