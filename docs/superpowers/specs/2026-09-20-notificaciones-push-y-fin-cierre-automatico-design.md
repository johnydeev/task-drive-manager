# SPEC — Notificaciones push y fin del cierre automático de tareas

**Fecha:** 2026-09-20
**Estado:** Propuesto (rev. 1)
**Autor:** equipo task-drive-manager
**Plan asociado:** [`../plans/2026-09-20-notificaciones-push-y-fin-cierre-automatico.md`](../plans/2026-09-20-notificaciones-push-y-fin-cierre-automatico.md)

Bloque 4 de la auditoría del 2026-09-19, con un cambio de enfoque decidido por Jony: **la tarea
no se cierra sola**. En vez de darla por `Realizada` a las 72 h sin que nadie la mire, la app
**insiste** —por notificación push— a quien tiene que moverla: al admin para revisar, al
supervisor para avanzar. Las notificaciones inmediatas (te asignaron / hay algo para revisar /
te objetaron) son el otro pilar: el ciclo deja de depender de que cada uno "entre a mirar".

| # | Problema | Corrección |
|---|---|---|
| 1 | El cierre automático a 72 h deriva `Realizada` al leer pero no persiste: sin `realizadaEn`, sin nota, sin reporte, y en la planilla queda «En Revisión» para siempre. Además "cierra" trabajo que nadie revisó. | Se elimina la derivación. Cerrar es siempre humano (admin). |
| 2 | Nadie se entera de nada sin abrir la app: el asignado no sabe que le asignaron, el admin no sabe que hay algo en revisión. | Web Push inmediato al asignar, enviar a revisión y objetar. |
| 3 | Una tarea trabada (sin aceptar, sin empezar, sin reenviar, sin cerrar) no molesta a nadie. | Recordatorio diario (lunes a sábado, 08:00 ART) agrupado por destinatario, desde las 24 h de trabada. |

---

## Contexto

**Cierre automático.** `lib/tareas-estado.ts` (`estadoEfectivoTarea`) convierte `En Revisión` +
`revisionEn` > 72 h en `Realizada` al leer (`getTareas`, `lib/sheets/tareas.ts:166`). Nunca se
persiste. `getTareaPersistida` existe solo para validar transiciones contra el estado real.
`AccionesTarea` muestra «Cierre automático: {fecha}» (`venceISO`). Comentarios en
`lib/pendientes-por-edificio.ts` y `lib/informes.ts` lo mencionan. `tests/lib/google-sheets-crud.test.ts`
tiene `describe("getTareas — estado derivado a 72h")`. Las **directivas** tienen su propia
derivación (`Realizada → Cerrada` a las 72 h, `lib/directivas-estado.ts`): es archivo, no cierre,
y **no se toca**.

**Push.** No hay nada: ni `web-push` ni handler `push` en `app/sw.ts` (serwist; ya maneja `sync`
y `message`). Íconos en `public/icon-192.png` / `icon-512.png`. El SW se registra en
`components/providers/RegisterPWA.tsx`.

**Scheduler.** No existe `instrumentation.ts`. Docs de esta versión
(`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md`):
`register()` corre **una vez** al iniciar el server, debe terminar antes de servir requests, y
`process.env.NEXT_RUNTIME` distingue `nodejs`/`edge`. Precedente de cron externo: el workflow
diario de backfill (descartado acá, decisión de Jony: sin dependencias externas).

**Configuración.** `getConfiguracion()` lee `Configuracion!A2:B` como mapa clave→valor e ignora
claves desconocidas; `updateConfiguracion()` **reescribe las filas 2–12** en su propio orden. Una
clave extra en la fila 13+ sobrevive, pero no se puede confiar en que quede en una fila fija.

**Usuarios.** `getUsuarios()` devuelve `{ email, nombre, rol, activo, … }`; los admins son
`rol === "admin" && activo`.

## Decisiones

- **Cerrar es humano.** Se borra `estadoEfectivoTarea`; ninguna lectura deriva estado. Costo: una
  tarea puede quedar `En Revisión` indefinidamente; para eso están los recordatorios.
- **Directivas quedan con su derivación** (`Realizada → Cerrada`): semántica distinta (archivo).
- **Web Push, no email.** Llega con la app cerrada, cero costo por mensaje, ya hay PWA + SW. iPhone
  requiere la PWA instalada (iOS ≥ 16.4): se avisa en la UI.
