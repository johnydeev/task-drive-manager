# SPEC — Campana de avisos (historial de notificaciones en la app)

**Fecha:** 2026-09-20
**Estado:** Propuesto (rev. 1)
**Autor:** equipo task-drive-manager
**Plan asociado:** [`../plans/2026-09-20-campana-de-avisos.md`](../plans/2026-09-20-campana-de-avisos.md)

Complemento del bloque 4 (push). Los push llegan y desaparecen: si el usuario descarta la
notificación, no la vio, o no activó push, no hay dónde consultarla. Se agrega una **campana
arriba a la derecha** con el historial de avisos del usuario (últimos 30 días), badge de no
leídos, y persistencia en el server para que funcione en cualquier dispositivo y sin push.

| # | Problema | Corrección |
|---|---|---|
| 1 | Un push descartado o perdido no se puede volver a ver. | Cada aviso se guarda en una hoja `Avisos` por destinatario y se lista en la campana. |
| 2 | Sin push activado (o iPhone sin PWA) el usuario no recibe nada. | La campana no depende del push: lee del server. |
| 3 | No hay señal en la UI de que hay algo nuevo. | Badge con cantidad de no leídos; se limpia al abrir el panel. |

---

## Contexto

**Envío actual.** `lib/push.ts` → `notificar(emails, aviso)` manda el push y no persiste nada.
Lo llaman: `app/api/tareas/[id]/route.ts` (3 veces, dentro de `after()`: asignar → asignado;
revisar → admins activos; objetar → asignado; siempre `sinActor`) y
`lib/recordatorios-scheduler.ts` (`correrRecordatoriosSiCorresponde`, un `notificar` por
destinatario, lunes a sábado 08:00 ART, marca del día en `Configuracion.recordatorios_ultimo_envio`
guardada al final).

**Tipo `Aviso`** (`types/index.ts`): `{ titulo, cuerpo, url, tag? }`. Los inmediatos
(`lib/avisos-tarea.ts`) **no** llevan `tag` (con `tag`, dos asignaciones seguidas se pisan en el
sistema operativo). Los recordatorios (`lib/recordatorios.ts`) llevan `tag`
`recordatorio-revision` / `recordatorio-mias`.

**Sheets.** `lib/sheets/core.ts`: `readRange` (cache 30 s), `writeRange` (`values.update`),
`deleteRows` (un `batchUpdate`, de abajo hacia arriba), `conLockDeHoja` para altas «fila libre
por columna A». No hay escritura de varios rangos en una llamada. Patrón de hoja simple:
`lib/sheets/suscripciones.ts` (`buildHeaderMap`, `rowNumbers` por clave).

**SW → pestaña.** `app/sw.ts` ya hace `clients.matchAll` + `postMessage({ type: "TAREAS_SYNCED" })`;
`components/providers/RegisterPWA.tsx` escucha `message` y re-emite `tareas-synced` en `window`.

**Layout.** `components/layout/AppShell.tsx`: desktop = sidebar (`md:flex`) con `OfflineIndicator`
junto al nombre; sin barra superior. Mobile = `<header>` sticky de 3 columnas (menú · título ·
`OfflineIndicator`). Queries en `hooks/queries.ts` (TanStack, `queryKey` por recurso).

## Decisiones (Jony, 2026-09-20)

| Tema | Decisión |
|---|---|
| Fuente | **Server**: hoja `Avisos`, una fila por destinatario. La campana funciona sin push y en cualquier dispositivo. |
| Retención | **30 días**. Purga en la corrida diaria de recordatorios. |
| Contenido | **Todo lo que manda push**: asignar, revisar, objetar y recordatorios diarios. |
| Leído | **Badge de no leídos; al abrir el panel se marcan todos leídos** (un `PATCH`). |
| Desktop | **Barra fina sticky arriba del contenido**, campana a la derecha; el punto de conexión se muda del sidebar a la barra. |
| Recordatorios | El de hoy **reemplaza** al anterior del mismo tipo para ese email (a lo sumo 2 recordatorios vivos por usuario). |

---

## #1 — Datos

### Hoja `Avisos` (nueva, la crea Jony)

Encabezados exactos en `A1:H1`:

```
id | email | titulo | cuerpo | url | tipo | creado_en | leido_en
```

