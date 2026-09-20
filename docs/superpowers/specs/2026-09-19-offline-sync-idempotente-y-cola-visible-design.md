# SPEC — Offline: sync idempotente, Background Sync arreglado y cola visible

**Fecha:** 2026-09-19
**Estado:** Propuesto (rev. 1)
**Autor:** equipo task-drive-manager
**Plan asociado:** [`../plans/2026-09-19-offline-sync-idempotente-y-cola-visible.md`](../plans/2026-09-19-offline-sync-idempotente-y-cola-visible.md)

Bloque 2B de la auditoría del 2026-09-19. Hace que la cola de tareas creadas sin conexión sea
**confiable** (nunca duplica, nunca pierde en silencio) y **visible** (el encargado ve qué está
esperando subir, qué falló y por qué, y puede reintentar o descartar).

| # | Problema | Corrección |
|---|---|---|
| 1 | El sync in-page y el Background Sync del SW pueden correr a la vez sobre la misma cola → dos `POST` → tarea duplicada en la Sheet. | `POST /api/tareas` idempotente por `rowId` (el form ya lo genera; la cola ya lo guarda; el sync pasa a mandarlo) + lock en memoria por `rowId`. |
| 2 | `app/sw.ts` abre IndexedDB con versión **1** contra una base v4 → `VersionError`; además hace `await fetch` dentro de una transacción → `TransactionInactiveError`. Background Sync nunca funcionó; el fallback in-page lo tapa. | Abrir sin versión; leer, cerrar transacción, hacer los `fetch`, escribir en transacciones nuevas. |
| 3 | `MAX_RETRIES = 3` y después la tarea se saltea **para siempre, sin aviso**. Tres cortes de señal seguidos = tarea perdida. | Fallo de **red** → reintento sin tope. **Rechazo** del server (4xx) → se marca con el mensaje y deja de reintentarse sola. |
| 4 | Las tareas en cola no aparecen en `/tareas`; solo hay un número en el punto ámbar. | Sección «Pendientes de subir» arriba de la lista, con estado por tarea y botones Reintentar / Descartar. «Sincronizar ahora» en el modal del indicador. |
| 5 | Dos altas **distintas** a la vez (SW + in-page, o dos usuarios) leen el mismo `Tareas!A:A`, calculan la misma fila libre y la segunda pisa a la primera. El dedup de lecturas del bloque 2A lo hace determinístico. | Lock de escritura por hoja (`conLockDeHoja`) en `appendTarea` y `setArchivosForTarea`: los altas de una misma hoja se serializan en el proceso. |

---

## Contexto

**Alta offline.** `useTareaForm.onSubmit` con `!online` llama `enqueueTarea({ ...payload, localId,
pendingSync: true, createdAt, retries: 0 })` y `registerBackgroundSync("sync-tareas")`. El `payload`
**ya incluye `rowId`** (`taskRowId`, timestamp ISO generado al abrir el form y usado para agrupar
los archivos en Drive). `TareaPendiente extends TareaNuevaInput` (`types/index.ts:126`), así que la
fila de Dexie lo guarda.

**Sync in-page** (`lib/offline-sync.ts`): `syncPendingTareas()` recorre `listPendientes()`
(`pendingSync === true`), saltea las que tienen `retries >= 3`, llama `api.tareas.create(...)`
**sin `rowId`**, y ante cualquier error hace `incrementRetries`. Lo dispara `OfflineSyncProvider`
al montar, en `online` y cada 5 min; un flag `syncing` evita solapamiento **dentro de la pestaña**.

**Sync del SW** (`app/sw.ts`, `syncPendingFromSW`): replica la lógica con IndexedDB nativo (no puede
importar Dexie). Abre `indexedDB.open("task-drive-manager", 1)` — la base está en **v4** desde el
bloque 2A (v3 antes) → `VersionError`. Además abre una transacción `readwrite`, hace `await fetch`
adentro y después `store.put` → la transacción ya se cerró sola → `TransactionInactiveError`. Dos
bugs independientes; cualquiera de los dos alcanza para que nunca haya sincronizado nada.

