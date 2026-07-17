# Convención de tests y estructura

Esta guía documenta cómo se organizan tests y código en el proyecto para que escale sin
volverse un espagueti. Está calcada del patrón validado en `ia-drive-doc-processor`.

## Principios

1. **La lógica vive en hooks finos.** Los componentes son (casi) solo JSX. El estado,
   los datos (queries/mutations), el submit y los efectos van a un hook `use*` testeable
   con `renderHook`. Ejemplos: [`useTareaForm`](../components/tareas/hooks/useTareaForm.ts),
   [`useTareaDetalle`](../components/tareas/hooks/useTareaDetalle.ts).
2. **Tests colocados.** El `.test.tsx`/`.test.ts` vive **al lado** del archivo que prueba
   (no en un árbol `tests/` paralelo). Se mueve, renombra y borra junto con su código.
   > Los tests históricos de `lib/` y `api/` siguen en `tests/`; se migran de a poco solo
   > al tocar esa zona. Los tests **nuevos** de componentes y hooks nacen colocados.
3. **Feature-folders.** Cada feature agrupa lo suyo: `components/<feature>/` con un
   subdirectorio `hooks/` cuando la lógica lo justifica.
4. **No cambiar comportamiento en refactors.** Un refactor preserva la conducta observable;
   la suite completa queda verde tras cada cambio.
5. **Componentes reutilizables emergentes.** Se extrae un componente a `components/ui/`
   recién cuando se repite (2.º/3.er uso), no de forma anticipada.

## Cómo se testea

- **Hooks:** `renderHook` + `act`/`waitFor`. Se mockea el boundary (`@/lib/api-client`),
  nunca `googleapis` desde la UI. Para hooks que usan React Query, envolver en un
  `QueryClientProvider` con un `QueryClient` nuevo **por test** y `retry: false`.
- **Componentes:** `render` + `@testing-library/user-event`. Se prueba el render y el
  wiring (que al interactuar se llame al hook/boundary correcto, que la validación bloquee).
  La lógica de negocio ya está cubierta por el test del hook.
- **Lógica pura (`lib/`):** tests directos de funciones puras (sin DOM). Ej.
  [`filterTareas`](../lib/tareas-filter.ts), [`dashboard`](../lib/dashboard.ts).
- **API routes:** se envuelven con [`withAuth`](../lib/http/withAuth.ts) (auth + manejo de
  errores común) y se testean con `@vitest-environment node`, mockeando `@/lib/auth`.

Correr todo: `npm test` · typecheck: `npx tsc --noEmit` · lint: `npm run lint`.

## Red preventiva

La regla lint `max-lines` (warn, 400) avisa cuando un archivo se está volviendo un
monstruo. Es una señal para extraer un hook o partir el archivo, no un error que rompe CI.

## Primitivas compartidas

- [`useCachedQuery`](../hooks/useCachedQuery.ts) — query con fallback offline.
- [`hooks/queries.ts`](../hooks/queries.ts) — hooks de datos por entidad (`useEdificios`, etc.).
- [`withAuth`](../lib/http/withAuth.ts) — wrapper de auth/errores para API routes.
- [`schemas.ts`](../lib/schemas.ts) — fuente única de validación (form y servidor comparten schema).
