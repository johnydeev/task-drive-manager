# SPEC — Reestructura de tablas en Google Sheets (legibilidad + escalabilidad a DB)

**Fecha:** 2026-07-20
**Estado:** Borrador (rev. 1)
**Autor:** equipo task-drive-manager
**Plan asociado:** _(pendiente — se crea con writing-plans tras aprobar este spec)_
**Enfoque elegido:** ② Relacional pragmático — cada hoja se modela como una tabla real (id estable + FKs por id/CUIT), **manteniendo columnas legibles** (nombre visible junto al id) porque las hojas se editan a mano ocasionalmente.
**Modalidad:** Opción C — plano completo ahora, aplicación **por fases** (bajo riesgo primero).

---

## 1. Contexto

`task-drive-manager` está en producción y usa **Google Sheets como fuente de verdad** (no hay DB). La app maneja 7 hojas repartidas en dos archivos:

- **Archivo principal** (`GOOGLE_SHEET_ID`) — hojas que **sí** rediseñamos: `Tareas`, `Dptos`, `Usuarios`, `Directivas`, `Asignaciones`, `Configuracion`.
- **Archivo externo** (`GOOGLE_CONSORCIOS_SHEET_ID`, propiedad de la app *ia-drive-doc-processor*, **read-only** para nosotros) — hoja `_Consorcios` (maestro de edificios: `NOMBRE CANÓNICO`, `CUIT`, `NOMBRES ALTERNATIVOS`, `ALIAS`, `ACTIVO`) y `_Proveedores`.

La hoja `Edificios` del archivo principal está **deprecada**: `getEdificios()` la lee (`lib/sheets/edificios.ts:12`) pero **ningún código de producción la usa** — la ruta real `app/api/edificios/route.ts` toma los edificios de `getConsorciosActivos()` (`_Consorcios`). Queda fuera del modelo vivo (candidata a eliminar).

## 2. Problema a resolver

La estructura actual es un backend de planilla que creció por acreción. Los problemas que traban tanto la **legibilidad** como una futura **migración a base de datos relacional**:

| # | Problema | Hoy |
|---|---|---|
| P1 | Media como grupo repetido en una celda | `Tareas` guarda `imagenes`/`videos`/`documentos` como arrays JSON dentro de una celda (`lib/sheets/tareas.ts:74`). Una DB no puede guardar listas en una celda. |
| P2 | Referencias por nombre, frágiles | `Tareas.edificio`, `Dptos.Edificio ref` y `Asignaciones.edificio` referencian el edificio **por nombre**. Como `_Consorcios` usa nombre canónico y la app vieja otro formato, hay un hack `normalizeEdificio()` (`lib/sheets/edificios.ts:27`) para matchear. Un rename rompe todo. |
| P3 | Cruft en el layout | Columnas `O reservado` / `P reservado2` vacías en el medio de `Tareas`; además tablas auxiliares metidas en columnas altas de la pestaña `Tareas` que obligan a evitar `append` (`lib/sheets/tareas.ts:173-177`). |
| P4 | Enums y fechas inconsistentes | `parteComun` tolera `TRUE`/`FALSE`/`Sí`; fechas mezclan serial de Excel (legacy) e ISO; enums de estado/prioridad sin validar en escritura. |
| P5 | Sin auditoría | No hay `creado_en`/`actualizado_en` estandarizados; imposible saber cuándo se modificó un registro. |
| P6 | Lectura por índice de columna fijo | El mapeo lee posiciones fijas (`row[16]`, etc.). Reordenar o insertar una columna rompe el parseo silenciosamente. |
| P7 | Asignación de edificios sin integridad | `Asignaciones` permite (hoy) que un edificio se asigne a varios integrantes; no hay unicidad ni indicador de edificios sin asignar. |

## 3. Objetivo y no-objetivos

**Objetivo:** reestructurar las 6 hojas vivas para que **cada hoja sea una tabla relacional** (PK estable, FKs por id/CUIT, tablas hijas para grupos repetidos, enums/fechas normalizados, auditoría), **sin perder legibilidad manual** (columnas de nombre visible junto a los ids). El resultado debe migrarse a una DB relacional exportando cada hoja 1:1, sin transformaciones.