**Server.** `POST /api/tareas` valida con `tareaNuevaSchema` (`rowId: z.string().optional()`) y
llama `appendTarea`, que usa `input.rowId?.trim() || now` como id. **No verifica** si ya existe una
tarea con ese `rowId`.

**Cliente HTTP.** `request()` en `lib/api-client.ts` lanza `new Error(mensaje)`: el llamador no
puede distinguir un `400` de un `Failed to fetch`. `apiFetch` ya redirige a `/login` en `401`.

**UI.** `hooks/usePendingTareas.ts` expone `usePendingTareas()` (live query de Dexie,
`pendingSync === true`) y `usePendingCount()`. Solo lo consume `OfflineIndicator` para el número
del punto ámbar y el aria-label. El modal del indicador es informativo (tres bullets + «Entendido»).
`/tareas` no muestra la cola.

## Decisiones

- **Idempotencia por `rowId`, no por `localId`.** El `rowId` ya viaja como id de fila en la Sheet y
  como nombre de carpeta en Drive; no hace falta columna nueva ni cambiar el schema. `localId` sigue
  siendo la key de Dexie.
- **`200` con la tarea existente, no `409`.** Para el sync, «ya está» es éxito: marca `synced` y
  sigue. Un `409` obligaría a tratar un caso más en dos lugares (in-page y SW).
- **Lock en memoria por `rowId`** en la ruta, además de la búsqueda previa. La búsqueda sola deja
  una ventana (dos POST leen «no existe» y ambos crean). Un solo proceso en prod: el `Map` alcanza.
- **Arreglar el SW, no sacarlo.** Mantiene «se sube aunque cierres la app» (Chrome/Android). Con el
  server idempotente, que SW e in-page se pisen deja de importar.
- **Sin tope de reintentos por red.** Un corte de señal no es un fallo de la tarea. `retries` queda
  como contador informativo (se muestra nada; se conserva para no migrar datos).
- **Rechazo = 4xx salvo `401` y `429`.** `401` es la sesión, no la tarea (y `apiFetch` ya redirige);
  `429` es cuota, transitorio. `5xx` y errores de red → red.
- **Clasificación en un módulo puro** (`lib/sync-clasificacion.ts`) que importan tanto
  `offline-sync.ts` como `app/sw.ts` (serwist bundlea `lib/` con webpack; el módulo no toca `window`
  ni Dexie). Así la regla vive una vez y tiene test aunque el SW no lo tenga.
- **Sin cambio de versión de Dexie.** `errorMsg` es un campo no indexado; Dexie no requiere
  declararlo. La v4 del 2A sigue.
- **La sección de pendientes va fuera de los filtros** de `/tareas`: son pocas, son «lo que acabo
  de cargar», y ocultarlas por un filtro sería confuso.
- **Sin link al detalle** desde una pendiente: no existe en el server. Al sincronizar, la tarjeta
  desaparece de la sección y la tarea aparece en la lista normal (por la invalidación de
  `["tareas"]`).
- **Descartar pide confirmación** (`ConfirmDialog`, `variant="danger"`): borra la única copia.
- **Lock de append por hoja, solo en las hojas que toca el sync** (`Tareas`, `TareaArchivos`). El
  mismo patrón «fila libre por columna A» está en otros 6 módulos (usuarios, visitas, directivas,
  asignaciones, partes comunes, ficha); su probabilidad de choque es mucho menor (altas manuales,
  esporádicas) y se dejan como follow-up documentado, no se mezclan acá.
- **El punto ámbar cuenta también las rechazadas** (`usePendingCount` filtra solo por
  `pendingSync`). Es deliberado: una rechazada sigue siendo «algo que no subió».

---

## #1 — `POST /api/tareas` idempotente

### `app/api/tareas/route.ts`

