# SPEC — Cuota de Sheets: cache server-side con reintentos + query única de tareas en cliente

**Fecha:** 2026-09-19
**Estado:** Propuesto (rev. 1)
**Autor:** equipo task-drive-manager
**Plan asociado:** [`../plans/2026-09-19-cache-sheets-y-query-unica.md`](../plans/2026-09-19-cache-sheets-y-query-unica.md)

Bloque 2A de la auditoría del 2026-09-19. Dos piezas que juntas bajan un orden de magnitud las
llamadas a la API de Google Sheets y, de paso, hacen instantáneos los filtros y el detalle de
tareas, y dejan la lista disponible sin red.

| # | Problema | Corrección |
|---|---|---|
| 1 | Cada lectura de la app es una llamada a Google. La cuota es **60 lecturas/min por usuario** y la service account es un solo usuario. Un `PATCH` de tarea son 6–8 llamadas; un `429` llega al browser como "No se pudieron cargar las tareas". | Cache en memoria en `readRange` (TTL 30 s + dedup en vuelo), invalidado por hoja en cada escritura; reintentos con backoff ante `429`/`503`. |
| 2 | Lista, dashboard e informes piden las mismas tareas con tres queries distintas; cada cambio de filtro en la lista es un round-trip. La lista no funciona sin red. | `useTareas()` como única fuente, filtrado en memoria con `filterTareas`, detalle con `initialData` de la lista, cache offline en Dexie. |

---

## Contexto

**Capa de datos.** `lib/sheets/core.ts` expone `readRange(range)` (una llamada `values.get`),
`getSheets()` (cliente memoizado) y `getSheetGid(title)` (cacheado). Diez módulos de `lib/sheets/`
leen con `readRange` (27 sitios) y escriben llamando directo a `getSheets().spreadsheets.values.update`
(18 sitios) o `batchUpdate` con `deleteDimension` (5 sitios: tareas, tarea-archivos, asignaciones,
directivas, visitas). No hay `values.append`: todos los altas usan el patrón «fila libre por columna
A» (`readRange("Hoja!A:A")` → `update` en `A{n+1}`). Solo `Configuracion` (`config.ts`, TTL 5 min)
y `_Consorcios` (`lib/consorcios.ts`, spreadsheet externo vía `lib/sheets-client.ts`) cachean.

**Llamadas por operación hoy** (sin contar `Configuracion`/`_Consorcios`):

| Operación | Llamadas |
|---|---|
| `GET /api/tareas` | 2 (`Tareas` + `TareaArchivos`) |
| `GET /api/tareas/[id]` | 2 |
| `PATCH /api/tareas/[id]` (transición) | `getTareaPersistida` 2 + `updateTarea` (`getTareaByRowId` 2 + header `A1:AD1` 1 + `update` 1) = **6**; con media, +2 |
| `POST /api/tareas` | header 1 + `A:A` 1 + `update` 1 (+ media 2) |
| Revalidación de sesión (bloque 1) | 1 (`Usuarios`) cada 15 min por usuario, pero proxy + layout + primera API del mismo page-load pueden caer los tres fuera de ventana → 3 |

**Cliente.** TanStack Query con `staleTime` 30 s global (`QueryProvider`, cuyo comentario dice
«alineado con cache del backend» — no existe tal cache). Tres queries para las mismas tareas:

| Pantalla | Key | Fetch |
|---|---|---|
| `/tareas` (`app/(app)/tareas/page.tsx`) | `["tareas", params]` | `apiFetch("/api/tareas?edificio=…&estado=…")` — filtro server-side |
| Dashboard | `["tareas","all"]` con `useQuery` directo | `api.tareas.list({})` + `filterTareas` en memoria |
| Edificios | `["tareas","all"]` vía `useTareas()` (`hooks/edificios-queries.ts`, `useCachedQuery` **sin** `cache`/`readCache`) | `api.tareas.list({})` |
| Informes (`useInforme`) | `["informe", edificio, desde, hasta]` | `api.tareas.list({edificio, desde, hasta})` |
| Detalle (`useTareaDetalle`) | `["tarea", id]` | `api.tareas.get(id)` — siempre red, aunque la lista ya tenga esa tarea |

`filterTareas` (`lib/tareas-filter.ts`) es pura y ya la comparten server y dashboard; soporta
`edificio`, `estado`, `prioridad`, `supervisor`, `asignado`, `sinAsignar`, `desde`, `hasta`.