**No-objetivos:**
- **No** migramos a una DB real en este trabajo (eso es futuro; acá dejamos las hojas "DB-ready").
- **No** tocamos el archivo externo `_Consorcios`/`_Proveedores` (read-only, de otra app).
- **No** cambiamos el identificador `rowId` de las tareas (es load-bearing — ver §5).
- **No** cambiamos el flujo funcional de la app (crear/editar/cerrar tareas y directivas siguen igual de cara al usuario).
- **No** aplicamos full-normalize / 3NF estricto (enfoque ③, descartado por legibilidad y YAGNI).

## 4. Restricciones de diseño

| # | Restricción | Consecuencia |
|---|---|---|
| C1 | Las hojas se editan **a mano ocasionalmente** (admin) | Legibilidad obligatoria: nombre visible junto a cada id/CUIT; nada de solo-ids crípticos. |
| C2 | `_Consorcios` es externo y read-only | La identidad del edificio vive afuera. Referenciamos por **CUIT** (id estable de `_Consorcios`), no lo reproducimos localmente. |
| C3 | El `rowId` (timestamp ISO) de `Tareas` está entrelazado con Drive, offline y parseo | No se reemplaza. Se lo lee conceptualmente como PK `id`. |
| C4 | App en producción | Los cambios se aplican por fases, con backfill de datos existentes (~995 tareas, ~3001 dptos), sin downtime perceptible. |

## 5. Por qué el `id` de Tareas no cambia

El `rowId` (ej. `2026-07-10T14:30:00.000Z`) no es solo una PK; está acoplado a tres mecanismos:

1. **Drive:** la carpeta de archivos de la tarea se deriva del `rowId`.
2. **Offline:** el cliente **genera** el `rowId` antes de crear la fila, para vincular los archivos ya subidos sin conexión (`lib/sheets/tareas.ts:151-153`).
3. **Parseo:** el regex `looksLikeRowId` (`lib/sheets/tareas.ts:90-93`) usa el formato ISO para distinguir filas de datos de headers/basura.

**Decisión:** se mantiene el valor tal cual, sin id corto paralelo. En headers/docs se lo renombra conceptualmente de `rowId` a `id` (una PK de tipo texto/timestamp es válida en cualquier DB). Idéntico criterio para `Directivas.id`.

## 6. Convención transversal: lectura por nombre de header

Hoy el código lee posiciones fijas (`row[16]`). Se cambia a **leer por nombre de header** (fila 1 → índice de columna). Así, agregar/reordenar/borrar columnas deja de ser un cambio riesgoso, lo cual es prerequisito para poder aplicar el resto por fases con seguridad.

- Utilidad nueva en `lib/sheets/core.ts`: dado el header row y un nombre de columna, devuelve el índice; los mapeos `rowToX`/`xToRow` pasan a usarla.
- Es el **primer paso de la Fase 1** (habilita todo lo demás).

## 6.1 Convención de nombres + mapa de renombrado

**Convención (aplica a TODOS los headers de TODAS las hojas):**

- `snake_case`, minúsculas, **ASCII** (sin acentos ni `ñ`: "común" → `comun`), sin espacios.
- Palabras en español.
- **FKs:** `<entidad>_<clave>` → `edificio_cuit`, `tarea_id`.
- **Timestamps de auditoría:** `creado_en`, `actualizado_en`. **De ciclo de vida:** `<estado>_en` → `aceptada_en`, `realizada_en`, `objetada_en`.
- **Booleanos:** el nombre del atributo → `activo`, `parte_comun`.
- Los **campos TS del código siguen en camelCase** (`objetivo`, `fechaInicio`, `edificioCuit`…). La utilidad de lectura por header (§6) es el **único lugar** que mapea header `snake_case` ↔ campo TS `camelCase`.

Notación: **NUEVA** = columna que no existe hoy · ~~tachado~~ = se elimina de la hoja.

### `Tareas`

