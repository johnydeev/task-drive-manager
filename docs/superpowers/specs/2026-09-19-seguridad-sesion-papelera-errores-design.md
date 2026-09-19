# SPEC — Seguridad: revocación de acceso, papelera restringida, errores opacos y 401

**Fecha:** 2026-09-19
**Estado:** Propuesto (rev. 1)
**Autor:** equipo task-drive-manager
**Plan asociado:** [`../plans/2026-09-19-seguridad-sesion-papelera-errores.md`](../plans/2026-09-19-seguridad-sesion-papelera-errores.md)

Cuatro correcciones de seguridad y robustez, independientes entre sí, surgidas de la auditoría del
2026-09-19. Ninguna agrega pantallas ni toca la Sheet. Todas son cambios chicos de server (y uno
de cliente) con tests colocados.

| # | Problema | Corrección |
|---|---|---|
| 1 | Desactivar un usuario no le corta el acceso hasta que vence el JWT (7 días) | Revalidar el usuario contra la hoja `Usuarios` cada 15 min desde el callback `jwt` |
| 2 | `DELETE /api/upload?url=` manda a papelera cualquier archivo de Drive | Solo archivos bajo la raíz de la app **y** no referenciados por ninguna fila |
| 3 | Los `500` devuelven `err.message` crudo (errores de googleapis con rangos, nombres de hoja) | Respuesta opaca `"Error interno"` + `ref` correlacionable con el log |
| 4 | Con la sesión vencida, la PWA muestra "No se pudieron cargar…" en todos lados | Todo `401` redirige a `/login?from=…` desde un único punto del cliente |

---

## Contexto

**Sesión.** NextAuth v5 con estrategia JWT, `maxAge` 7 días. El callback `jwt` de `lib/auth.ts`
lee la hoja `Usuarios` **solo** en el login inicial, con `trigger === "update"` o si el token no
tiene `rol`. `requireSession` (API) y `getActiveSession` (layout, proxy) solo comprueban que haya
email. El campo `session.user.activo` se setea pero nadie lo lee.

**Papelera.** `DELETE /api/upload?url=` existe para limpiar *staging*: archivos ya subidos a Drive
que el usuario descarta **antes** de guardar la fila que los referenciaría. Dos flujos lo llaman,
ambos fire-and-forget: `FileUploader` (preview de tarea, antes de crear o en «Agregar archivos») y
`FotosVisita` + `useVisitaForm` (fotos de visita antes de emitir, y al desmontar sin guardar). El
reemplazo de firma en `UsuariosManager` **no** lo usa: sube la nueva y deja la vieja en Drive. El
handler hace `trashFileByUrl` sin verificar nada más que la sesión. La service account llega a
**toda** la unidad compartida.

**Errores.** `handleApiError` en `lib/api-utils.ts`: `Response` pasa tal cual (así lanza
`requireSession`), `ZodError` → 400, `Error` → `500` con `err.message`, resto → `500 "Error
interno"`. Los `jsonError(4xx, …)` de las rutas no pasan por ahí.

**Cliente.** `lib/api-client.ts` centraliza casi todo con `request()`; el `upload` tiene su propio
`fetch` adentro del mismo archivo. Quedan cuatro `fetch` crudos fuera: `app/(app)/tareas/page.tsx`
(lista + edificios), `components/visitas/FotosVisita.tsx`, `components/visitas/hooks/useVisitaForm.ts`
y `components/usuarios/UsuariosManager.tsx`. `proxy.ts` redirige a login solo en **navegación**;
una llamada a la API con sesión vencida devuelve `401` y cada pantalla lo muestra como error
genérico.

**Todas las URLs de Drive que guarda la app** tienen la forma
`https://drive.google.com/file/d/{fileId}/view` (`uploadFile` en `lib/google-drive.ts`);
`extractFileId` ya las parsea.

## Decisiones

- **Ventana de revalidación: 15 minutos.** Costo: una lectura de `Usuarios` por usuario cada
  15 min, despreciable frente a la cuota (60 lecturas/min de la service account). Aceptado que
  una desactivación tarde hasta 15 min en aplicar.
- **Fail-open ante Sheets caído.** Si la relectura falla, el token sigue válido y se reintenta en
  el próximo request. Es el criterio actual (`catch` → `console.error` → token sin cambios) y
  evita desloguear a todo el equipo por un corte de Google.