**Offline.** `useCachedQuery` cae a Dexie (`lib/offline-db.ts`, versión 3) cuando la red falla,
con TTL 30 min (`isFresh`). Conectado para edificios, dptos, config, proveedores y partes comunes;
**no** para tareas. `OfflineSyncProvider` invalida `["tareas"]` y `["tareas-all"]` (esta última no
existe desde que `useTareas` pasó a `["tareas","all"]`).

**Tests.** Los tests de `lib/sheets/*` (`asignaciones`, `directivas`, `edificio-ficha`,
`partes-comunes`, `tarea-archivos`, `visitas`) y `tests/lib/google-sheets-crud.test.ts` mockean
`googleapis` a nivel transporte y leen **el mismo rango varias veces con datos distintos** dentro de
un caso. Un cache en `readRange` los rompe si está encendido.

## Decisiones

- **Cache genérico en `readRange`, no puntual en `getTareas`.** Cubre `Usuarios` (revalidación de
  sesión y validación de asignado), `Dptos` (cada cambio de edificio en el form), `Visitas`,
  `Asignaciones`, `Directivas`. Una sola implementación, un solo test.
- **TTL 30 s.** Igual al `staleTime` del cliente. El TTL solo importa para cambios que la app no
  hace (ediciones a mano en la planilla, que la administración sigue haciendo): tardan ≤ 30 s en
  verse. Lo que escribe la app invalida al instante.
- **Invalidación por hoja, no por rango.** `Tareas!A:AD`, `Tareas!A1:AD1` y `Tareas!A:A` son tres
  keys del cache; una escritura en `Tareas` las borra a las tres. Más simple y sin riesgo de que
  el «fila libre por columna A» lea un `A:A` viejo y pise una fila.
- **Escrituras a través de helpers de `core.ts`** (`writeRange`, `deleteRows`) que invalidan solos,
  en vez de un `invalidarHoja()` a mano después de cada `update`. Un sitio que se olvide de
  invalidar sirve datos viejos 30 s; con helpers no hay forma de olvidarse. De paso desaparecen
  los cinco `batchUpdate.deleteDimension` copiados. `getSheets()` queda privado de `core.ts`.
- **Dedup de lecturas en vuelo.** Dos requests concurrentes por el mismo rango comparten una
  promesa. Es lo que resuelve la ráfaga de la revalidación (proxy + layout + API en el mismo
  page-load) y la de `Promise.all` en `cargarReferencias`.
- **Reintentos solo ante `429` y `503`,** 3 intentos, backoff 500 ms → 1,5 s → 4 s (≈ 6 s de
  espera total, dentro del `maxDuration` de 60 s de las rutas). Cualquier otro status sale de
  inmediato. Escrituras incluidas: un `429`/`503` significa que Google **no** ejecutó la operación,
  reintentar es seguro.
- **Cache apagado en tests por env** (`SHEETS_CACHE_TTL_MS=0` en `vitest.setup.ts`), no por
  `NODE_ENV`. Los tests de `core.ts` lo encienden explícitamente. Alternativa descartada: un
  `resetSheetsCache()` en `beforeEach` global — obliga a importar `googleapis` en cada archivo de
  test.
- **`useTareas()` como única fuente en cliente.** La lista, el dashboard e informes filtran en
  memoria. `GET /api/tareas` conserva sus query params (API estable; no la usa el SW).
- **Detalle con `initialData` desde la lista,** con `initialDataUpdatedAt` = `dataUpdatedAt` de la
  lista para que TanStack respete el `staleTime` y refresque en segundo plano si corresponde. Si la
  lista no está cargada (deep link), se comporta como hoy.
- **TTL offline de tareas: 24 h,** distinto de los 30 min de los catálogos. En el subsuelo sirve
  ver la lista de esta mañana; para edificios/config 30 min alcanza. `isFresh` gana un parámetro.
- **Dexie sube a v4** (store `cacheTareas`). El SW (`app/sw.ts`) abre la base con versión **1**
  hardcodeada, que ya falla con la v3 actual; subir a v4 no cambia nada y se arregla en el spec B.

---

## #1 — `lib/sheets/core.ts`: cache, invalidación, helpers de escritura, reintentos