| Header actual | Header nuevo | Tipo |
|---|---|---|
| `rowId` | `id` | texto (ISO timestamp) — PK |
| `Objetivo` | `objetivo` | texto |
| `Fecha inicio` | `fecha_inicio` | fecha `YYYY-MM-DD` |
| `Fecha estimada` | `fecha_estimada` | fecha `YYYY-MM-DD` |
| `Edificio` | `edificio` | texto _(visible)_ |
| — | `edificio_cuit` **NUEVA** | texto — FK → `_Consorcios.CUIT` |
| `Parte común` | `parte_comun` | booleano |
| `Dpto / Parte común` | `dpto` | texto |
| `Informe` | `informe` | texto |
| `comentario en proceso` | `comentario_en_proceso` | texto |
| `comentario realizado` | `comentario_realizado` | texto |
| `Imágenes` | ~~se elimina~~ → `TareaArchivos` | — |
| `Videos` | ~~se elimina~~ → `TareaArchivos` | — |
| `Documentos` | ~~se elimina~~ → `TareaArchivos` | — |
| `Reporte URL` | `reporte_url` | texto (URL) — uno-a-uno (§7.10) |
| `(reservado)` | ~~se elimina~~ | — |
| `(reservado2)` | ~~se elimina~~ | — |
| `Proveedor` | `proveedor` | texto |
| `Estado` | `estado` | enum `Pendiente\|En Proceso\|Realizado` |
| `Presupuesto` | `presupuesto` | número |
| `Fecha realizado` | `fecha_realizado` | fecha `YYYY-MM-DD` |
| `Prioridad` | `prioridad` | enum `Alta\|Media\|Baja` |
| `Supervisor` | `supervisor` | texto (email) — FK → `Usuarios.email` |
| — | `creado_en` **NUEVA** | ISO datetime |
| — | `actualizado_en` **NUEVA** | ISO datetime |

> Nota enums: los valores `Pendiente/En Proceso/Realizado` y `Alta/Media/Baja` se mantienen con esa capitalización (son valores de dato, no nombres de columna); solo los **headers** van a snake_case.

### `TareaArchivos` _(hoja hija NUEVA)_

Nombre de pestaña: **`TareaArchivos`** (sigue el estilo de las pestañas existentes; solo las **columnas** van snake_case). Todas las columnas son nuevas.

| Header | Tipo |
|---|---|
| `id` | texto (nanoid) — PK |
| `tarea_id` | texto (ISO) — FK → `Tareas.id` |
| `tipo` | enum `imagen\|video\|documento` |
| `url` | texto (URL) |
| `orden` | número |
| `creado_en` | ISO datetime |

### `Dptos`

| Header actual | Header nuevo | Tipo |
|---|---|---|
| `ID dpto` | `id_dpto` | texto — PK |
| `DPTO` | `dpto` | texto |
| `Edificio ref` | `edificio_ref` | texto _(visible)_ |
| — | `edificio_cuit` **NUEVA** | texto — FK → `_Consorcios.CUIT` |

### `Usuarios`

| Header actual | Header nuevo | Tipo |
|---|---|---|
| `email` | `email` | texto — PK |
| `nombre` | `nombre` | texto |
| `rol` | `rol` | enum `admin\|supervisor` |
| `activo` | `activo` | booleano |
| `creado_en` | `creado_en` | ISO datetime _(ya OK)_ |
| — | `actualizado_en` **NUEVA** | ISO datetime |

### `Directivas`

| Header actual | Header nuevo | Tipo |
|---|---|---|
| `id` | `id` | texto (ISO) — PK |
| `descripcion` | `descripcion` | texto |
| `fecha` | `fecha` | fecha `YYYY-MM-DD` |
| `asignadoA` | `asignado_a` | texto (email) — FK → `Usuarios.email` |
| `creadoPor` | `creado_por` | texto (email) — FK → `Usuarios.email` |
| `creadoEn` | `creado_en` | ISO datetime |
| `estado` | `estado` | enum `Asignada\|Aceptada\|Realizada` |
| `aceptadaEn` | `aceptada_en` | ISO datetime |
| `realizadaEn` | `realizada_en` | ISO datetime |
| `notaCierre` | `nota_cierre` | texto |
| `objetadaEn` | `objetada_en` | ISO datetime |
| `notaObjecion` | `nota_objecion` | texto |
| — | `actualizado_en` **NUEVA** | ISO datetime |

### `Asignaciones`