- **Una suscripción por dispositivo, varias por email.** El celular y la PC del admin reciben las
  dos. Se identifican por `endpoint` (único por suscripción).
- **Inmediatos con `after()`**, igual que el reporte: nunca demoran ni rompen la respuesta del
  `PATCH`.
- **Recordatorios desde el propio server** (`instrumentation.ts` + `setInterval` cada 15 min), no
  cron externo. Idempotencia por día guardada en la Sheet (`Configuracion`,
  clave `recordatorios_ultimo_envio` = `YYYY-MM-DD` en ART): un reinicio del contenedor no repite.
  Guard contra doble arranque en dev (`globalThis` flag).
- **Lectura/escritura de esa clave por helpers propios** (`getConfigValor`/`setConfigValor`, buscan
  la fila por clave y la agregan si no existe), no por `updateConfiguracion`: ese reescribe las 11
  claves fijas y no sabe de esta.
- **Cadencia: diario, lunes a sábado, 08:00 ART, desde las 24 h, sin límite**, decidido por Jony.
  "Trabada" se mide desde el timestamp del estado actual: `asignadaEn`, `aceptadaEn`, `objetadaEn`,
  `revisionEn`. Sin ese timestamp (filas viejas) se usa `actualizadoEn`; sin ninguno, no se avisa.
- **Agrupado por destinatario:** una notificación por persona por día, no una por tarea. Un admin
  con 8 en revisión recibe «8 tareas esperan tu revisión».
- **El push nunca lanza.** `notificar()` captura todo y loguea; un `410 Gone`/`404` borra esa
  suscripción (el navegador la invalidó).
- **Permiso siempre a pedido del usuario** (botón), nunca al cargar: los navegadores bloquean el
  prompt no solicitado y el usuario lo rechaza por reflejo.
- **`web-push`** como dependencia (estándar de facto; firma VAPID y cifra el payload) +
  `@types/web-push` en dev (el paquete no trae tipos).

---

## #1 — Fin del cierre automático

- Borrar `lib/tareas-estado.ts` y `lib/tareas-estado.test.ts` (existe). En `getTareas`, quitar
  el `estado: estadoEfectivoTarea(t)`. `getTareaPersistida` pasa a ser un alias documentado de
  `getTareaByRowId` (se mantiene el nombre: lo usa `app/api/tareas/[id]/route.ts` en 4 handlers y sus
  tests lo mockean; comentario: «ya no hay estado derivado; se conserva por compatibilidad»).
- `AccionesTarea`: borrar `venceISO` y el `<p>` «Cierre automático: …».
- Comentarios: `lib/pendientes-por-edificio.ts:11`, `lib/informes.ts` (si menciona 72 h),
  `lib/sheets/tareas.ts` («cierre derivado a 72h»), `app/api/tareas/[id]/route.ts` (docstring del
  GET: «El estado se muestra derivado (72h)»).
- Tests: eliminar `describe("getTareas — estado derivado a 72h")` de `google-sheets-crud.test.ts`;
  revisar `tests/api/tareas-transiciones.test.ts` por casos que dependan de la derivación (ninguno
  esperado: validan contra `getTareaPersistida` mockeado).
- Informes: el bloque «Realizadas» ya agrupa por `estado === "Realizada"` persistido; sin cambios.

---

## #2 — Suscripciones

### Hoja `Suscripciones` (nueva, la crea Jony)

| Columna | Contenido |
|---|---|
| `id` | `nanoid(10)` |
| `email` | dueño, en minúsculas |
| `endpoint` | URL del push service (única) |
| `p256dh` | clave del cliente |
| `auth` | secreto del cliente |
| `user_agent` | `navigator.userAgent` recortado a 120 chars; informativo, para reconocer el dispositivo en la hoja |
| `creado_en` | ISO ART |

`lib/sheets/suscripciones.ts`: `getSuscripciones(emails?: string[])`, `upsertSuscripcion(s)`
(por `endpoint`: si existe con el mismo `email` y claves → **no escribe nada** (la UI re-sincroniza
en cada carga; sin esto sería una escritura + invalidación de cache por page-load); si existe con
datos distintos → actualiza esa fila; si no existe → agrega con el patrón fila libre +
`conLockDeHoja`), `deleteSuscripcion(endpoint)`. Lectura cacheada por `readRange` como todo.

### Rutas

- `POST /api/push/suscribir` (`withAuth`): body `{ endpoint, keys: { p256dh, auth } }` (lo que
  devuelve `PushSubscription.toJSON()`), validado con Zod. Guarda con el email de la sesión →
  `201 { ok: true }`.