- **Revalidar desde `jwt`, no desde `requireSession`.** Verificado en `@auth/core`
  (`lib/actions/session.js` y `lib/actions/callback/index.js`): si `jwt` devuelve `null`, tanto
  en un request común como en el login inicial se limpian las cookies y `auth()` devuelve sesión
  vacía. Con eso `proxy.ts` redirige, `requireSession` da 401 y el layout redirige, sin
  tocar ninguno de los tres. Cambios de rol propagan por el mismo camino.
- **Papelera: ubicación + huérfano.** Se descartó «solo ubicación» (seguía permitiendo papelear
  fotos de tareas ajenas) y «dueño de la tarea» (la tarea todavía no existe cuando se descarta un
  preview). Un archivo ya referenciado por una fila solo se va con el `DELETE` de su tarea o
  visita (admin). Costo: 4 lecturas de Sheet + hasta 8 `files.get` por borrado — camino frío.
- **Referencia de error corta con `nanoid(8)`.** Ya es dependencia; 8 caracteres alcanzan para
  buscar en el log de Docker.
- **Sin clase `ApiError`.** Se revisaron los 16 `throw new Error(...)` de `lib/`: todos son
  internos (fila no encontrada cuando la ruta ya devolvió 404 antes, env faltante, hoja
  inexistente). Ninguno necesita llegar al usuario con su texto. Los chequeos nuevos de la
  papelera devuelven un resultado discriminado y la ruta elige el status.
- **401 → redirect inmediato**, sin modal. Consistente con `proxy.ts`. El formulario a medio
  cargar se pierde, pero con la sesión muerta tampoco se podía guardar.
- **Un `apiFetch` en vez de migrar los `fetch` crudos a `api.*`.** Cambio de una palabra en cada
  llamador; los tests que mockean `global.fetch` siguen valiendo.

---

## #1 — Revocación de acceso

### Módulo puro `lib/auth-revalidacion.ts`

```ts
export const VENTANA_REVALIDACION_MS = 15 * 60 * 1000;

interface TokenRevalidable {
  email?: string;
  rol?: Rol;
  activo?: boolean;
  validadoEn?: number; // epoch ms de la última lectura de Usuarios
}

type BuscarUsuario = (email: string) => Promise<Usuario | null>;

// Devuelve el token (posiblemente actualizado) o null si el usuario ya no puede entrar.
export async function revalidarToken<T extends TokenRevalidable>(
  token: T,
  now: number,
  buscar: BuscarUsuario
): Promise<T | null>;
```

Reglas, en orden:

1. Sin `email` → devuelve el token sin tocar (no hay qué validar; hoy pasa lo mismo).
2. `validadoEn` definido y `now - validadoEn < VENTANA` → devuelve el token sin tocar. **Cero IO.**
3. Llama a `buscar(email)`:
   - lanza → `console.error("[auth] revalidación falló:", err)` y devuelve el token **sin
     modificar `validadoEn`** (fail-open, reintenta en el próximo request);
   - `null` (no está en la hoja) → `null`;
   - `activo === false` → `null`;
   - activo → devuelve `{ ...token, rol, activo: true, validadoEn: now }`.

### Integración en `lib/auth.ts`

El callback `jwt` queda:

```ts
async jwt({ token, user }) {
  const email = (user?.email ?? token.email)?.toLowerCase();
  if (!email) return token;
  // Login inicial: forzar la lectura (validadoEn ausente ⇒ regla 3).
  const base = user ? { ...token, email, validadoEn: undefined } : token;
  return revalidarToken(base, Date.now(), getUsuarioByEmail);
}
```

- El login inicial ya pasó por `signIn` (rechaza inactivos), así que la primera lectura solo
  carga `rol`/`activo`/`validadoEn`.
- El `trigger === "update"` deja de tener tratamiento especial: la ventana lo cubre. Nadie lo usa
  hoy en el cliente.
- `types/next-auth.d.ts`: `JWT` suma `validadoEn?: number`.
- `session` callback sin cambios. `requireSession`, `requireAdmin`, `proxy.ts`, layouts: sin
  cambios.
- Tokens emitidos **antes** del deploy no tienen `validadoEn` → regla 3 → se revalidan en el
  primer request. No hace falta desloguear a nadie.
- DEMO_MODE: `getActiveSession` devuelve `demoSession()` sin pasar por `jwt`. Sin cambios.

### Efecto observable

