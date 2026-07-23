# SPEC — Tweaks varios + objeción de tareas (estado "Objetada")

**Fecha:** 2026-07-23
**Estado:** Aprobado (rev. 1)
**Autor:** equipo task-drive-manager
**Plan asociado:** _(se crea con writing-plans)_

Cinco cambios de una misma sesión. #1, #2, #4 son chicos; #3 y #5 son features.

---

## #1 — Placeholder de nueva parte común

En `components/tareas/TareaForm.tsx`, el input de alta de parte común cambia su `placeholder` de `Ej: TERRAZA` a **`Ej: TERRAZA (TODO EN MAYÚSCULA)`**. Solo pista visual (el server ya normaliza a MAYÚSCULAS).

**Criterio:** el input muestra el nuevo placeholder.

---

## #2 — Fecha estimada opcional

`fechaEstimada` pasa a **opcional** en `lib/schemas.ts`, dentro de `tareaBaseFields` (compartido por `tareaFormSchema` y `tareaNuevaSchema`): acepta una fecha ISO **o vacío** (`isoDate.or(z.literal("")).optional()` o equivalente). En `TareaForm` el label deja de implicar obligatoriedad. Si queda vacía se guarda vacía; el resto (mapping, PDF, listado) ya tolera fecha vacía.

**Criterio:** crear una tarea sin fecha estimada no da error de validación.

---

## #3 — Tareas asignadas en la vista Edificios

**Objetivo:** en la vista Edificios, debajo de la tarjeta de cada integrante, mostrar sus **tareas asignadas** en una tarjeta aparte, agrupadas en **En curso** y **Realizadas**.

**Datos:** `EdificiosView` trae **todas las tareas una vez** (nuevo hook `useTareas` en `hooks/edificios-queries.ts`, `queryKey ["tareas-all"]`, fetcher `() => api.tareas.list({})`) y a cada integrante le pasa las suyas (`asignadoA === email`, case-insensitive).

**Nuevo componente** `components/edificios/TareasAsignadasCard.tsx`:
- Props: `{ tareas: Tarea[] }`.
- Dos grupos: **En curso** (estado ≠ `Realizada`) y **Realizadas** (estado === `Realizada`). Grupos vacíos no se renderizan. Si no hay tareas, la tarjeta devuelve `null`.
- Cada ítem: `objetivo · edificio` + badge de estado chico, envuelto en `<Link href="/tareas/{rowId}">`.
- Reusa el mapa de colores de estado (badge) existente.

**Layout:** en `EdificiosView`, cada celda del grid pasa a ser `IntegranteCard` + `TareasAsignadasCard` apiladas (envueltas en un `div` con `space-y`). Aplica igual a admin (ve todas) y supervisor (ve solo la suya).

**Criterio:** un integrante con tareas asignadas muestra la tarjeta con los grupos correctos; los ítems linkean al detalle; sin tareas no aparece la tarjeta.

---

## #4 — Fecha en el comentario de Revisión

En el detalle de la tarea (`TareaDetalle`, sección **Comentarios**), el subtítulo "Revisión" muestra la fecha (solo día) de `revisionEn`: **`Revisión - 23/7/2026`** (formateada con el util de fechas del repo). El dato ya se persiste (`revisionEn` se setea en la transición `revisar`); es solo mostrarlo.

**Criterio:** una tarea con `revisionEn` seteado muestra "Revisión - {fecha}" junto al comentario de revisión.

---

## #5 — Objeción de tareas (nuevo estado "Objetada")

**Objetivo:** que el admin pueda **objetar** una tarea que está En Revisión (rechazarla con un motivo), dejándola en un estado explícito **`Objetada`**; el asignado ve el motivo, corrige y la **reenvía a revisión**.

### Máquina de estados (suma `Objetada`)

Enum nuevo: `Sin asignar | Asignada | Aceptada | En Proceso | En Revisión | Objetada | Realizada`.

```
En Revisión ──(admin: Objetar)──▶ Objetada ──(asignado: Reenviar a revisión)──▶ En Revisión
     └──(admin: Cerrar)──▶ Realizada
```