### API pública resultante

```ts
export const SHEETS = { … } as const;          // sin cambios
export const TAREAS_RANGE = …;                 // sin cambios

export async function readRange(range: string): Promise<string[][]>;
export async function writeRange(range: string, values: (string | number)[][]): Promise<void>;
export async function deleteRows(sheetTitle: string, rowNumbers: number[]): Promise<void>;
export async function getSheetGid(title: string): Promise<number>;   // sin cambios de firma
export function invalidarHoja(sheetTitle: string): void;
export function resetSheetsCache(): void;                              // tests
export function hojaDeRango(range: string): string;                    // exportada para test
```

`getSheets()` deja de exportarse (también se quita del re-export de `lib/google-sheets.ts`; nadie lo
importa desde ahí). Ningún módulo fuera de `core.ts` importa `googleapis` para Sheets
(`lib/sheets-client.ts` y `lib/consorcios.ts` son el spreadsheet externo, fuera de alcance).

### `readRange`

```ts
interface Entrada { rows: string[][]; expira: number }
const cache = new Map<string, Entrada>();
const enVuelo = new Map<string, Promise<string[][]>>();

function ttlMs(): number {
  const raw = process.env.SHEETS_CACHE_TTL_MS;
  return raw === undefined ? 30_000 : Number(raw);
}

export async function readRange(range: string): Promise<string[][]> {
  const ttl = ttlMs();
  if (ttl > 0) {
    const hit = cache.get(range);
    if (hit && hit.expira > Date.now()) return hit.rows;
    const pendiente = enVuelo.get(range);
    if (pendiente) return pendiente;
  }
  const p = conReintentos(() => getSheets().spreadsheets.values.get({ spreadsheetId: getSheetId(), range }))
    .then((res) => {
      const rows = (res.data.values ?? []) as string[][];
      if (ttl > 0) cache.set(range, { rows, expira: Date.now() + ttl });
      return rows;
    })
    .finally(() => enVuelo.delete(range));
  if (ttl > 0) enVuelo.set(range, p);
  return p;
}
```

- Con `ttl <= 0` (tests) no cachea ni deduplica: comportamiento idéntico al actual.
- `hojaDeRango("'Partes Comunes'!A:B")` → `Partes Comunes`; `hojaDeRango("Tareas!A1:AD1")` →
  `Tareas`. Parte antes del `!`, sin comillas simples envolventes.
- Los `rows` se devuelven **por referencia**: ningún consumidor muta el array (verificado con grep:
  el único `rows.push` de la capa, en `archivosToRows`, es sobre un array local). Se documenta en el
  comentario del helper.

### `writeRange` y `deleteRows`

```ts
export async function writeRange(range: string, values: (string | number)[][]): Promise<void> {
  await conReintentos(() =>
    getSheets().spreadsheets.values.update({
      spreadsheetId: getSheetId(),
      range,
      valueInputOption: "USER_ENTERED",
      requestBody: { values },
    })
  );
  invalidarHoja(hojaDeRango(range));
}

// Borra filas (1-based) de una hoja en un solo batchUpdate, de abajo hacia arriba para que
// los índices no se corran. Lista vacía → no llama a Google.
export async function deleteRows(sheetTitle: string, rowNumbers: number[]): Promise<void> {
  if (rowNumbers.length === 0) return;
  const gid = await getSheetGid(sheetTitle);
  const requests = [...rowNumbers]
    .sort((a, b) => b - a)
    .map((n) => ({ deleteDimension: { range: { sheetId: gid, dimension: "ROWS" as const, startIndex: n - 1, endIndex: n } } }));
  await conReintentos(() =>
    getSheets().spreadsheets.batchUpdate({ spreadsheetId: getSheetId(), requestBody: { requests } })
  );
  invalidarHoja(sheetTitle);
}

export function invalidarHoja(sheetTitle: string): void {
  for (const key of cache.keys()) if (hojaDeRango(key) === sheetTitle) cache.delete(key);
}
```

- La invalidación corre **después** de que Google confirmó la escritura. Si la escritura falla,
  el cache queda como estaba (sigue siendo correcto: la hoja no cambió).
- `valueInputOption: "USER_ENTERED"` es lo que usan los 18 sitios hoy; no hay ninguno con `RAW`.

### `conReintentos`