- `id`: `nanoid()`. `email`: minúsculas. `tipo`: `asignar` | `revisar` | `objetar` |
  `recordatorio-revision` | `recordatorio-mias`. `creado_en` / `leido_en`: `nowBuenosAiresISO()`;
  `leido_en` vacío = no leído.
- `SHEETS.avisos = "Avisos"` en `core.ts`.

### Tipos (`types/index.ts`)

```ts
export type TipoAviso = "asignar" | "revisar" | "objetar" | "recordatorio-revision" | "recordatorio-mias";

export interface AvisoGuardado extends Aviso {
  id: string;
  email: string;
  tipo: TipoAviso;
  creadoEn: string;
  leidoEn: string | null;
}
```

### `lib/sheets/avisos.ts`

- `getAvisos(email, { desde }: { desde: number })` → `AvisoGuardado[]` del email con
  `Date.parse(creadoEn) >= desde`, más nuevos primero. Filas sin `email` o sin `titulo` se ignoran.
- `appendAvisos(filas: Omit<AvisoGuardado, "id" | "creadoEn" | "leidoEn">[])` → bajo
  `conLockDeHoja("Avisos")`: fila libre = `rows.length + 1`, **un** `writeRange`
  `Avisos!A{n}:H{n+k-1}` con todas las filas. Lista vacía → no escribe.
- `reemplazarRecordatorios(filas)` → para cada fila, borra las existentes con mismo `email` y
  mismo `tipo` (`deleteRows`, un batch para todas) y después `appendAvisos(filas)`. Todo bajo el
  mismo lock. Solo se usa con tipos `recordatorio-*`.
- `marcarLeidos(email, hasta = Date.now())` → filas del email con `leido_en` vacío y
  `creado_en <= hasta` → **una** llamada `writeRanges([{ range: "Avisos!H{n}", values: [[iso]] }, …])`.
  Devuelve cantidad marcada. Sin filas → no escribe.
- `purgarAvisos(antesDe: number)` → `deleteRows` de las filas con `Date.parse(creado_en) < antesDe`
  (o fecha inválida). Devuelve cantidad borrada.
- Demo (`isDemoMode()`): `getAvisos` → `[]`, escrituras no-op.

### `core.ts` — `writeRanges`

```ts
export async function writeRanges(entradas: { range: string; values: (string | number)[][] }[]): Promise<void>
```

`spreadsheets.values.batchUpdate` con `valueInputOption: "USER_ENTERED"` y `data: entradas`;
invalida cada hoja tocada. Lista vacía → no llama a Google. Re-export en `lib/google-sheets.ts`.

## #2 — Envío: `lib/avisos.ts`

Capa fina sobre `notificar`. **Nunca lanza.**

```ts
export async function avisar(emails: string[], aviso: Aviso, tipo: TipoAviso): Promise<void>
export async function avisarLote(items: { email: string; aviso: Aviso; tipo: TipoAviso }[]): Promise<void>
```

- `avisar`: normaliza emails (trim, minúsculas, sin vacíos ni duplicados); si queda vacío, no
  hace nada. Guarda (`appendAvisos`, una fila por email) y después `notificar(emails, aviso)`.
  Si guardar falla, loguea `[avisos] error guardando:` y **igual** manda el push. Sin claves VAPID
  igual guarda (la campana no depende del push).
- `avisarLote`: agrupa por `tipo`; los `recordatorio-*` van por `reemplazarRecordatorios`, el
  resto por `appendAvisos`; **una** escritura por grupo. Después `notificar` por ítem.
- Demo: no guarda ni manda.

### Llamadores

- `app/api/tareas/[id]/route.ts`: las 3 llamadas a `notificar(...)` pasan a
  `avisar(..., "asignar" | "revisar" | "objetar")`. Mismos destinatarios, mismo `sinActor`, mismo
  `after()`.
- `lib/recordatorios-scheduler.ts`: el `for … notificar` pasa a
  `avisarLote(recordatorios.map((r) => ({ email: r.email, aviso: r.aviso, tipo: r.aviso.tag as TipoAviso })))`.
  Después de `setConfigValor(CLAVE_ULTIMO_ENVIO, fecha)`, purga:

  ```ts
  try {
    const n = await purgarAvisos(now - RETENCION_AVISOS_MS);
    if (n) console.log(`[avisos] purga: ${n} fila(s)`);
  } catch (err) {
    console.error("[avisos] error purgando:", err);
  }
  ```

  `RETENCION_AVISOS_MS = 30 * 24 * 3600 * 1000` en `lib/avisos.ts`. La purga va **después** de
  la marca del día y con su propio `try/catch`: si falla, el próximo tick no re-manda pushes.