- `DELETE /api/push/suscribir?endpoint=…` (`withAuth`): borra si el `endpoint` pertenece al email
  de la sesión (o es admin) → `200`. Ajeno → `403`.
- `GET /api/push/clave` no hace falta: la pública viaja como `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.

### Env

`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:contacto@…`) y
`NEXT_PUBLIC_VAPID_PUBLIC_KEY` (mismo valor que la pública). Sin las privadas, `notificar()`
loguea «push deshabilitado: faltan claves VAPID» y no hace nada; sin la pública, la UI de «Avisos»
no se muestra. Van a `.env.example` y al secret `PROD_ENV_FILE` del CI.

---

## #3 — Envío

### `lib/push.ts`

```ts
export interface Aviso {
  titulo: string;
  cuerpo: string;
  url: string; // ruta dentro de la app; el SW la abre al tocar
  tag?: string; // agrupa/reemplaza en el sistema (p. ej. "recordatorio-admin")
}

// Manda el aviso a todas las suscripciones de esos emails. Nunca lanza: un push fallido no
// rompe la acción que lo disparó. Suscripciones muertas (410/404) se borran.
export async function notificar(emails: string[], aviso: Aviso): Promise<{ enviados: number; borradas: number }>;
```

- `web-push` se configura una vez (`setVapidDetails`) con las env. `sendNotification(sub, JSON.stringify(aviso), { TTL: 24 * 3600 })`.
- Emails vacíos o sin suscripciones → `{ enviados: 0, borradas: 0 }` sin llamar a nada.
- `DEMO_MODE`: no envía (log).

### Inmediatos — `app/api/tareas/[id]/route.ts`

Después de cada `updateTarea` exitoso, con `after()`:

| Acción | Destinatarios | Título | Cuerpo | url |
|---|---|---|---|---|
| asignar (nuevo o reasignación) | `[asignadoA]` | «Te asignaron una tarea» | `{objetivo} · {edificio} · {dpto}` | `/tareas/{id}` |
| revisar | admins activos (`getUsuarios`) | «Tarea lista para revisar» | `{objetivo} · {edificio}` (+ nombre del asignado si hay) | `/tareas/{id}` |
| objetar | `[asignadoA]` | «Tu tarea fue objetada» | `{objetivo}: {notaObjecion}` recortada a 120 chars | `/tareas/{id}` |

`aceptar`, `empezar`, `cerrar`, `editarComentario*`, `agregarArchivos`: sin aviso (no hay nadie
esperando). **Nadie recibe aviso de su propia acción:** se excluye el email de la sesión de los
destinatarios (un admin que se asigna una tarea a sí mismo, o que la manda a revisión siendo el
único admin, no recibe push). El helper `lib/avisos-tarea.ts` (puro) arma el `Aviso` a partir de la tarea y la
acción; la ruta solo resuelve destinatarios y llama `notificar`.

### Recordatorios — `lib/recordatorios.ts` (puro) + `lib/recordatorios-scheduler.ts` (IO)

```ts
// Puro. Dado el listado de tareas, los usuarios y "ahora", arma un aviso por destinatario.
export function armarRecordatorios(
  tareas: Tarea[],
  usuarios: Usuario[],
  now: number
): { email: string; aviso: Aviso }[];
```

Reglas:
- Trabada = `now - Date.parse(ts) >= 24 h`, con `ts` según estado: `Asignada`→`asignadaEn`,
  `Aceptada`→`aceptadaEn`, `Objetada`→`objetadaEn`, `En Revisión`→`revisionEn`; si falta, `actualizadoEn`;
  si tampoco, se ignora. `Sin asignar`, `En Proceso` y `Realizada` no generan recordatorio (`En
  Proceso` es trabajo en curso; apurarlo no es decisión de la app).
- `En Revisión` trabadas → a **cada admin activo**: título «Tareas esperando tu revisión», cuerpo
  «N tarea(s) en revisión hace más de un día» (N=1: «{objetivo} · {edificio} espera tu revisión»),
  url `/tareas?estado=En+Revisión&orden=antiguas`, tag `recordatorio-revision`.
- `Asignada`/`Aceptada`/`Objetada` trabadas → a **su asignado** (solo si sigue activo): título
  «Tenés tareas sin avanzar», cuerpo «N tarea(s) esperan tu acción» (N=1: «{objetivo} · {edificio}:
  {sin aceptar | sin empezar | objetada}»), url `/tareas?mias=1&orden=antiguas`, tag `recordatorio-mias`.
- Un email recibe **como mucho dos** avisos (uno de admin, uno de asignado) si cumple ambos roles.

Scheduler:
```ts
export async function correrRecordatoriosSiCorresponde(now = Date.now()): Promise<"enviado" | "omitido">;
```
- Hora ART = UTC−3 fija (misma convención que `lib/fecha-ar.ts`). Omite si: domingo · antes de las
  08:00 · `getConfigValor("recordatorios_ultimo_envio") === hoyART`.
- Si corresponde: `getTareas()` + `getUsuarios()` → `armarRecordatorios` → `notificar` por
  destinatario → `setConfigValor("recordatorios_ultimo_envio", hoyART)` **al final** (si el envío
  explota a mitad, el próximo tick reintenta).
- **Solo corre en producción** (`process.env.NODE_ENV === "production"`) o con
  `RECORDATORIOS_ENABLED=1` explícito: el `.env.local` de dev tiene credenciales reales de la Sheet
  (memoria: asignaciones/directivas escriben la hoja real) y un `npm run dev` abierto a las 08:00
  mandaría pushes reales y marcaría el día. `DEMO_MODE` también lo apaga.
- `instrumentation.ts` (raíz):
  ```ts
  export async function register() {
    if (process.env.NEXT_RUNTIME !== "nodejs") return;
    const { iniciarSchedulerRecordatorios } = await import("./lib/recordatorios-scheduler");
    iniciarSchedulerRecordatorios();
  }
  ```
  `iniciarSchedulerRecordatorios()`: guard `globalThis.__recordatoriosIniciado` (dev recarga
  módulos), `setInterval(correr, 15 min)` + una corrida a los 60 s del arranque (por si el
  contenedor se levantó después de las 08:00). No se `await`ea nada en `register`.

---

## #4 — Cliente

### `app/sw.ts`

```ts
self.addEventListener("push", (event) => {
  const aviso = event.data?.json() as Aviso;
  event.waitUntil(self.registration.showNotification(aviso.titulo, {
    body: aviso.cuerpo, icon: "/icon-192.png", badge: "/icon-192.png", tag: aviso.tag, data: { url: aviso.url },
  }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/tareas";
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
    const abierta = cs.find((c) => "focus" in c);
    return abierta ? abierta.focus().then((c) => c.navigate(url)) : self.clients.openWindow(url);
  }));
});
```

### `hooks/useAvisosPush.ts`

Estado derivado del navegador:
- `soporte`: `"ok" | "sin-soporte" | "ios-sin-instalar"` (`"Notification" in window && "PushManager" in window`; iOS sin standalone → `ios-sin-instalar`).
- `permiso`: `Notification.permission` (`default | granted | denied`).
- `suscripto`: `registration.pushManager.getSubscription()` no nulo.
- `activar()`: `Notification.requestPermission()` → si `granted`, `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(NEXT_PUBLIC_VAPID_PUBLIC_KEY) })` → `POST /api/push/suscribir` con `sub.toJSON()`.
- `desactivar()`: `sub.unsubscribe()` + `DELETE /api/push/suscribir?endpoint=`.
- Al montar, si `permiso === "granted"` y hay suscripción local, **re-sincroniza** (`POST`) por si
  la hoja se vació o el usuario cambió de cuenta en el mismo navegador.

### Entrada «Avisos» — `components/layout/AvisosPush.tsx`

Va en `MobileDrawer` y en el sidebar de `AppShell`, arriba de «Instalar app». Render según estado:
- `sin-soporte` → no se muestra.
- `ios-sin-instalar` → ícono `BellOff` + «Avisos: instalá la app para activarlos» (texto, sin acción).
- `permiso === "denied"` → `BellOff` + «Avisos bloqueados en el navegador» (title con cómo permitirlos).
- no suscripto → botón `Bell` «Activar avisos» (spinner mientras `activar()`).
- suscripto → `BellRing` «Avisos activados» + botón chico «Desactivar».
- Sin `NEXT_PUBLIC_VAPID_PUBLIC_KEY` → no se muestra.

### Banner en `/tareas` — `components/tareas/BannerAvisos.tsx`

Una sola vez por dispositivo (`localStorage["avisos-banner-cerrado"]`), solo si `soporte === "ok"`,
`permiso === "default"` y no suscripto: «Activá los avisos para enterarte cuando te asignen o
revisen una tarea» + **Activar** + **Ahora no**. Debajo de `PendientesDeSubir`. `localStorage`
envuelto en try/catch (modo privado).

---

## #5 — Setup manual (Jony)

1. `npx web-push generate-vapid-keys` → `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`; `VAPID_SUBJECT=mailto:…`.
   Las tres privadas/runtime van al `.env` de prod (secret `PROD_ENV_FILE`).
   **`NEXT_PUBLIC_VAPID_PUBLIC_KEY` se hornea en el build** (verificado: el `Dockerfile` ya recibe
   `NEXT_PUBLIC_APP_NAME` como `ARG` y el CI lo pasa por `build-args` desde `vars.*`). Mismo camino:
   el código suma el `ARG`/`ENV` al `Dockerfile` y la línea en `build-args` del workflow; Jony carga
   la **variable de repo** `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (Settings → Secrets and variables →
   Variables; es pública, no hace falta secret). Para dev, en `.env.local`.