| Header actual | Header nuevo | Tipo |
|---|---|---|
| `edificio` | `edificio` | texto _(visible)_ |
| — | `edificio_cuit` **NUEVA** | texto — **PK ÚNICO**, FK → `_Consorcios.CUIT` (§8) |
| `email` | `email` | texto — FK → `Usuarios.email` |
| — | `creado_en` **NUEVA / opcional** | ISO datetime |

### `Configuracion`

| Header actual | Header nuevo | Tipo |
|---|---|---|
| `clave` | `clave` | texto — PK |
| `valor` | `valor` | texto (tipado por convención) |
| `descripcion` | `descripcion` | texto |

_(Pestaña sigue **sin tilde**: `Configuracion`.)_

---

## 7. Modelo objetivo — detalle por tabla

> Los nombres de columna en el detalle de abajo usan los headers canónicos `snake_case` definidos en §6.1.

Notación: **PK** = clave primaria · **FK** = clave foránea · _(visible)_ = columna legible para el humano · **NUEVA** = columna/hoja nueva.

### 7.1 `Tareas` _(entidad padre)_

Layout objetivo (orden lógico; con lectura por header el orden exacto es flexible):

| Columna | Tipo | Notas |
|---|---|---|
| `id` | texto (ISO timestamp) | **PK.** Antes `rowId`. Valor sin cambios (§5). |
| `objetivo` | texto | |
| `fecha_inicio` | fecha `YYYY-MM-DD` | Normalizada (§7.9). |
| `fecha_estimada` | fecha `YYYY-MM-DD` | |
| `edificio` _(visible)_ | texto | Nombre para el humano. |
| `edificio_cuit` | texto | **NUEVA. FK → `_Consorcios.CUIT`.** Enlace estable. |
| `parte_comun` | booleano `TRUE`/`FALSE` | Unificado (se elimina el legacy `Sí`). |
| `dpto` | texto | Ubicación (dpto o parte común específica). |
| `informe` | texto | |
| `comentario_en_proceso` | texto | |
| `comentario_realizado` | texto | |
| `reporte_url` | texto (URL) | **Se queda como columna (uno-a-uno).** Único reporte vigente: al regenerar se pisa (ver §7.10). |
| `proveedor` | texto | Nombre del proveedor (de `_Proveedores`). |
| `estado` | enum | `Pendiente \| En Proceso \| Realizado`. |
| `presupuesto` | número | |
| `fecha_realizado` | fecha `YYYY-MM-DD` | |
| `prioridad` | enum | `Alta \| Media \| Baja`. |
| `supervisor` | texto (email) | **FK → `Usuarios.email`.** |
| `creado_en` | ISO datetime | **NUEVA.** Auditoría. Backfill = `id` (el rowId ya es su timestamp de creación). |
| `actualizado_en` | ISO datetime | **NUEVA.** Se pisa en cada update. |

**Se eliminan de `Tareas`:** `imagenes`, `videos`, `documentos` (→ `TareaArchivos`, §7.2), `O reservado`, `P reservado2`, y las tablas auxiliares de columnas altas (§7.7).

### 7.2 `TareaArchivos` _(hoja hija NUEVA)_

Tabla hija de media: **1 fila por archivo**.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | texto (nanoid) | **PK.** Id propio del archivo (ej. `arch_a1b2c3`). Se usa `nanoid` (ya es dependencia). |
| `tarea_id` | texto (ISO) | **FK → `Tareas.id`.** Enlace al padre. |
| `tipo` | enum | `imagen \| video \| documento`. |
| `url` | texto (URL) | URL pública de Drive. |
| `orden` | número | Preserva el orden en la galería (1, 2, 3…). |
| `creado_en` | ISO datetime | Fecha de subida. |

Módulo nuevo `lib/sheets/tarea-archivos.ts`: `getArchivosByTarea(tareaId)`, `appendArchivo(...)`, `deleteArchivo(...)`. `TareaDetalle` compone `imagenes/videos/documentos` desde acá. **El `tipo` NO incluye `reporte`** — el reporte es uno-a-uno y vive en `Tareas.reporte_url` (§7.10).

### 7.3 `Dptos`

| Columna | Tipo | Notas |
|---|---|---|
| `id_dpto` | texto | **PK.** Confirmar unicidad/estabilidad; sanear huecos o duplicados. |
| `dpto` | texto | Etiqueta del dpto / parte común. |
| `edificio_ref` _(visible)_ | texto | Nombre del edificio. |
| `edificio_cuit` | texto | **NUEVA. FK → `_Consorcios.CUIT`.** Mata el hack de matcheo por nombre. |