```ts
// Un mismo rowId puede llegar dos veces (sync in-page y Background Sync del SW sobre la
// misma cola, doble tap, reintento tras timeout). La primera crea; las demás reciben la
// misma tarea. El lock cubre la ventana entre "no existe" y "ya escribí".
const creandoPorRowId = new Map<string, Promise<Tarea>>();

export const POST = withAuth(async (req, session) => {
  const parsed = tareaNuevaSchema.parse(await req.json());
  const rowId = parsed.rowId?.trim();

  if (rowId) {
    const existente = await getTareaByRowId(rowId);
    if (existente) return NextResponse.json(existente, { status: 200 });
    const enCurso = creandoPorRowId.get(rowId);
    if (enCurso) return NextResponse.json(await enCurso, { status: 200 });
  }

  const crear = async () => { /* validación de edificio + appendTarea, como hoy */ };
  if (!rowId) return NextResponse.json(await crear(), { status: 201 });

  const p = crear().finally(() => creandoPorRowId.delete(rowId));
  creandoPorRowId.set(rowId, p);
  return NextResponse.json(await p, { status: 201 });
});
```

- La validación de edificio (`400 "Edificio … no es válido"`) vive dentro de `crear()`. Hoy la
  ruta hace `return jsonError(400, …)`; dentro de `crear()` pasa a `throw jsonError(400, …)` —
  `handleApiError` (vía `withAuth`) devuelve tal cual un `Response` lanzado, así que el cliente ve
  el mismo status y body. Si `crear()` rechaza, el `finally` limpia el lock y un POST concurrente
  con el mismo `rowId` recibe el mismo `400`; el siguiente vuelve a intentar desde cero.
- `getTareaByRowId` lee `Tareas` + `TareaArchivos`: con el cache del 2A, cero llamadas si está
  caliente. Aceptado el costo en frío (2 lecturas) por cada alta con `rowId` — todas las del form.
- `existente` viene con el estado derivado (72 h); irrelevante para el sync, que solo usa `rowId`.

### Cliente

- `lib/offline-sync.ts`: `api.tareas.create({ rowId: p.rowId, …resto })`.
- `app/sw.ts`: el body del `fetch` suma `rowId: p.rowId`.
- `TareaPendiente.rowId` ya existe por herencia; se documenta en el tipo que es obligatorio de
  hecho (`useTareaForm` siempre lo manda). No se cambia a requerido para no romper
  `TareaNuevaInput`.

### #1b — Lock de append por hoja (`lib/sheets/core.ts`)

```ts
// Serializa las escrituras "fila libre por columna A" de una misma hoja dentro del proceso:
// dos altas concurrentes leerían el mismo A:A (el dedup de readRange lo garantiza) y
// escribirían en la misma fila. Cadena de promesas por hoja; un fallo no corta la cadena.
const locksPorHoja = new Map<string, Promise<unknown>>();

export function conLockDeHoja<T>(sheetTitle: string, fn: () => Promise<T>): Promise<T> {
  const previo = locksPorHoja.get(sheetTitle) ?? Promise.resolve();
  const propio = previo.catch(() => undefined).then(fn);
  locksPorHoja.set(sheetTitle, propio);
  propio.finally(() => {
    if (locksPorHoja.get(sheetTitle) === propio) locksPorHoja.delete(sheetTitle);
  });
  return propio;
}
```

- `appendTarea`: el bloque `getTareasHeaderMap` + `readRange(A:A)` + `writeRange` va dentro de
  `conLockDeHoja(SHEETS.tareas, …)`. Como `writeRange` invalida `Tareas` al terminar, el segundo
  alta en la cadena relee `A:A` fresco y cae en la fila siguiente.
- `setArchivosForTarea`: el bloque `readRange(A:A)` + `writeRange` dentro de
  `conLockDeHoja(SHEETS.tareaArchivos, …)`. El `deleteArchivosByTarea` previo queda afuera (borra
  filas de la tarea propia; no compite por la fila libre).