2. Hoja `Suscripciones` con los 7 headers exactos en A1:G1.
3. `Configuracion`: nada que hacer; `recordatorios_ultimo_envio` la agrega el server.
4. Tras el deploy: cada usuario toca «Activar avisos» una vez por dispositivo. En iPhone, primero
   «Instalar app».

---

## Tests

| Archivo | Casos |
|---|---|
| `lib/avisos-tarea.test.ts` | asignar/revisar/objetar arman título, cuerpo y url correctos · objeción recortada a 120 · sin dpto no deja « · » colgado |
| `lib/recordatorios.test.ts` | `En Revisión` > 24 h → un aviso por admin activo, ninguno a inactivos · < 24 h → nada · `Asignada`/`Aceptada`/`Objetada` > 24 h → un aviso al asignado con N · asignado inactivo → nada · `Sin asignar`/`En Proceso`/`Realizada` → nada · sin timestamp usa `actualizadoEn`; sin ninguno se ignora · admin que además es asignado recibe dos · N=1 usa el texto singular con objetivo |
| `lib/recordatorios-scheduler.test.ts` (mockea `getTareas`, `getUsuarios`, `notificar`, `getConfigValor`/`setConfigValor`) | domingo → `omitido` sin leer nada · 07:59 ART → omitido · 08:00 ART lunes sin envío hoy → envía y guarda la fecha · ya enviado hoy → omitido · `notificar` lanza → no guarda la fecha (reintenta) · `iniciarScheduler` dos veces → un solo interval (fake timers) · sin `NODE_ENV=production` ni `RECORDATORIOS_ENABLED` → no programa nada |
| `lib/push.test.ts` (mockea `web-push` y `sheets/suscripciones`) | sin claves VAPID → no llama, devuelve ceros · envía a cada suscripción de los emails · 410 → `deleteSuscripcion` de esa y sigue con las demás · error genérico → loguea, no lanza · emails vacíos → nada |
| `lib/sheets/suscripciones.test.ts` | `upsert` por endpoint (nuevo agrega / existente con cambios actualiza / existente igual **no escribe**) · `delete` por endpoint · `getSuscripciones(emails)` filtra en minúsculas |
| `tests/api/push-suscribir.test.ts` | POST válido → 201 y `upsert` con el email de la sesión · body inválido → 400 · DELETE propio → 200 · DELETE ajeno → 403 · admin borra ajeno → 200 |
| `tests/api/tareas-transiciones.test.ts` (extender; `after` ya está mockeado) | asignar → `notificar([asignado], …)` · revisar → `notificar(admins sin el actor, …)` · objetar → `notificar([asignado], …)` · aceptar/cerrar → `notificar` no se llama · admin se asigna a sí mismo → no se llama |
| `tests/lib/google-sheets-crud.test.ts` | quitar el `describe` de 72 h; agregar «`En Revisión` viejo se lee `En Revisión`» |
| `components/tareas/AccionesTarea.test.tsx` | sin cambios (verificado: no afirma «Cierre automático»); se agrega una aserción negativa en el caso de «En Revisión» |
| `hooks/useAvisosPush.test.tsx` (mockea `navigator.serviceWorker`, `Notification`, `PushManager`) | sin soporte · denied · activar: pide permiso, suscribe y POSTea · desactivar · iOS sin standalone |
| `components/layout/AvisosPush.test.tsx` | los 5 estados de render |
| `components/tareas/BannerAvisos.test.tsx` | se muestra una vez; «Ahora no» lo oculta y persiste; no aparece si suscripto |