Auditoría (`creado_en`/`actualizado_en`): **opcional / baja prioridad** (los dptos casi no cambian).

### 7.4 `Usuarios`

| Columna | Tipo | Notas |
|---|---|---|
| `email` | texto | **PK** (id natural). |
| `nombre` | texto | |
| `rol` | enum | `admin \| supervisor`. |
| `activo` | booleano `TRUE`/`FALSE` | Normalizado. |
| `creado_en` | ISO datetime | Ya existe. |
| `actualizado_en` | ISO datetime | **NUEVA.** Registra cambios de rol/activación. |

Es la hoja que **menos cambia**.

### 7.5 `Directivas`

Ya está bien modelada. Cambios:

- **Enums/fechas:** `estado` fijo a `Asignada \| Aceptada \| Realizada` (`Cerrada` es **derivado**, no se persiste — ya resuelto en `lib/directivas-estado.ts`); `fecha` a `YYYY-MM-DD`; `creado_en`/`aceptada_en`/`realizada_en`/`objetada_en` a ISO datetime.
- **FKs:** `asignado_a` y `creado_por` (emails) documentados como **FK → `Usuarios.email`**. Renombre de headers: `asignadoA`→`asignado_a`, `creadoPor`→`creado_por`, `creadoEn`→`creado_en`, etc. (mapa completo en §6.1).
- **`id`:** timestamp ISO, se mantiene (sin dependencia de Drive). Se lee como PK.
- **`actualizado_en`:** **NUEVA** — hoy el estado muta (aceptar/cerrar/objetar) sin un timestamp único de última modificación.

### 7.6 `Asignaciones` _(usuario → edificios; ver reglas §8)_

| Columna | Tipo | Notas |
|---|---|---|
| `edificio_cuit` | texto | **PK — ÚNICO.** Un edificio se asigna a **como máximo un** integrante (§8). |
| `edificio` _(visible)_ | texto | Nombre del edificio. |
| `email` | texto | **FK → `Usuarios.email`.** Integrante dueño del edificio. |
| `creado_en` | ISO datetime | **NUEVA / opcional.** Cuándo se asignó. |

Relación **uno-a-muchos** (un integrante → varios edificios; cada edificio → un integrante). Reemplaza el modelo previo `email | edificio` sin unicidad.

> Evolución respecto del spec `2026-07-17-edificios-asignaciones.md`: la asignación sigue siendo **organizativa** (no restringe quién puede crear tareas), pero ahora tiene **integridad de unicidad** por edificio.

### 7.7 Tablas auxiliares en columnas altas de `Tareas`

Existen datos auxiliares en columnas más allá de la `V` en la pestaña `Tareas` (por eso el código evita `append`). **Paso obligatorio antes de borrar:** identificar qué son y quién las usa, y **reubicarlas en su propia pestaña**. No se borran a ciegas. Al quedar limpias, `appendTarea` puede simplificarse (usar `append` estándar).

### 7.8 `Configuracion`

Patrón clave/valor — **ya es** el modelo correcto para una tabla de settings. Único cambio: **documentar el tipo esperado** de cada valor (ej. `maxImagenes` = entero) para tipar la migración. Mantener el nombre de pestaña **sin tilde** (`Configuracion`, ya contemplado en `lib/sheets/core.ts:10`).

### 7.9 Convenciones de valores

- **Fechas de negocio** (`fecha_inicio`, `fecha_estimada`, `fecha_realizado`, `Directivas.fecha`): `YYYY-MM-DD` (fecha de calendario, sin hora ni timezone — evita los líos de timezone ya arrastrados).
- **Timestamps de auditoría/ciclo de vida** (`creado_en`, `actualizado_en`, `aceptada_en`, etc.): ISO datetime completo.
- **Booleanos:** `TRUE`/`FALSE`.
- **Enums:** valores exactos listados arriba; validados con Zod en lectura y escritura.

### 7.10 Comportamiento del reporte (decisión: un solo reporte vigente)

`reporte_url` es **uno-a-uno**: cada tarea tiene, como máximo, **un** PDF de reporte vigente. Al **regenerar**, se **pisa** el anterior.