- `lib/recordatorios.ts` exporta `Recordatorio.aviso.tag` ya tipado como `TipoAviso` (cambio de
  tipo, no de valor).

## #3 — API

### `GET /api/avisos`

`withAuth`. Responde `{ avisos: AvisoGuardado[], noLeidos: number }`: los del usuario de la
sesión (`session.user.email`), últimos 30 días, más nuevos primero, **tope 50**. `noLeidos` se
cuenta sobre esos 50.

### `PATCH /api/avisos/leer`

`withAuth`. `marcarLeidos(session.user.email)` → `{ ok: true, marcados: n }`. Sin body.

Ambas `runtime = "nodejs"`. Errores por `handleApiError` (ya en `withAuth`).

## #4 — Cliente

### Query — `hooks/queries.ts`

```ts
export function useAvisos() {
  return useQuery({
    queryKey: ["avisos"],
    queryFn: () => apiFetch<{ avisos: AvisoGuardado[]; noLeidos: number }>("/api/avisos"),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
}
```

`apiFetch` ya maneja 401 → login. Sin sesión (página de login) no se monta.

### SW → pestaña

- `app/sw.ts`, handler `push`: además de `showNotification`, `clients.matchAll({ type: "window" })`
  y `postMessage({ type: "AVISO_NUEVO" })` a cada una (dentro del mismo `waitUntil`).
- `RegisterPWA.tsx`, `onMessage`: `AVISO_NUEVO` → `window.dispatchEvent(new CustomEvent("aviso-nuevo"))`.
- `useAvisos` no escucha el SW; lo hace `CampanaAvisos` vía un `useEffect` que en `aviso-nuevo`
  invalida `["avisos"]` (`queryClient.invalidateQueries`). Sin `setState` en efecto.

### `components/layout/CampanaAvisos.tsx`

- Botón `aria-label="Avisos"` con `Bell` (lucide). Badge: `noLeidos` (`9+` si > 9); oculto en 0.
  Mientras `useAvisos` carga por primera vez, sin badge.
- Abrir/cerrar: estado local `abierto`. Al abrir con `noLeidos > 0`: `setQueryData(["avisos"], …noLeidos: 0, leidoEn en todos)`
  (optimista) + `apiFetch("/api/avisos/leer", { method: "PATCH" })`; si falla, `invalidateQueries`.
  Cierra con click afuera (`mousedown` en `document`), `Escape`, o al elegir un aviso.
- Panel: `absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)]`, `role="dialog"`,
  `aria-label="Avisos"`, lista `max-h-[70vh] overflow-y-auto`. Cada ítem `<button>`: título
  (`font-semibold` si `leidoEn` era null al abrir — se usa el snapshot del momento de abrir para
  que no pierdan la negrita al instante), cuerpo (2 líneas, `line-clamp-2`), «hace 2 h»
  (`formatDistance(creadoEn, now, { addSuffix: true, locale: es })` de `date-fns` v4, ya en deps).
  Click → `router.push(url)` y cierra.
- Vacío: «Sin avisos». Error de carga: «No se pudieron cargar los avisos».
- `now` para «hace X» se toma con `useState(() => Date.now())` al abrir (no `Date.now()` en render).

### Ubicación — `AppShell.tsx`

- **Desktop** (`hidden md:flex`): barra sticky arriba de `{children}`, `h-12`, `border-b`,
  `bg-white`, `justify-end`, `gap-3`, `px-6`: `<CampanaAvisos />` + `<OfflineIndicator />`.
  El `OfflineIndicator` del sidebar (línea ~63) **se saca**.
- **Mobile**: en el `<header>` existente, celda derecha: `<div className="flex items-center gap-3 justify-self-end"><CampanaAvisos /><OfflineIndicator /></div>`.
- El panel de la campana usa `z-40` (por encima del header `z-30` y del bottom nav `z-20`).

## #5 — Setup manual (Jony)

1. Hoja `Avisos` en la planilla, encabezados `id | email | titulo | cuerpo | url | tipo | creado_en | leido_en` en `A1:H1`.
2. Deploy (push a `main`). Sin la hoja, `appendAvisos` falla: se loguea `[avisos] error guardando:`
   y el push igual sale; la campana muestra «No se pudieron cargar los avisos».