El SW (`push`/`notificationclick`) sin test unitario; verificación manual con DevTools →
Application → Service Workers → «Push».

## Criterios de aceptación

1. Una tarea `En Revisión` con `revisionEn` de hace 5 días sigue `En Revisión` en lista, detalle,
   informes y planilla; el admin la puede cerrar u objetar. No existe el texto «Cierre automático».
2. Con las claves cargadas: al asignar, el asignado recibe el push en ≤ 5 s con la app cerrada
   (Android) y al tocarlo se abre la tarea. Al enviar a revisión lo reciben todos los admins. Al
   objetar, el asignado.
3. Lunes a sábado 08:00 ART: cada admin con tareas en revisión de más de 24 h recibe **una**
   notificación con el conteo; cada asignado con trabadas, una. Domingo nada. Reiniciar el
   contenedor a las 10:00 no repite el envío del día.
4. «Activar avisos» pide permiso, y al aceptar queda «Avisos activados»; «Desactivar» lo revierte.
   Con el permiso bloqueado se ve el estado y cómo destrabarlo. En iPhone sin instalar, el aviso
   de instalar.
5. Sin claves VAPID en el server, nada explota: las acciones funcionan igual y el log dice que el
   push está deshabilitado.
6. `npm test` + `npx tsc --noEmit` + `npm run lint` + `npm run build` verdes.