Admin marca a X como inactivo en `/usuarios`. En el próximo request de X que caiga fuera de la
ventana (a lo sumo 15 min después), la cookie se limpia: si estaba navegando, `proxy.ts` lo manda
a `/login`; si estaba en una llamada de API, recibe `401` (y por #4 el cliente lo lleva a
`/login`). En `/login`, `signIn` sigue rechazándolo con «Tu cuenta no tiene acceso».

---

## #2 — Papelera restringida

### `lib/google-drive.ts` — `estaBajoRaiz`

```ts
// true si fileId desciende de GOOGLE_DRIVE_ROOT_FOLDER_ID (por cadena de parents).
// Lanza si Drive responde 404 (archivo inexistente): la ruta lo traduce.
export async function estaBajoRaiz(fileId: string): Promise<boolean>;
```

- Sube por `files.get({ fileId, fields: "id,parents", supportsAllDrives: true })` hasta
  encontrar la raíz, quedarse sin `parents` o agotar **8 niveles** (la jerarquía real tiene 5:
  raíz / Tareas / Edificio / Objetivo / archivo; Visitas suma la carpeta agrupada).
- Un archivo con varios padres (raro en unidades compartidas) se sigue por el primero.
- DEMO_MODE: devuelve `true` sin llamar a Drive (coherente con `trashFileByUrl`, que no hace nada).

### `lib/archivo-referencias.ts` — puro, sin IO

```ts
export interface ReferenciasArchivos {
  tareas: Tarea[];      // imagenes, videos, documentos (ya mergeados desde TareaArchivos) + reporteUrl
  visitas: Visita[];    // pdfUrl
  usuarios: Usuario[];  // firmaUrl
}

// true si algún registro apunta al mismo fileId (comparación por id, no por string).
export function estaReferenciado(fileId: string, refs: ReferenciasArchivos): boolean;
```

Compara con `extractFileId(url)` de cada URL para no depender del formato exacto (un `?usp=sharing`
pegado a mano en `firma_url` sigue matcheando). URLs sin id se ignoran.

Loader al lado, en el mismo archivo, con IO:

```ts
export async function cargarReferencias(): Promise<ReferenciasArchivos>;
// Promise.all de getTareas(), getVisitas(), getUsuarios().
```

`getTareas()` ya devuelve por tarea los arrays de media (lee `TareaArchivos` adentro) y
`reporteUrl`: no se llama a `getAllArchivos()` aparte, sería leer la misma hoja dos veces. Total:
4 lecturas de Sheet (`Tareas`, `TareaArchivos`, `Visitas`, `Usuarios`).

### Ruta `DELETE /api/upload`

```ts
export async function DELETE(req) {
  try {
    await requireSession();
    const url = req.nextUrl.searchParams.get("url");
    if (!url) return jsonError(400, "Falta url");
    const fileId = extractFileId(url);
    if (!fileId) return jsonError(400, "La url no es un archivo de Drive");

    if (!isDemoMode()) {
      let bajoRaiz: boolean;
      try {
        bajoRaiz = await estaBajoRaiz(fileId);
      } catch (err) {
        if (esNotFoundDeDrive(err)) return jsonError(404, "El archivo no existe");
        throw err;
      }
      if (!bajoRaiz) return jsonError(403, "El archivo no pertenece a la app");
      if (estaReferenciado(fileId, await cargarReferencias())) {
        return jsonError(409, "El archivo está en uso por una tarea, visita o firma");
      }
    }

    await trashFileByUrl(url);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
```

- `esNotFoundDeDrive`: helper local en la ruta. No hay patrón previo en el repo; gaxios (el
  cliente HTTP de googleapis) expone el status como `code` (string, `"404"`) y como
  `response.status` (number). Se aceptan ambos:
  `Number(e?.code) === 404 || e?.response?.status === 404`. Un archivo ya en papelera **sigue
  existiendo** para `files.get`, así que repetir el DELETE es idempotente (lo marca `trashed` de
  nuevo, sin error).
- El orden importa: primero ubicación (barato, 1–5 llamadas), después referencias (4 lecturas de
  Sheet). Un intento contra un archivo externo no gasta cuota de Sheets.
- Se mantiene `try/catch` + `handleApiError` manual (la ruta está fuera del matcher del proxy y
  su `POST` ya usa ese patrón; homogeneizar con `withAuth` queda fuera de alcance).

### Llamadores

Sin cambios funcionales. Los dos son fire-and-forget: un `403`/`409` se ignora como hoy se
ignora cualquier fallo. El único caso que ahora falla es el que se quiere impedir. Las firmas
viejas siguen quedando en Drive al reemplazarlas (comportamiento actual, fuera de alcance).

