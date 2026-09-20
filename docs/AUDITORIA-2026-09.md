# Auditoría UX + código — septiembre 2026

Estado al 2026-09-20. Resumen de lo hecho a partir de la auditoría del 2026-09-19 (25 hallazgos
rankeados), lo que queda, y el setup manual pendiente. Cada bloque tiene spec + plan en
`docs/superpowers/` y un commit propio en `main`.

| Bloque | Commit | Spec | Estado |
|---|---|---|---|
| 1 — Seguridad | `796228e` | `specs/2026-09-19-seguridad-sesion-papelera-errores-design.md` | ✅ |
| 2A — Cuota de Sheets | `ae12525` | `specs/2026-09-19-cache-sheets-y-query-unica-design.md` | ✅ |
| 2B — Offline | `3804478` | `specs/2026-09-19-offline-sync-idempotente-y-cola-visible-design.md` | ✅ |
| 3 — UX de campo | `245889f` | `specs/2026-09-19-ux-de-campo-lista-combobox-reporte-toasts-design.md` | ✅ |
| 4 — Push + fin del cierre automático | `b70db4e` | `specs/2026-09-20-notificaciones-push-y-fin-cierre-automatico-design.md` | ✅ código · ⏳ setup manual |

Árbol verde al cierre: **783 tests / 114 archivos**, `tsc` limpio, lint 0 errores (6 warnings
preexistentes de `react-hooks/set-state-in-effect`), build OK.

---

## Bloque 1 — Seguridad

- **Revocación de acceso en ≤ 15 min.** `lib/auth-revalidacion.ts`: el callback `jwt` relee
  `Usuarios` cada 15 min (`validadoEn` en el token). Inactivo/borrado → `null` → Auth.js limpia
  la cookie. Fail-open si Sheets falla. Antes un usuario desactivado seguía 7 días.
- **`DELETE /api/upload?url=` restringido**: solo archivos bajo `GOOGLE_DRIVE_ROOT_FOLDER_ID`
  (`estaBajoRaiz`, cadena de `parents`) **y** no referenciados por ninguna fila
  (`lib/archivo-referencias.ts`: media/reporte de tareas, PDF de visitas, firmas). Antes
  papeleaba cualquier archivo de la unidad compartida.
- **500 opacos**: `handleApiError` responde `{ error: "Error interno", ref }`; el mismo `ref`
  (`nanoid(8)`) va al `console.error`. Buscar en logs: `ref=xxxx`.
- **401 → login**: `apiFetch` en `lib/api-client.ts` redirige a `/login?from=…`; todo `fetch`
  del cliente pasa por ahí.

## Bloque 2A — Cuota de Sheets (60 lecturas/min, una sola service account)

- `lib/sheets/core.ts`: cache por rango **TTL 30 s** (`SHEETS_CACHE_TTL_MS`; en tests = 0),
  dedup de lecturas en vuelo, `writeRange`/`deleteRows` que invalidan la hoja al escribir,
  `conReintentos` ante 429/503 (500 → 1,5 s → 4 s). `getSheets()` es privado: **toda escritura
  pasa por `core.ts`**. Un `PATCH` pasó de 6–8 llamadas a 1 escritura + 1 lectura diferida.
- Cliente: `useTareas()` (`hooks/queries.ts`) es la **única** fuente de tareas; lista, dashboard
  e informes filtran en memoria con `filterTareas`; el detalle arranca con `initialData` de la
  lista; cache offline en Dexie v4 (`cacheTareas`, 24 h).

## Bloque 2B — Offline

- `POST /api/tareas` **idempotente por `rowId`** (existe → 200 con la existente; lock en memoria
  para POST concurrentes). `conLockDeHoja` serializa el "fila libre por columna A" de `Tareas` y
  `TareaArchivos`.
- Cola: sin tope de reintentos por red; rechazo 4xx (salvo 401/429) → `errorMsg` y queda fuera
  del sync automático (`lib/sync-clasificacion.ts`, compartido con el SW).
- SW arreglado (abría IndexedDB v1 contra v4; `await fetch` dentro de una transacción).
- UI: sección «Pendientes de subir» arriba de `/tareas` (Reintentar / Descartar) y «Sincronizar
  ahora» en el modal del indicador de conexión.

## Bloque 3 — UX de campo

- Filtros, búsqueda y orden de `/tareas` persistidos en la URL (`useListaTareas`,
  `router.replace`). Orden default: abiertas primero → Alta/Media/Baja → más reciente.
- Búsqueda en memoria sin acentos (`lib/texto.ts`, `lib/tareas-orden.ts`).
- `Combobox strict` en los 6 selectores de edificio (texto interno, ✕ Limpiar, opciones
  `<li role="option">`).