```ts
const ESPERAS_MS = [500, 1500, 4000];

// gaxios expone el status como `code` (string) y como `response.status` (number).
function statusDe(err: unknown): number {
  const e = err as { code?: unknown; response?: { status?: unknown } } | null;
  return Number(e?.code) || Number(e?.response?.status) || 0;
}

async function conReintentos<T>(fn: () => Promise<T>): Promise<T> {
  for (let intento = 0; ; intento++) {
    try {
      return await fn();
    } catch (err) {
      const status = statusDe(err);
      const reintentable = status === 429 || status === 503;
      if (!reintentable || intento >= ESPERAS_MS.length) throw err;
      console.warn(`[sheets] ${status} — reintento ${intento + 1}/${ESPERAS_MS.length} en ${ESPERAS_MS[intento]} ms`);
      await new Promise((r) => setTimeout(r, ESPERAS_MS[intento]));
    }
  }
}
```

Se aplica a `values.get`, `values.update`, `batchUpdate` y al `spreadsheets.get` de `getSheetGid`.

### Migración de los módulos de `lib/sheets/`

Refactor mecánico, sin cambio de comportamiento:

| Módulo | `values.update` → `writeRange` | `batchUpdate` → `deleteRows` |
|---|---|---|
| `tareas.ts` | 2 (`appendTarea`, `updateTarea`) | 1 (`deleteTarea`) |
| `tarea-archivos.ts` | 1 | 1 (`deleteArchivosByTarea`, ya ordena descendente: lo hace `deleteRows`) |
| `usuarios.ts` | 5 | — |
| `directivas.ts` | 2 | 1 |
| `asignaciones.ts` | 1 | 1 |
| `visitas.ts` | 1 | 1 |
| `edificio-ficha.ts` | 2 | — |
| `partes-comunes.ts` | 1 | — |
| `config.ts` | 1 (además de su cache propio, que se mantiene) | — |

`config.ts` conserva su cache de 5 min (es la única hoja que se lee en **cada** upload y en cada
render de `useConfig`; 5 min es deliberado). Al escribir, ya resetea el suyo; `writeRange` invalida
además el de `readRange`.

### Efecto en las llamadas

| Operación | Antes | Después, cache caliente | Después, cache frío |
|---|---|---|---|
| `GET /api/tareas` | 2 | 0 | 2 |
| `GET /api/tareas/[id]` | 2 | 0 | 2 |
| `PATCH` transición | 6 (8 con media) | 1 escritura | 2 lecturas + 1 escritura |
| `POST /api/tareas` | 3 (5 con media) | 1 escritura (+1 con media) | 2 lecturas + 1 escritura (+1) |
| Revalidación de sesión | hasta 3 | 0 | 1 (las otras dos son dedup en vuelo) |

Detalle del `PATCH`: `getTareaPersistida` lee `Tareas` + `TareaArchivos`; `updateTarea` **vuelve a
leer** ambas más el header `A1:AD1` antes de escribir. Como todavía no escribió, esas relecturas
son hits. Tras el `writeRange` se invalida `Tareas` (y `TareaArchivos` solo si tocó media); el
siguiente `GET` de cualquier usuario paga esa lectura diferida. Neto por transición: **1 escritura
+ 1 lectura diferida**, contra 6–8. No hace falta reestructurar `updateTarea`.

---

## #2 — Cliente: `useTareas()` como única fuente

### `hooks/edificios-queries.ts` → `useTareas`

Se muda a `hooks/queries.ts` (donde viven las queries con cache offline) y gana `cache`/`readCache`:

```ts
export const useTareas = () =>
  useCachedQuery({
    queryKey: ["tareas", "all"],
    fetcher: () => api.tareas.list({}),
    cache: cacheTareas,
    readCache: readCachedTareas,
    staleTime: 30_000,
  });
```

`hooks/edificios-queries.ts` la re-exporta (`export { useTareas } from "./queries"`) para no tocar
los imports de Edificios ni su test de regresión de la key.

### `lib/offline-db.ts`

- `version(4).stores({ cacheTareas: "key" })`.
- `isFresh(updatedAt, ttlMs = TTL_MS)`.
- `cacheTareas(value: Tarea[])` / `readCachedTareas(): Promise<Tarea[] | null>` con
  `TTL_TAREAS_MS = 24 h`. Mismo patrón que `cacheEdificios`/`readCachedEdificios`.