---

## #3 — Errores 500 opacos con referencia

### `lib/api-utils.ts`

```ts
export function handleApiError(err: unknown): Response {
  if (err instanceof Response) return err;
  if (err instanceof ZodError) return jsonError(400, "Datos inválidos", err.flatten());
  const ref = nanoid(8);
  console.error(`[api] error ref=${ref}:`, err);
  return NextResponse.json({ error: "Error interno", ref }, { status: 500 });
}
```

- Desaparece la rama `err instanceof Error → err.message`. `Error` y no-`Error` van juntos.
- Formato de respuesta: `{ error: "Error interno", ref: "k3x9abcd" }`. `error` sigue siendo el
  string que exige la convención del repo; `ref` es un campo adicional solo en 500.
- `withAuth` no cambia (ya delega en `handleApiError`).
- Los `jsonError(4xx, …)` de las rutas no se tocan: los mensajes de negocio («Solo el admin puede
  asignar», «La tarea no está En Revisión», límites de peso) siguen llegando enteros.

### `lib/api-client.ts`

`request()` y el `fetch` de `upload`: si el body trae `ref`, el mensaje del `Error` queda
`"Error interno (ref k3x9abcd)"`. La UI ya muestra `error.message` donde corresponde
(`submitError`, `transicionar.error?.message`, etc.), así que el ref aparece sin tocar componentes.

### Cómo se usa

El encargado manda captura con «Error interno (ref k3x9abcd)»; en el server:
`docker compose logs web | grep ref=k3x9abcd` muestra el stack completo.

---

## #4 — 401 → login

### `lib/api-client.ts` — `apiFetch`

```ts
// fetch + manejo central de sesión vencida. Todo request a /api/* del cliente pasa por acá.
export async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, init);
  if (res.status === 401) redirigirALogin();
  return res;
}

function redirigirALogin() {
  if (typeof window === "undefined") return;
  if (window.location.pathname.startsWith("/login")) return;
  const from = window.location.pathname + window.location.search;
  window.location.assign(`/login?from=${encodeURIComponent(from)}`);
}
```

- `apiFetch` **devuelve la respuesta igual** después de disparar el redirect: el llamador sigue su
  camino normal (`!res.ok` → lanza), así el código existente no cambia y la promesa no queda
  colgada mientras el navegador navega.
- `request()` y el `fetch` interno de `upload` pasan a usar `apiFetch`.
- Los cuatro `fetch` crudos (`app/(app)/tareas/page.tsx` ×2, `FotosVisita.tsx`,
  `useVisitaForm.ts`, `UsuariosManager.tsx`) se reemplazan por `apiFetch`. Solo cambia el
  identificador; firmas y bodies iguales.
- El Service Worker (`app/sw.ts`) no tiene `window`: sigue contando el `401` como reintento. El
  sync in-page (`lib/offline-sync.ts`) usa `api.tareas.create` → si hay 401 redirige; correcto,
  la sesión está muerta.
- `useCachedQuery`: el `fetcher` lanza después del redirect, cae al cache offline si lo hay; sin
  efecto visible porque la página ya está navegando.
- `/login` no consume la API, pero el guard evita loops si algún día lo hace.

---

## Tests

Colocados, con Vitest, siguiendo `docs/CONTRIBUTING-tests.md`.

| Archivo | Casos |
|---|---|
| `lib/auth-revalidacion.test.ts` | sin email → igual, sin IO · dentro de ventana → igual, sin IO · fuera de ventana + activo → actualiza `rol`/`validadoEn` · rol cambiado → nuevo rol · inactivo → `null` · no existe → `null` · `buscar` lanza → token igual, `validadoEn` no se toca · `validadoEn` ausente → lee |
| `lib/archivo-referencias.test.ts` | referenciado en cada campo (imagen, video, documento, `reporteUrl`, `pdfUrl`, `firmaUrl`) → `true` · id distinto → `false` · URL con `?usp=sharing` → matchea · URL sin id se ignora · refs vacías → `false` |
| `lib/google-drive.test.ts` (extender) | `estaBajoRaiz`: hijo directo · nieto · sin parents → `false` · más de 8 niveles → `false` · 404 propaga · demo → `true` sin llamar |
| `tests/api/upload-delete.test.ts` (nuevo) | sin url → 400 · url no-Drive → 400 · 404 de Drive → 404 · fuera de raíz → 403 y **no** llama a `trash` · referenciado → 409 y no llama · huérfano bajo raíz → 200 y llama · demo → 200 sin chequeos |
| `lib/api-utils.test.ts` (nuevo) | `Error("rango X")` → 500, body `error === "Error interno"`, `ref` de 8 chars, mensaje **no** aparece en el body · `Response` pasa · `ZodError` → 400 |
| `lib/api-client.test.ts` (nuevo) | 401 → `location.assign` con `/login?from=<ruta>` y lanza · 401 en `/login` → no redirige · 500 con `ref` → mensaje `"Error interno (ref …)"` · 200 → sin redirect |