- Reporte al cerrar: `after()` de `next/server` + polling 3 s (tope 20) **solo si
  `realizadaEn` < 10 min**.
- Toasts propios (`components/ui/Toaster.tsx`) en vez de modales de éxito; el modal queda solo
  para «visita guardada» (tiene Ver/Descargar/Compartir).

## Bloque 4 — Push y fin del cierre automático

- **El cierre es siempre humano.** `lib/tareas-estado.ts` eliminado; una tarea `En Revisión`
  queda así hasta que el admin la cierre u objete. Directivas conservan su
  `Realizada → Cerrada` a 72 h (archivo, no cierre).
- **Web Push** (`web-push`): hoja `Suscripciones`, `POST/DELETE /api/push/suscribir`,
  `lib/push.ts` (nunca lanza; 410/404 borra la suscripción; sin claves → log y nada).
- **Inmediatos** (`PATCH`, con `after()`): asignar → asignado · revisar → admins activos ·
  objetar → asignado. Nunca a quien hizo la acción.
- **Recordatorios diarios**, lunes a sábado 08:00 ART, desde 24 h de trabada, agrupados por
  destinatario (`lib/recordatorios.ts` + `lib/recordatorios-scheduler.ts` + `instrumentation.ts`).
  Marca del día en `Configuracion.recordatorios_ultimo_envio`. **Solo corren con
  `NODE_ENV=production`** o `RECORDATORIOS_ENABLED=1`.
- Cliente: SW `push`/`notificationclick`; `hooks/useAvisosPush.ts`; entrada «Avisos» en drawer
  y sidebar; banner una vez en `/tareas`.

### ⏳ Setup manual pendiente (Jony)

1. `npx web-push generate-vapid-keys` → `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`;
   `VAPID_SUBJECT=mailto:…`. Las tres al `.env` de prod (secret `PROD_ENV_FILE`).
2. Variable de repo en GitHub (Settings → Secrets and variables → Actions → **Variables**):
   `NEXT_PUBLIC_VAPID_PUBLIC_KEY` = la pública. Se hornea en el build (Dockerfile y CI ya la
   pasan como build-arg).
3. Hoja `Suscripciones` en la planilla, headers exactos en A1:G1:
   `id | email | endpoint | p256dh | auth | user_agent | creado_en`.
4. Tras el deploy: «Activar avisos» en cada dispositivo (iPhone: primero «Instalar app»).
   Verificación manual en Chrome: DevTools → Application → Service Workers → Push / Sync.

Sin las claves la app funciona igual; el log dice `[push] deshabilitado`.

---

## Backlog (menor, sin decisiones de cliente)

- `conLockDeHoja` en los otros 6 appends (usuarios, visitas, directivas, asignaciones, partes
  comunes, ficha). Mecánico, ~30 min.
- `updateTarea` reescribe las 28 columnas → lost update si dos personas editan a la vez.
  Escribir solo las celdas tocadas.
- Borrado por `rowNumber` sin verificar (`deleteTarea`): releer `A{n}` antes del
  `deleteDimension`, o soft-delete.
- Timestamps mixtos en la planilla (`creadoEn` con `-03:00`, `asignadaEn`/`revisionEn` en UTC).
- Badges de estado/prioridad duplicados en lista, detalle y dashboard.
- `error.tsx` / `not-found.tsx` / `loading.tsx` en `app/`.
- Rotación de claves VAPID: si se regeneran, cada usuario tiene que tocar «Activar avisos» de
  nuevo (el badge sigue en «activados» hasta entonces).

## Convenciones que dejaron estos bloques (para no romperlas)

- Escrituras a Sheets **solo** por `writeRange`/`deleteRows` de `core.ts`; altas «fila libre» bajo
  `conLockDeHoja`.
- Tests de `lib/sheets/*` mockean `googleapis`; el cache va apagado por `SHEETS_CACHE_TTL_MS=0`
  en `vitest.setup.ts`.
- Tests con factory cerrada de `@/lib/google-drive`, `@/lib/api-client` o `@/lib/google-sheets`
  deben sumar los exports nuevos que use el módulo bajo prueba.
- Nada de `setState` en `useEffect` (lint del compilador de React): patrón "ajustar estado
  durante el render" o `useSyncExternalStore`.
- `after()` de `next/server` lanza fuera de un request: mockearlo en tests de rutas.
- TanStack notifica con `setTimeout(0)`: con fake timers, `advanceTimersByTimeAsync(1)`.
- `clearAllMocks` no vacía las colas de `mockResolvedValueOnce`: `mockReset()` antes de encadenar.
- En este jsdom `localStorage` es un objeto plano: stubear un Storage real en tests.