- El **cierre automático a 72 h** aplica **solo** desde `En Revisión` (no desde `Objetada`).

### Transiciones

| Acción | Quién | Origen → Destino | Efectos |
|---|---|---|---|
| **objetar** (NUEVA) | admin | En Revisión → **Objetada** | set `notaObjecion` (**requerido**, 400 si vacío), `objetadaEn` = now |
| **revisar** (extendida) | asignado | En Proceso **o Objetada** → En Revisión | set `revisionEn` = now, **pisa** `comentarioRevision` con el nuevo |

### Modelo de datos

- Columnas nuevas en `Tareas` (**ya creadas por Jony**): `nota_objecion`, `objetada_en`.
- Tipo `Tarea` suma `notaObjecion?: string` y `objetadaEn?: string` (ISO datetime).
- Mapping `rowToTarea`/`tareaToRow` por header (posición libre).
- **Ampliar el rango de lectura:** con 28 columnas se supera la `Z`. Cambiar `TAREAS_RANGE` (`lib/sheets/core.ts`) y `getTareasHeaderMap` (`lib/sheets/tareas.ts`) de `A:Z`/`A1:Z1` a **`A:AD`**/`A1:AD1`.

### API / cliente

- `tareaTransicionSchema.accion` suma `"objetar"`.
- `PATCH /api/tareas/[id]`: nueva rama `objetar` (admin-only; valida origen `En Revisión`; `nota` requerida → 400 si vacía; set estado `Objetada` + `notaObjecion` + `objetadaEn`). La rama `revisar` acepta origen `En Proceso` **o** `Objetada`.
- `api-client` y `useTareaDetalle`: la unión de acciones de `transicionar` suma `"objetar"`.

### UI

- **`AccionesTarea`**, admin, tarea En Revisión: botones **"Cerrar (dar por realizada)"** y **"Objetar"** (motivo requerido; deshabilitado si el textarea está vacío). Reusa el textarea existente.
- **`AccionesTarea`**, asignado, tarea **Objetada**: muestra la objeción (`Objeción - {fecha}` + texto) + un textarea + botón **"Reenviar a revisión"** (`transicionar({ accion: "revisar", comentario })`).
- **`TareaDetalle`** (Comentarios): nueva línea **`Objeción - {fecha objetadaEn}`** + el texto de `notaObjecion`, visible cuando existe.
- **Badges / colores:** sumar `Objetada` a los mapas de estado (page `/tareas`, `TareaDetalle`, `Dashboard`), a los arrays `ESTADOS` de filtros, y a la agrupación del dashboard (`buildKpis.porEstado`, `groupByEdificio` → `Objetada` cuenta como "en curso"; el KPI "En curso" del Dashboard la suma). En `TareasAsignadasCard` (#3) `Objetada` cae naturalmente en "En curso".

**Criterios:**
- Admin objeta una tarea En Revisión con motivo → queda **Objetada** con `notaObjecion`/`objetadaEn`; sin motivo → 400.
- Un no-admin no puede objetar (403).
- El asignado reenvía una Objetada → vuelve a **En Revisión** con nuevo `comentarioRevision` (pisa el anterior) y `revisionEn` actualizado.
- El detalle muestra "Objeción - {fecha}" + texto.

---

## Testing (las 5)

- **#2:** `tareaFormSchema`/`tareaNuevaSchema` aceptan `fechaEstimada` vacía.
- **#3:** RTL de `TareasAsignadasCard` (agrupa En curso/Realizadas, oculta vacíos, ítems son links).
- **#4/#5:** RTL de `TareaDetalle` — muestra "Revisión - {fecha}" y "Objeción - {fecha}".
- **#5:** mapping de `nota_objecion`/`objetada_en`; API `objetar` (admin-only 403, origen inválido 409, motivo vacío 400); `revisar` desde `Objetada`.
- Mantener verde: `vitest` + `tsc` + `lint` + `build`.

## Fuera de alcance

- Historial de múltiples objeciones (se guarda solo la última).
- Notificaciones.