## Riesgos

- **`NEXT_PUBLIC_VAPID_PUBLIC_KEY` en build time.** Si el CI no la tiene al compilar, la UI de
  avisos no aparece en prod aunque el server tenga las privadas. Se documenta en el setup y se
  verifica en el primer deploy.
- **iOS.** Solo con la PWA instalada y iOS ≥ 16.4; además Safari puede revocar suscripciones
  inactivas. La re-sincronización al montar mitiga.
- **Scheduler dentro del server.** Si el contenedor está caído a las 08:00, la corrida sale al
  arrancar (+60 s) el mismo día; si está caído todo el día, ese día no hay recordatorio. Aceptado.
- **Doble instancia.** Dos contenedores mandarían dos veces salvo por la marca del día en la Sheet,
  que cierra la ventana a segundos. Prod es uno.
- **Cuota.** Los inmediatos leen `Usuarios` (cache 30 s); el diario lee `Tareas`+`Usuarios`+
  `Suscripciones` una vez. Despreciable.
- **Claves VAPID regeneradas.** Una suscripción creada con la clave vieja no recibe nada (400/403,
  no 410: el server no la borra). Mitigación (hallazgo de la verificación final): `activar()`
  compara `sub.options.applicationServerKey` con la clave actual y, si difieren, desuscribe y
  vuelve a suscribir. La re-sincronización al montar no lo hace (no pide permiso ni cambia
  nada); el usuario tiene que tocar «Activar avisos» de nuevo — el badge sigue diciendo
  «activados» hasta entonces. Regenerar claves es excepcional; se acepta.
- **Primer recordatorio hasta 47 h después.** «Trabada» es ≥ 24 h **medido a las 08:00**: una
  tarea enviada a revisión el lunes 09:00 tiene 23 h el martes 08:00 y recién avisa el
  miércoles. Consecuencia directa de la regla elegida; no es bug.
- **Filas viejas sin timestamps** (`asignadaEn` etc. vacíos): caen en `actualizadoEn` o se
  ignoran; en el peor caso una trabada vieja no avisa hasta que alguien la toque.

## Definición de hecho

- Derivación de 72 h eliminada (código, texto, comentarios, tests).
- `web-push` instalado; hoja `Suscripciones` + rutas; `lib/push.ts`; `lib/avisos-tarea.ts`;
  inmediatos en el `PATCH`; `lib/recordatorios.ts` + scheduler + `instrumentation.ts`;
  `getConfigValor`/`setConfigValor`; SW con `push`/`notificationclick`; `useAvisosPush`,
  `AvisosPush` en drawer y sidebar, `BannerAvisos` en `/tareas`.
- `.env.example` con las 4 variables; `Dockerfile` (`ARG`/`ENV NEXT_PUBLIC_VAPID_PUBLIC_KEY`) y
  `ci-cd.yml` (`build-args`); README/docs con el paso de `generate-vapid-keys` y la variable de repo.
- Tests de la tabla; árbol verde. Setup manual documentado en #5.