Notas para la implementación:

- Los tests existentes que afirman `500` (`lib/http/withAuth.test.ts`, `tests/api/visitas.test.ts`)
  solo miran el status: no se rompen. Verificado.
- **Trampa de mocks:** `tests/api/upload-visita.test.ts`, `upload-pdf.test.ts` y
  `upload-body-incompleto.test.ts` mockean `@/lib/google-drive` con una factory cerrada
  (`uploadTareaFile`, `trashFileByUrl`). La ruta pasa a importar también `extractFileId` y
  `estaBajoRaiz`; esas factories deben sumarlos (como `vi.fn()`) aunque sus casos solo ejerciten
  el `POST`, para que vitest no falle por export ausente en el mock.
- `lib/api-client.test.ts` corre en jsdom, donde `location.assign` no navega (loguea «Not
  implemented: navigation»). Reemplazar `window.location` por un stub `{ assign: vi.fn(),
  pathname, search }` con `Object.defineProperty` en cada caso.

## Criterios de aceptación

1. Usuario marcado inactivo: en ≤ 15 min su próxima navegación lo manda a `/login` y su próxima
   llamada a la API responde `401`. Usuario reactivado: vuelve a entrar con login normal.
2. Cambio de rol admin → supervisor: en ≤ 15 min la sesión refleja `supervisor` sin relogueo.
3. `DELETE /api/upload?url=<archivo fuera de la raíz>` → `403`, archivo intacto.
4. `DELETE /api/upload?url=<foto de una tarea guardada>` → `409`, archivo intacto.
5. Descartar un preview antes de crear la tarea, quitar una foto de visita antes de emitirla y
   desmontar el formulario de visita sin guardar siguen mandando el archivo a papelera (200).
6. Cualquier excepción no prevista en una ruta responde `{ error: "Error interno", ref }`; el
   mismo `ref` aparece en el log del server con el stack. El body nunca contiene `err.message`.
7. Con la cookie de sesión borrada, cualquier acción de la PWA (cargar lista, guardar, subir)
   termina en `/login?from=<ruta>`; al loguearse vuelve a esa ruta.
8. Verde: `npm test` + `npx tsc --noEmit` + `npm run lint` + `npm run build`.

## Riesgos

- **Ventana de 15 min en la cuota.** Con N usuarios activos son N lecturas de `Usuarios` cada
  15 min. Con el equipo actual (< 10) es irrelevante.
- **Ráfaga en el borde de la ventana.** Proxy + layout + primera API del mismo page-load pueden
  caer los tres fuera de ventana y leer `Usuarios` tres veces antes de que la cookie nueva
  vuelva. Tres lecturas cada 15 min por usuario: aceptado, no se mitiga.
- **`files.get` por nivel.** Hasta 8 llamadas a Drive por borrado. Es un camino frío (descartar
  un preview) y la cuota de Drive es órdenes de magnitud más alta que la de Sheets.
- **Referencias stale.** `cargarReferencias` lee la Sheet en el momento; una fila escrita en el
  mismo instante por otro usuario podría no verse. La ventana es de milisegundos y el peor caso
  es papelear un archivo recién guardado, recuperable desde papelera.
- **Redirect en medio de una subida.** Un `401` durante `upload` navega a login y el archivo ya
  subido a Drive queda huérfano (sin fila). Igual que hoy cuando falla la creación; no se
  mitiga.

## Definición de hecho

- Los cuatro cambios en `main`, con los tests de la tabla y el árbol verde.
- `types/next-auth.d.ts` con `validadoEn`.
- Comentario del `SessionProvider` («en producción es null») corregido de paso: el layout raíz
  siempre inyecta la sesión.
- Sin cambios en la Sheet, `.env` ni deploy: no hay setup manual.