### `/tareas` (`app/(app)/tareas/page.tsx`)

- Se borran `fetchTareas`, `fetchEdificios`, el import de `apiFetch` y la `useQuery` por params.
- `const tareasQ = useTareas(); const edificiosQ = useEdificios();`
- `const tareas = useMemo(() => filterTareas(tareasQ.data ?? [], filtros), [tareasQ.data, filtros])`
  con `filtros = { edificio, estado, prioridad, asignado: soloMias ? myEmail : undefined, sinAsignar }`
  (los mismos que hoy viajan en la URL, con la misma semántica: `estado === "Todos"` → `undefined`).
- El resto del JSX consume `tareas` en vez de `tareasQ.data`. El contador «N resultados» y el
  vacío «No hay tareas con esos filtros» usan `tareas`.
- La mutación de borrado sigue invalidando `["tareas"]`.

### Dashboard (`components/dashboard/Dashboard.tsx`)

`useQuery({ queryKey: ["tareas","all"], … })` → `useTareas()`. Nada más cambia: ya filtra en
memoria.

### Informes (`components/informes/hooks/useInforme.ts`)

- `["informe", edificio, desde, hasta]` → `useTareas()` + `filterTareas(data, { edificio, desde, hasta })`
  en `useMemo`, condicionado a `edificio` (sin edificio: `[]`, como hoy con `enabled: false`).
- `edificiosQ` inline → `useEdificios()` (gana cache offline gratis).
- **El test `InformeEdificio.test.tsx` afirma que sin edificio elegido `api.tareas.list` no se
  llama.** Eso deja de ser cierto (la lista se carga una vez, siempre) y el caso se **reescribe**:
  sin edificio se muestra el aviso «Elegí un edificio…» y no se renderiza ninguna tabla, sin
  afirmar nada sobre la llamada.

### Detalle (`components/tareas/hooks/useTareaDetalle.ts`)

```ts
const tareaQ = useQuery({
  queryKey: ["tarea", rowId],
  queryFn: () => api.tareas.get(rowId),
  initialData: () => qc.getQueryData<Tarea[]>(["tareas", "all"])?.find((t) => t.rowId === rowId),
  initialDataUpdatedAt: () => qc.getQueryState(["tareas", "all"])?.dataUpdatedAt,
});
```

- Si la lista está cargada: render inmediato con esa tarea; si el dato tiene más de 30 s,
  TanStack refetchea en segundo plano y actualiza. Si no está (deep link, recarga): `undefined` →
  fetch normal, como hoy.
- `refresh()` ya hace `setQueryData(["tarea", rowId], updated)` + `invalidateQueries(["tareas"])`;
  sin cambios.

### `OfflineSyncProvider`

Se eliminan las dos invalidaciones de `["tareas-all"]` (key inexistente). Queda `["tareas"]`, que
por prefijo alcanza a `["tareas","all"]` y a `["tarea", id]` **no** (distinto prefijo): correcto,
el detalle se refresca por `refresh()`/`initialData`.

---

## Tests