**Estado actual (a corregir):** hoy Drive **acumula** versiones (`reporte-01.pdf`, `reporte-02.pdf`, …; ver `lib/pdf-generator.tsx:29`) mientras la hoja solo guarda la última URL (`app/api/tareas/[id]/reporte/route.ts:25` hace `updateTarea({ reporteUrl })`, que pisa). Eso deja los PDFs viejos **huérfanos** en Drive.

**Comportamiento objetivo:** al generar/regenerar un reporte, **eliminar el/los PDF(s) anterior(es)** de la subcarpeta `Reporte/` de la tarea (papelera de Drive) **antes o después** de subir el nuevo, dejando un único archivo, y actualizar `reporte_url`. Así la columna es una verdad uno-a-uno y no quedan archivos huérfanos.

> Es un pequeño cambio funcional acoplado a esta decisión de modelado (no una feature nueva). Va en la Fase 2 (§9), es independiente y de bajo alcance.

---

## 8. Reglas de negocio — Asignaciones

| # | Regla |
|---|---|
| R1 | **Unicidad por edificio:** un `edificio_cuit` aparece **como máximo una vez** en `Asignaciones`. Un edificio no puede asignarse a dos integrantes, ni repetirse para el mismo. |
| R2 | **Validación al asignar:** al crear una asignación, rechazar (error de API) si el `edificio_cuit` ya está asignado a **cualquier** integrante. |
| R3 | **Edificios sin asignar (derivado):** `sinAsignar = edificios activos de _Consorcios − edificios presentes en Asignaciones`. Es un valor **calculado**, no se persiste. |
| R4 | **Cartel rojo:** en la vista "Edificios", si `count(sinAsignar) > 0`, mostrar arriba un aviso en rojo: **"Quedan X edificios por asignar"** (X = `count(sinAsignar)`). Si es 0, no se muestra. |

> R4 es un requisito de UI derivado de esta reestructura; la lógica de conteo vive en el data-layer (deriva de `_Consorcios` activos + `Asignaciones`). El diseño visual del cartel se resuelve en el plan/implementación.

---

## 9. Estrategia de migración por fases (Opción C)

### Fase 1 — Bajo riesgo (sin mover datos pesados)

1. **Lectura por header** (§6) — prerequisito.
2. Renombrar headers a los nombres canónicos de §7.
3. Borrar columnas reservadas `O`/`P` (seguras: vacías).
4. Estandarizar enums, fechas (`YYYY-MM-DD`) y booleanos, con validación Zod en lectura/escritura.
5. Agregar `creado_en`/`actualizado_en` (backfill de `creado_en` desde `id`/`rowId` donde aplique).
6. Normalizar `Usuarios` (`activo`, `rol`, `actualizado_en`).

### Fase 2 — Estructural (mueve datos / cambia forma)

7. Crear `TareaArchivos` + módulo `lib/sheets/tarea-archivos.ts`; **explotar** los arrays JSON de las ~995 tareas en filas (respetando `orden`); repuntar `TareaDetalle`/galería y el alta/edición para leer/escribir la hoja hija; quitar `imagenes`/`videos`/`documentos` de `Tareas`.
8. Agregar `edificio_cuit` a `Tareas`, `Dptos`, `Asignaciones`; **backfill** cruzando el nombre contra `_Consorcios` (usando `NOMBRES ALTERNATIVOS`/`ALIAS` para los no-exactos); pasar las lecturas a matchear por CUIT.
9. Aplicar unicidad + validación + cartel de `Asignaciones` (§8); migrar `Asignaciones` a PK `edificio_cuit`.
10. Identificar y reubicar las tablas auxiliares de columnas altas de `Tareas` (§7.7); simplificar `appendTarea`.
11. **Reporte único vigente** (§7.10): que la generación/regeneración **elimine el PDF anterior** de la subcarpeta `Reporte/` antes de dejar el nuevo. Independiente del resto de la Fase 2.

### Backfills (datos existentes)