## Tests

- `lib/sheets/avisos.test.ts` (mock `googleapis` a nivel transporte, como `suscripciones.test.ts`):
  `getAvisos` filtra por email y `desde`, ordena desc, ignora filas sin email/título;
  `appendAvisos` escribe todas las filas en un solo `values.update` en la fila libre; vacío no
  escribe; `reemplazarRecordatorios` borra las del mismo email+tipo y agrega; `marcarLeidos` un
  solo `batchUpdate` con `H{n}` de las no leídas del email (no toca las leídas ni las de otros);
  `purgarAvisos` borra solo las viejas o con fecha inválida; demo → `[]` / no-op.
- `lib/sheets/core.test.ts`: `writeRanges` llama `values.batchUpdate` una vez, invalida las hojas,
  vacío no llama.
- `lib/avisos.test.ts` (mocks de `./sheets/avisos` y `./push`): `avisar` guarda y manda; emails
  normalizados y sin duplicados; vacío no hace nada; guardar falla → igual manda; `avisarLote`
  agrupa por tipo (recordatorios por `reemplazarRecordatorios`, resto por `appendAvisos`) y manda
  por ítem; demo no hace nada.
- `tests/api/tareas-transiciones.test.ts`: mock `@/lib/avisos` en vez de `@/lib/push`; los asserts
  de `notificar(...)` pasan a `avisar(emails, aviso, tipo)`.
- `lib/recordatorios-scheduler.test.ts`: mock `./avisos`; `avisarLote` recibe todos los
  recordatorios; purga después de la marca; purga que lanza no rompe el `"enviado"`.
- `tests/api/avisos.test.ts`: GET 401 sin sesión, solo propios, tope 50, `noLeidos`; PATCH marca
  y devuelve `marcados`.
- `components/layout/CampanaAvisos.test.tsx` (mock `useAvisos`, router, `apiFetch`): badge con
  cantidad y `9+`; sin badge en 0; abrir dispara PATCH y badge a 0; ítems no leídos en negrita;
  click navega a `url` y cierra; `Escape` cierra; vacío «Sin avisos»; `aviso-nuevo` invalida.
- `AppShell.test.tsx`: la campana se renderiza (una por viewport visible).
- `components/providers/RegisterPWA.test.tsx` (nuevo, mínimo): un `message` del SW con
  `AVISO_NUEVO` dispara `aviso-nuevo` en `window`; `TAREAS_SYNCED` sigue disparando `tareas-synced`.

## Criterios de aceptación

1. Asignar / enviar a revisión / objetar deja una fila en `Avisos` por destinatario (sin el actor)
   **y** manda el push. Sin VAPID, la fila igual queda.
2. Recordatorios diarios: una fila por destinatario; al día siguiente reemplaza a la anterior del
   mismo tipo. Filas de más de 30 días desaparecen tras la corrida diaria.
3. La campana muestra los avisos propios (30 días, tope 50), badge con no leídos, y al abrir el
   badge queda en 0 y persiste como leído en la hoja.
4. Click en un aviso abre la tarea (o la lista filtrada, en recordatorios).
5. Un push recibido con la app abierta refresca la campana sin recargar.
6. Desktop: barra superior con campana + conexión; el sidebar ya no tiene el punto de conexión.
   Mobile: campana en el header, junto al punto de conexión.
7. `npm test`, `tsc`, `lint`, `build` verdes.

## Riesgos

- **Cuota de Sheets.** +1 escritura por acción del ciclo de vida y +1 por apertura del panel
  con no leídos. `marcarLeidos` es una sola llamada aunque haya 40 no leídos. El `GET` está
  cacheado 30 s y el polling es a 60 s.
- **Hoja inexistente** en prod hasta que Jony la cree: push sigue saliendo; campana con mensaje
  de error, sin romper nada.
- **Mismo navegador, dos cuentas**: la campana muestra los del usuario logueado (server-side por
  sesión), no tiene el problema de las suscripciones.
- **Optimismo al marcar leídos**: si el `PATCH` falla, se invalida y el badge vuelve.

## Definición de hecho

Código + tests verdes + hoja `Avisos` creada + deploy + verificación manual: asignar una tarea
desde admin y ver el aviso en la campana del supervisor (PC) con badge 1 → abrir → badge 0 →
recargar → sigue leído.