| Archivo | Casos |
|---|---|
| `lib/sheets/core.test.ts` (nuevo; mockea `googleapis` + `google-auth`, enciende el cache con `vi.stubEnv("SHEETS_CACHE_TTL_MS","30000")`, fake timers) | `readRange`: segunda lectura del mismo rango no llama a Google · rango distinto sí · vencido el TTL vuelve a llamar · dos lecturas concurrentes del mismo rango → 1 llamada · con TTL 0 cada lectura llama · `writeRange` llama a `update` con `USER_ENTERED` e invalida solo su hoja (otra hoja sigue en cache) · `deleteRows` ordena descendente, arma un `deleteDimension` por fila, invalida la hoja, lista vacía no llama · `hojaDeRango` con y sin comillas · `conReintentos`: 429 → reintenta y resuelve, 503 idem, 400 no reintenta, 4 fallos seguidos → lanza el último, esperas 500/1500/4000 |
| `lib/sheets/*.test.ts` existentes | Deben seguir verdes **sin tocar** salvo por los mocks: ahora afirman `valuesUpdate`/`batchUpdate` que siguen siendo las funciones mockeadas de `googleapis` (los helpers las llaman igual). Si alguno afirma la forma exacta del `batchUpdate` (`requests[0].deleteDimension…`), sigue valiendo: `deleteRows` arma la misma estructura. |
| `vitest.setup.ts` | `process.env.SHEETS_CACHE_TTL_MS = "0"` al inicio. |
| `lib/offline-db.test.ts` (extender o crear) | `cacheTareas`/`readCachedTareas` round-trip · vencido a 24 h → `null` · `isFresh` con TTL custom |
| `hooks/queries.test.tsx` (extender) | `useTareas` cae al cache de Dexie cuando `api.tareas.list` rechaza |
| `hooks/edificios-queries.test.tsx` | Sin cambios (re-export mantiene la key). |
| `app/(app)/tareas/page.test.tsx` (nuevo) | Filtro por estado y «Mis tareas asignadas» reducen la lista sin nueva llamada a `api.tareas.list` · «Sin asignar» solo visible para admin (ya existía el comportamiento, no el test) |
| `components/informes/InformeEdificio.test.tsx` | Caso «pide elegir un edificio» reescrito (ver arriba); el resto mockea `api.tareas.list` con la lista completa y afirma los grupos filtrados por edificio/fecha. |
| `components/tareas/hooks/useTareaDetalle.test.tsx` (extender) | Con `["tareas","all"]` precargado en el `QueryClient`, `tareaQ.data` está definido en el primer render sin esperar a `api.tareas.get` · sin lista precargada, llama a `api.tareas.get`. |

## Criterios de aceptación

1. Dos `GET /api/tareas` dentro de 30 s producen **una** llamada a `values.get` por rango
   (verificable con un `console.count` temporal o con el test de `core`).
2. Después de crear/editar/asignar una tarea, el siguiente `GET` la refleja sin esperar el TTL.
3. Una fila editada a mano en la planilla se ve en la app en ≤ 30 s.
4. Ante un `429` simulado, la ruta responde bien tras el reintento; ante un `400`, falla de
   inmediato sin reintentar.
5. En `/tareas`, cambiar Estado/Prioridad/Edificio o «Mis tareas» filtra al instante sin request.
6. Abrir una tarea desde la lista la muestra sin spinner de carga.
7. Sin red, `/tareas`, el detalle de una tarea vista y el dashboard muestran los últimos datos
   (≤ 24 h) en vez del error.
8. `npm test` + `npx tsc --noEmit` + `npm run lint` + `npm run build` verdes.

## Riesgos

- **Dos instancias del server.** El cache es por proceso. Hoy prod es un contenedor; si algún día
  se escala horizontalmente, cada instancia ve las escrituras de las otras con hasta 30 s de
  atraso. Aceptado; documentado en el comentario de `core.ts`.
- **Memoria.** `Tareas` completa son ~1000 filas × 28 columnas de strings cortos: decenas de KB.
  Con las 11 hojas, < 1 MB. Sin límite de entradas: el número de rangos distintos es fijo (< 20).
- **Escritura fuera de los helpers.** Un futuro `getSheets().spreadsheets.values.update` directo
  serviría datos viejos 30 s. Mitigación: `getSheets` deja de exportarse; para escribir hay que
  pasar por `core.ts`.
- **Rows por referencia.** Si un consumidor futuro muta el array devuelto por `readRange`,
  contamina el cache. Mitigación: comentario en el helper; alternativa (`structuredClone` por
  lectura) descartada por costo en cada hit.
- **Reintentos alargan la respuesta** hasta ~6 s en el peor caso. Es preferible a un 500 y queda
  lejos del `maxDuration` de 60 s.
- **`initialData` muestra una tarea que otro usuario acaba de cambiar** durante ≤ 30 s. Es la
  misma ventana que ya tiene la lista; el refetch en segundo plano la cierra.

## Definición de hecho

- `core.ts` con cache, dedup, `writeRange`, `deleteRows`, `invalidarHoja`, `conReintentos`;
  `getSheets` privado; los 9 módulos migrados; `vitest.setup.ts` con el TTL en 0.
- `useTareas` en `hooks/queries.ts` con cache Dexie v4; lista, dashboard, informes y detalle
  consumiendo la query única; `["tareas-all"]` eliminada.
- Comentario de `QueryProvider` («alineado con cache del backend») ahora es verdad; se deja.
- Tests de la tabla; árbol verde. Sin setup manual: no toca la Sheet, `.env` ni deploy.
