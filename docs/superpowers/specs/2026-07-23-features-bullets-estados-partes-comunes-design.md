# SPEC — Features chicas: bullets navegables, distinción de realizadas, Partes Comunes

**Fecha:** 2026-07-23
**Estado:** Aprobado (rev. 1)
**Autor:** equipo task-drive-manager
**Plan asociado:** _(se crea con writing-plans a continuación)_

Tres features independientes, agrupadas en un solo spec por ser chicas y de la misma sesión.

---

## F1 — Bullets de edificio → link a las tareas de ese consorcio (+ hover)

**Contexto:** en la vista Edificios, [`IntegranteCard`](../../components/edificios/IntegranteCard.tsx) muestra los edificios asignados como pills grises (`<span>`) con una `X` de quitar (admin).

**Objetivo:** que el nombre del edificio sea un **link** a `/tareas?edificio=<nombre>` (listado de tareas pre-filtrado por ese consorcio), con **hover** visible. La `X` de quitar queda como botón aparte (no dentro del link).

**Cambios:**
- `IntegranteCard`: el nombre del edificio se envuelve en `<Link href={/tareas?edificio=<encodeURIComponent(nombre)>}>` con clases de hover (fondo/borde más marcado).
- [`app/(app)/tareas/page.tsx`](../../app/(app)/tareas/page.tsx): **lee el query param `edificio`** con `useSearchParams` e inicializa el estado del filtro `edificio` con ese valor (hoy arranca en `""`).

**Criterio de aceptación:** clicar un edificio en la tarjeta abre `/tareas` mostrando solo las tareas de ese edificio; el pill reacciona al hover; la `X` sigue quitando la asignación.

---

## F2 — Distinción visual de realizadas/cerradas (opción C: ✓ verde + color)

**Objetivo:** diferenciar de un vistazo lo "a realizar" de lo "ya realizado", sin atenuar ni tachar. Solo un **ícono ✓ verde** (Check de lucide) además del color de estado que ya existe.

**Cambios:**
- **Directivas** ([`DirectivaItem`](../../components/edificios/DirectivaItem.tsx)): si `estado` es `Realizada` o `Cerrada`, mostrar un ✓ verde junto a la descripción.
- **Tareas asignadas** ([`app/(app)/tareas/page.tsx`](../../app/(app)/tareas/page.tsx)): en las filas con `estado === "Realizada"`, mostrar el mismo ✓ verde.

**Criterio de aceptación:** las directivas Realizada/Cerrada y las tareas Realizada muestran el ✓ verde; las demás no. Sin cambios de color de badge ni atenuado.

---

## F3 — Partes Comunes en su propia tabla + alta con botón `+` (admin)

**Contexto:** hoy las partes comunes son filas de la hoja **`Dptos`** con `edificio_ref = "Parte Común"` (edificio virtual), leídas por [`usePartesComunes`](../../hooks/queries.ts#L41) → `api.dptos.list("Parte Común")`. Es **solo lectura**: no hay forma de agregar una.

**Objetivo:** separar las partes comunes en una hoja propia **`Partes Comunes`** (headers `id`, `nombre`) y permitir que el **admin** agregue una nueva desde el form de tareas, siguiendo la convención de nombres existente (MAYÚSCULAS).

**Decisiones:**
- **Hoja nueva `Partes Comunes`** con columnas `id` + `nombre` (sin `creado_en` — no se necesita trazabilidad). **Ya creada por Jony.**
- **Permiso:** solo el **admin** puede agregar (server-side, `withAdmin`).
- **Normalización al agregar:** `nombre` → **MAYÚSCULAS + trim**, colapsando espacios múltiples a uno (conserva los internos, ej. `POZO DE AIRE Y LUZ`).
- **Unicidad:** rechaza (409) si ya existe un nombre igual normalizado.
- **`id`:** lo genera `appendParteComun` con `nanoid` (ya es dependencia).
- **Migración:** Jony copia a mano las partes comunes actuales de `Dptos` a la hoja nueva. **No se hace script.** (El dropdown lee de la hoja nueva; si está vacía, no muestra opciones.)

**Cambios:**
- Nuevo `lib/sheets/partes-comunes.ts`: `getPartesComunes(): Promise<string[]>` (lee por header, ordena) + `appendParteComun(nombre): Promise<string>` (normaliza, valida unicidad, escribe con `id` nanoid). Soporta `isDemoMode` (lista fija de demo, append no-op).
- Nuevo `app/api/partes-comunes/route.ts`: `GET` (`withAuth`) → `string[]`; `POST` (`withAdmin`) body `{ nombre }` → 201 con el nombre, 409 si duplicado.
- `lib/api-client.ts`: `api.partesComunes.list()` y `api.partesComunes.add(nombre)`.
- `hooks/queries.ts`: `usePartesComunes` pasa a leer de `api.partesComunes.list` (queryKey `["partes-comunes"]`), manteniendo cache offline.
- Nuevo schema Zod `parteComunNuevaSchema` (`{ nombre: string.min(1) }`) en `lib/schemas.ts`.
- Form de tareas ([`TareaForm`](../../components/tareas/TareaForm.tsx) + [`useTareaForm`](../../components/tareas/hooks/useTareaForm.ts)): botón `+` al lado del dropdown "Seleccionar parte común", **solo visible para admin** (vía `useSession`). Abre un input inline para el nombre; al confirmar (`api.partesComunes.add`), invalida `["partes-comunes"]` y selecciona el nuevo valor. Spinner + `disabled` mientras `isPending`.

**Criterio de aceptación:** el dropdown de parte común se alimenta de la hoja `Partes Comunes`. Un admin ve el botón `+`, agrega `terraza` → se guarda como `TERRAZA`, aparece en el dropdown y queda seleccionada. Un no-admin no ve el `+` y el `POST` le da 403. Agregar un duplicado (normalizado) da 409. La tarea sigue guardando el valor elegido en su campo `dpto`.

---

## Testing (las 3)

- **F1:** unit del parseo del query param (o test de que la page inicializa el filtro desde `edificio`); el link apunta a `/tareas?edificio=…`.
- **F2:** RTL — DirectivaItem con `Realizada`/`Cerrada` muestra el ✓; con `Asignada` no. Fila de tarea `Realizada` muestra el ✓.
- **F3:** unit de `getPartesComunes` (mapea por header, ordena) y `appendParteComun` (normaliza MAYÚSCULAS/trim, rechaza duplicado); API `POST` admin-only (403 no-admin, 409 duplicado); RTL del botón `+` (visible admin, oculto no-admin).
- Mantener verde la suite (271 tests) + `tsc` + `lint` + `build`.

## Fuera de alcance

- Eliminar/editar partes comunes existentes (solo alta).
- Migrar la hoja `Dptos` ni tocar los dptos reales.
- Trazabilidad/auditoría de partes comunes.