| Backfill | Volumen | Método |
|---|---|---|
| `Tareas.creado_en` | ~995 | Copiar de `id`/`rowId`. |
| `Tareas.edificio_cuit` | ~995 | Cruce nombre → `_Consorcios` (exacto + alias). Reportar los que no matcheen para resolución manual. |
| `Dptos.edificio_cuit` | ~3001 | Idem (mayor volumen). |
| `Asignaciones.edificio_cuit` | ~6 | Idem (trivial). |
| `TareaArchivos` (explotar media) | ~995 tareas | Parsear arrays JSON de K/L/M → filas con `orden`. |

Cada backfill se implementa como **script idempotente** en `scripts/` (patrón de `scripts/seed-sheets.mjs`), corrible con dry-run.

## 10. Impacto en código

| Área | Cambio |
|---|---|
| `lib/sheets/core.ts` | Utilidad de lectura por header; constantes de headers. |
| `lib/sheets/tareas.ts` | `rowToTarea`/`tareaToRow` por header; quitar media; agregar `edificio_cuit`, `creado_en`, `actualizado_en`; simplificar `appendTarea` tras §7.7. |
| `lib/sheets/tarea-archivos.ts` | **NUEVO** módulo CRUD de la hoja hija. |
| `lib/pdf-generator.tsx` · `app/api/tareas/[id]/reporte/route.ts` · `lib/google-drive.ts` | Reporte único (§7.10): eliminar el PDF anterior de `Reporte/` al regenerar (helper de trash en `google-drive.ts`). |
| `lib/sheets/edificios.ts` | Match por CUIT (retirar dependencia de `normalizeEdificio` para el join principal). |
| `lib/sheets/asignaciones.ts` | Unicidad + validación; PK `edificio_cuit`; conteo de sin-asignar. |
| `lib/sheets/directivas.ts`, `usuarios.ts` | Enums/fechas/`actualizado_en`. |
| `lib/schemas.ts` | Zod para enums/fechas/booleanos y para `TareaArchivo`. |
| `types/index.ts` | Tipo `TareaArchivo`; ajustar `Tarea` (media derivada), `Asignacion` (cuit). |
| Componentes (`TareaDetalle`, `EdificiosView`, alta/edición) | Media desde hoja hija; cartel rojo de sin-asignar. |
| `scripts/` | Scripts de backfill idempotentes. |
| Tests | Colocados por módulo (Vitest + RTL), incluyendo mapping por header, unicidad de asignaciones, explotado de media, backfills. |

## 11. Testing

- **Unitarios:** lectura por header (orden variable), mapping `Tareas`/`TareaArchivos`, normalización de enums/fechas/booleanos, unicidad de `Asignaciones` (R1/R2), conteo de sin-asignar (R3).
- **Componente (RTL):** galería compuesta desde `TareaArchivos`; cartel rojo "Quedan X edificios por asignar" (aparece con X>0, oculto con 0).
- **Backfills:** tests de los scripts sobre fixtures (idempotencia, alias, arrays vacíos, `orden`).
- Mantener verde la suite existente (~84+ tests) tras cada fase.

## 12. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Backfill de CUIT no matchea todos los nombres | Usar `ALIAS`/`NOMBRES ALTERNATIVOS`; **reporte** de no-matcheados para resolución manual; no borrar el nombre visible (queda como fallback). |
| Romper el vínculo con Drive al tocar `Tareas` | No se toca el `rowId` (§5); la media migra por valor de URL, no por regenerar carpetas. |
| Borrar tablas auxiliares que alguien usa | §7.7: identificar y reubicar **antes** de borrar; nunca a ciegas. |
| Cambio de posiciones rompe el parseo | Se hace **primero** la lectura por header (§6), que vuelve inocuos los cambios de columna. |
| Aplicar todo de una | Fases explícitas (§9); cada fase deja la app funcionando y los tests verdes. |
| Borrar el reporte anterior manda un PDF válido a la papelera | Va a **papelera** de Drive (no borrado permanente), recuperable; solo se elimina dentro de la subcarpeta `Reporte/` de esa tarea (§7.10). |

## 13. Fuera de alcance (futuro)

- Migración real a una DB relacional (Postgres u otra).
- Eliminar la hoja `Edificios` deprecada (se puede hacer aparte; no bloquea nada).
- Restringir funcionalmente por asignación de edificios (sigue siendo organizativo, §7.6).
- Lookup tables para enums / 3NF estricto (enfoque ③, descartado).