- El lock del `rowId` (#1) y este son independientes: aquél evita crear dos veces la misma tarea;
  éste evita que dos tareas distintas pisen la misma fila.

---

## #2 — Errores tipados y clasificación

### `lib/api-client.ts`

```ts
export class ApiClientError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "ApiClientError";
  }
}
```

`request()` y el `fetch` de `upload` lanzan `new ApiClientError(await mensajeDeError(res), res.status)`
en vez de `new Error(...)`. `message` idéntico → ningún consumidor cambia (`instanceof Error` sigue
siendo `true`).

### `lib/sync-clasificacion.ts` (puro)

```ts
export type FalloSync = "red" | "rechazo";

// Decide si un fallo al subir una tarea de la cola es transitorio (se reintenta solo) o un
// rechazo del server (queda marcado hasta que el usuario reintente o descarte).
// 401: es la sesión, no la tarea. 429: cuota, transitorio. 5xx y sin status: red.
export function clasificarStatus(status: number | undefined): FalloSync {
  if (status === undefined) return "red";
  if (status === 401 || status === 429) return "red";
  if (status >= 400 && status < 500) return "rechazo";
  return "red";
}

export function clasificarFalloSync(err: unknown): FalloSync {
  const status = (err as { status?: unknown } | null)?.status;
  return clasificarStatus(typeof status === "number" ? status : undefined);
}
```

`clasificarStatus` es la que usa el SW (tiene `res.status` a mano); `clasificarFalloSync` la usa
`offline-sync.ts` (tiene el `ApiClientError`).

---

## #3 — Cola: red vs rechazo

### `types/index.ts`

```ts
export interface TareaPendiente extends TareaNuevaInput {
  localId: string;
  pendingSync: boolean;
  createdAt: string;
  retries: number;        // informativo: intentos de red fallidos. Sin tope.
  sheetRowId?: string;
  errorMsg?: string;      // rechazo del server: queda fuera del sync automático hasta Reintentar
}
```

### `lib/offline-db.ts`

- `listPendientes()`: `pendingSync === true && !errorMsg` (solo las auto-sincronizables; la usa
  el sync). `usePendingTareas()` sigue filtrando solo por `pendingSync`: la UI muestra también las
  rechazadas, que es el punto.
- Nuevos:
  ```ts
  export async function marcarRechazada(localId: string, errorMsg: string): Promise<void>;
  export async function reintentarPendiente(localId: string): Promise<void>; // errorMsg → undefined
  export async function descartarPendiente(localId: string): Promise<void>;  // delete
  ```
- `incrementRetries` se mantiene (contador informativo).

### `lib/offline-sync.ts`

```ts
for (const p of pendientes) {
  try {
    const created = await api.tareas.create({ rowId: p.rowId, objetivo: p.objetivo, … });
    await markSynced(p.localId, created.rowId);
    result.ok++;
  } catch (err) {
    if (clasificarFalloSync(err) === "rechazo") {
      await marcarRechazada(p.localId, err instanceof Error ? err.message : "Rechazada por el servidor");
      result.rechazadas++;
    } else {
      await incrementRetries(p.localId);
      result.failed++;
    }
  }
}
```

- `MAX_RETRIES` y el `skipped` desaparecen. `SyncResult` pasa a `{ ok, failed, rechazadas }`.
- Un `401` cae en `red` y además `apiFetch` ya navegó a `/login`; el loop sigue fallando en red
  hasta que la página se descarga. Sin tratamiento especial.

---

## #4 — `app/sw.ts` arreglado

```ts
async function syncPendingFromSW(): Promise<void> {
  const db = await openDb("task-drive-manager"); // sin versión: la vigente (v4)
  const pendientes = (await leerTodo(db)).filter((r) => r.pendingSync === true && !r.errorMsg);

  for (const p of pendientes) {
    let cambio: Partial<PendienteRow>;
    try {
      const res = await fetch("/api/tareas", { method: "POST", headers: {…}, body: JSON.stringify({ rowId: p.rowId, … }) });
      if (res.ok) {
        const created = (await res.json()) as { rowId: string };
        cambio = { pendingSync: false, sheetRowId: created.rowId };
      } else if (clasificarStatus(res.status) === "rechazo") {
        const body = await res.json().catch(() => null);
        cambio = { errorMsg: body?.error ?? `Rechazada (${res.status})` };
      } else {
        cambio = { retries: (p.retries ?? 0) + 1 };
      }
    } catch {
      cambio = { retries: (p.retries ?? 0) + 1 };
    }
    await escribir(db, { ...p, ...cambio }); // transacción nueva, corta, sin await adentro
  }
  db.close();
  // postMessage TAREAS_SYNCED a las pestañas abiertas (como hoy)
}
```

- `leerTodo`: transacción `readonly`, `getAll`, `txDone`. `escribir`: transacción `readwrite`,
  `put`, `txDone`. Ninguna transacción abarca un `await fetch`.
- `openDb(name)` sin versión: si la base no existe (SW despierta antes de que la app la haya
  creado) `indexedDB.open` la crea vacía en v1 sin el store `tareasPendientes` →
  `db.transaction("tareasPendientes")` lanza `NotFoundError`. Se captura: si el store no existe,
  no hay cola, salir. (Hoy ese caso ni se contempla.)
- `PendienteRow` suma `rowId?: string`, `errorMsg?: string`, `documentos?: string[]` (hoy el SW
  **omite `documentos`** del body: bug menor de paridad con el sync in-page; se corrige de paso).
- `import { clasificarStatus } from "@/lib/sync-clasificacion";` — serwist compila `app/sw.ts`
  con webpack y el alias `@/` (verificar en el build; si el alias no resuelve dentro del SW, usar
  ruta relativa `../lib/sync-clasificacion`).

---

## #5 — UI

### `components/tareas/PendientesDeSubir.tsx` (nuevo)

- Props: ninguna. Usa `usePendingTareas()` y `useOnlineStatus()`. **No** usa `useQueryClient()`: para
  refrescar la lista dispara `window.dispatchEvent(new CustomEvent("tareas-synced"))`, el mismo
  evento que `RegisterPWA` emite tras el Background Sync y que `OfflineSyncProvider` ya convierte en
  `invalidateQueries(["tareas"])`. Así ni este componente ni el indicador dependen de un
  `QueryClient` (los tests de `OfflineIndicator` renderizan sin provider).
- Si no hay pendientes → `null`. Si hay: `<section>` con título «Pendientes de subir (N)» y una
  tarjeta por tarea, misma estética que las tarjetas de la lista pero sin `<Link>`:
  - línea 1: `objetivo` · línea 2: `edificio · dpto` · línea 3: fecha de creación (`createdAt`).
  - sin `errorMsg`: badge ámbar «Pendiente de subir».
  - con `errorMsg`: badge rojo «No se pudo subir» + el `errorMsg` debajo + botones **Reintentar**
    (oscuro, mismo estilo que los botones de `AccionesTarea`; `Loader2` mientras corre,
    deshabilitado si `!online`) y **Descartar** (outline rojo).
- Reintentar: `await reintentarPendiente(localId); const r = await syncPendingTareas(); if (r.ok > 0) window.dispatchEvent(new CustomEvent("tareas-synced"))`. Estado `reintentando: localId | null` para el spinner.
- Descartar: `ConfirmDialog` «Descartar tarea pendiente» / «Se va a borrar "…" de este teléfono. No
  está guardada en ningún otro lado. ¿Confirmás?» / `variant="danger"` / `confirmLabel="Descartar"`
  → `descartarPendiente(localId)`.
- Montada en `app/(app)/tareas/page.tsx` entre los chips de filtro y la lista.

### `components/layout/OfflineIndicator.tsx`

En el modal, antes de «Entendido», si `pending > 0`:

```tsx
<button type="button" disabled={!online || sincronizando} onClick={sincronizarAhora} className="…outline…">
  {sincronizando ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
  Sincronizar ahora
</button>
```

`sincronizarAhora`: `syncPendingTareas()` → si `ok > 0`, `window.dispatchEvent(new CustomEvent("tareas-synced"))` (ver arriba). El texto del botón incluye el conteo: «Sincronizar ahora (N)».
Sin conexión el botón queda deshabilitado con el texto «Sin conexión» debajo.

---

## Tests

| Archivo | Casos |
|---|---|
| `tests/api/tareas-idempotente.test.ts` (nuevo) | con `rowId` existente → `200`, body = la existente, `appendTarea` **no** se llama · con `rowId` nuevo → `201` y `appendTarea` recibe ese `rowId` · sin `rowId` → `201` como hoy · dos POST concurrentes con el mismo `rowId` (`appendTarea` mockeado con una promesa que se resuelve después) → `appendTarea` una vez, ambos `Tarea` iguales · edificio inválido con `rowId` → `400` y el lock queda limpio (un tercer POST vuelve a intentar) |
| `lib/sync-clasificacion.test.ts` (nuevo) | `undefined`/0/500/503/429/401 → `red` · 400/403/404/409/413/422 → `rechazo` · `clasificarFalloSync(new ApiClientError("x", 400))` → `rechazo` · `Error("Failed to fetch")` → `red` |
| `lib/sheets/core.test.ts` (extender) | `conLockDeHoja`: dos llamadas concurrentes de la misma hoja corren en orden (la segunda arranca cuando termina la primera) · hojas distintas corren en paralelo · si la primera rechaza, la segunda corre igual |
| `tests/lib/google-sheets-crud.test.ts` (extender) | dos `appendTarea` concurrentes con `A:A` que crece tras cada escritura → filas `n+1` y `n+2`, no dos veces `n+1` |
| `lib/api-client.test.ts` (extender) | un 4xx lanza `ApiClientError` con `status` y el mismo `message` de antes |
| `lib/offline-sync.test.ts` (nuevo; mockea `./api-client` y `./offline-db`) | manda `rowId` · éxito → `markSynced` con el `rowId` devuelto · `ApiClientError 400` → `marcarRechazada` con el mensaje, sin `incrementRetries` · `Error("Failed to fetch")` → `incrementRetries`, sin `marcarRechazada` · `ApiClientError 429` → red · una pendiente con `retries: 50` **se intenta igual** (sin tope) · `listPendientes` es la fuente (las rechazadas no llegan: eso lo cubre el test de offline-db) |
| `lib/offline-db.test.ts` (extender, con el FakeDexie) | `listPendientes` excluye `errorMsg` · `marcarRechazada` escribe `errorMsg` · `reintentarPendiente` lo borra · `descartarPendiente` elimina |
| `components/tareas/PendientesDeSubir.test.tsx` (nuevo; mockea `usePendingTareas`, `offline-sync`, `offline-db`) | sin pendientes → no renderiza · pendiente sin error → badge ámbar, sin botones · con `errorMsg` → badge rojo, mensaje, botones · Reintentar → `reintentarPendiente` + `syncPendingTareas` · Descartar → `ConfirmDialog` → confirmar → `descartarPendiente` · offline → Reintentar deshabilitado |
| `components/layout/OfflineIndicator.test.tsx` (extender) | con pendientes y online → botón «Sincronizar ahora» llama `syncPendingTareas` · offline → deshabilitado · sin pendientes → no aparece |
| `app/(app)/tareas/page.test.tsx` (extender) | mockear `@/hooks/usePendingTareas` en el archivo (la página ahora monta `PendientesDeSubir`, y `useLiveQuery` contra Dexie en jsdom no tiene IndexedDB): con 1 pendiente → la sección aparece arriba de la lista y **no** la afectan los filtros; con 0 → no aparece |

El SW sigue sin test unitario (corre fuera de jsdom); su lógica de decisión está en
`sync-clasificacion.ts`, testeada. Verificación manual del SW en Chrome desktop: DevTools →
Application → Service Workers → «Sync» con tag `sync-tareas`, con una pendiente en IndexedDB.

## Criterios de aceptación

1. Crear una tarea offline, volver online con la app abierta: se sube **una** vez (una fila en la
   Sheet) aunque el SW y la pestaña sincronicen a la vez.
2. Mandar dos veces el mismo `POST` con `rowId` (curl): segunda respuesta `200` con la misma tarea;
   una sola fila.
3. En Chrome/Android: crear offline, cerrar la app, recuperar señal → al reabrir la tarea ya está
   en la lista (Background Sync funcionó) y **no** hay `VersionError` ni `TransactionInactiveError`
   en la consola del SW.
4. Cortar la red 5 veces seguidas durante el sync: la tarea sigue en cola y sube al sexto intento.
5. Pendiente cuyo edificio fue desactivado: aparece en rojo con «Edificio "X" no es válido o no está
   activo»; no se reintenta sola; Reintentar tras reactivar el edificio la sube; Descartar la borra
   tras confirmar.
6. `/tareas` muestra la sección «Pendientes de subir» arriba, fuera de los filtros; desaparece al
   sincronizar y la tarea aparece en la lista normal.
7. Modal del indicador: «Sincronizar ahora» sube las pendientes; deshabilitado sin red.
8. Dos altas simultáneas (dos pestañas con el form, «Guardar» al mismo tiempo) producen dos filas
   distintas en `Tareas`, ninguna pisada.
9. `npm test` + `npx tsc --noEmit` + `npm run lint` + `npm run build` verdes.

## Riesgos

- **Colisión de `rowId` entre dos usuarios** (mismo milisegundo al abrir el form): el segundo
  recibiría la tarea del primero como «ya existe». Probabilidad despreciable y ya existía en
  `appendTarea` (usaba `now` como id).
- **Lock por proceso.** Con varias instancias del server, la búsqueda previa sigue cubriendo el
  99 % (dos POST separados por más que el tiempo de escritura); la ventana estrecha queda abierta.
  Prod es un contenedor.
- **Rechazo por `401` real** (usuario desactivado, bloque 1): la cola no se marca; queda esperando.
  Correcto: si vuelve a entrar con otra cuenta, sube con `supervisor` = esa cuenta.
- **Alias `@/` dentro del SW.** Verificado en la implementación: el build lo resuelve y
  `public/sw.js` contiene la clasificación. Si algún día dejara de resolverse, ruta relativa; se verifica en el build
  (`public/sw.js` debe contener la función).
- **Los otros 6 appends siguen sin lock.** Riesgo preexistente y bajo (altas manuales); queda
  documentado como follow-up: aplicar `conLockDeHoja` a usuarios, visitas, directivas,
  asignaciones, partes comunes y ficha es mecánico.
- **Pendientes viejas con `retries >= 3`** creadas antes de este cambio: pasan a reintentarse (ya no
  hay tope). Es el comportamiento deseado: se recuperan.

## Definición de hecho

- Ruta idempotente con lock; `conLockDeHoja` en `appendTarea` y `setArchivosForTarea`; `ApiClientError`; `sync-clasificacion.ts`; `offline-sync.ts` sin tope y
  con rechazo; helpers nuevos en `offline-db.ts`; `TareaPendiente.errorMsg`; SW arreglado y con
  `rowId`/`documentos`; `PendientesDeSubir` en `/tareas`; «Sincronizar ahora» en el modal.
- Tests de la tabla; árbol verde. Sin setup manual (no toca Sheet, `.env` ni deploy). Al deployar,
  la PWA actualiza el SW por el flujo normal (`UpdateBanner`).
