# Notificaciones push y fin del cierre automático — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el spec [`../specs/2026-09-20-notificaciones-push-y-fin-cierre-automatico-design.md`](../specs/2026-09-20-notificaciones-push-y-fin-cierre-automatico-design.md): eliminar el cierre automático a 72 h; Web Push inmediato (asignar / revisar / objetar) y recordatorios diarios (lunes a sábado 08:00 ART, desde 24 h, agrupados) disparados desde el propio server; UI para activar/desactivar avisos.

**Architecture:** Server: `lib/sheets/suscripciones.ts` (hoja nueva), `lib/push.ts` (`web-push`, nunca lanza), `lib/avisos-tarea.ts` (puro: arma el aviso por acción), `lib/recordatorios.ts` (puro: agrupa por destinatario), `lib/recordatorios-scheduler.ts` (tick cada 15 min + marca del día en `Configuracion`), `instrumentation.ts` (arranca el scheduler solo en prod). Rutas: `POST/DELETE /api/push/suscribir`; el `PATCH` de tareas notifica con `after()`. Cliente: SW con `push`/`notificationclick`, `hooks/useAvisosPush.ts`, `AvisosPush` en drawer y sidebar, `BannerAvisos` en `/tareas`.

**Tech Stack:** `web-push` + `@types/web-push`, Next 16 (`after`, `instrumentation.ts`), serwist, Push API, Vitest.

**Reglas del repo:** nunca `git commit` (checkpoints). Tests colocados salvo rutas. Verificación final: `npm test` + `npx tsc --noEmit` + `npm run lint` + `npm run build`.

---

## Mapa de archivos

| Archivo | Acción |
|---|---|
| `lib/tareas-estado.ts` + test | **borrar** |
| `lib/sheets/tareas.ts`, `components/tareas/AccionesTarea.tsx` (+test), `lib/pendientes-por-edificio.ts`, `app/api/tareas/[id]/route.ts`, `tests/lib/google-sheets-crud.test.ts` | quitar derivación / texto / comentarios |
| `package.json` | `web-push`, `@types/web-push` |
| `types/index.ts` | `Suscripcion`, `Aviso` |
| `lib/sheets/core.ts` | `SHEETS.suscripciones` |
| `lib/sheets/suscripciones.ts` + test | crear |
| `lib/sheets/config.ts` + `tests/lib/google-sheets-crud.test.ts` | `getConfigValor` / `setConfigValor` |
| `lib/google-sheets.ts` | re-exports |
| `lib/push.ts` + test | crear |
| `lib/avisos-tarea.ts` + test | crear |
| `app/api/tareas/[id]/route.ts` + `tests/api/tareas-transiciones.test.ts` | inmediatos con `after()` |
| `app/api/push/suscribir/route.ts` + `tests/api/push-suscribir.test.ts` | crear |
| `lib/recordatorios.ts` + test, `lib/recordatorios-scheduler.ts` + test, `instrumentation.ts` | crear |
| `app/sw.ts` | `push` + `notificationclick` |
| `hooks/useAvisosPush.ts` + test, `components/layout/AvisosPush.tsx` + test, `components/tareas/BannerAvisos.tsx` + test | crear |
| `components/layout/AppShell.tsx`, `MobileDrawer.tsx`, `app/(app)/tareas/page.tsx` | montar |
| `.env.example`, `Dockerfile`, `.github/workflows/ci-cd.yml`, `README.md` / `docs/DEPLOY.md` | env + build-arg + doc |

---

### Task 1: Fin del cierre automático

- [ ] Borrar `lib/tareas-estado.ts` y `lib/tareas-estado.test.ts`.
- [ ] `lib/sheets/tareas.ts`: quitar el import de `estadoEfectivoTarea` y en `getTareas` la línea `estado: estadoEfectivoTarea(t), // cierre derivado…` (queda `...t, ...mediaFromArchivos(...)`). `getTareaPersistida`: reemplazar el comentario por «Ya no hay estado derivado: es lo mismo que `getTareaByRowId`. Se conserva el nombre porque la ruta de transiciones y sus tests lo usan.» y hacer `return getTareaByRowId(rowId)`.
- [ ] `components/tareas/AccionesTarea.tsx`: borrar `venceISO` y `{venceISO && <p …>Cierre automático…</p>}`; quitar `formatDateTime` del import si queda sin uso.
- [ ] `lib/pendientes-por-edificio.ts:11` y `app/api/tareas/[id]/route.ts` (docstring del GET): quitar la mención de 72 h.
- [ ] `tests/lib/google-sheets-crud.test.ts`: reemplazar el `describe("getTareas — estado derivado a 72h")` por un caso «una tarea En Revisión con revision_en viejo se lee En Revisión (no hay cierre automático)».
- [ ] `components/tareas/AccionesTarea.test.tsx`: en el describe de «En Revisión» sumar `expect(screen.queryByText(/cierre automático/i)).not.toBeInTheDocument()`.
- [ ] `grep -rn "estadoEfectivoTarea\|72 h\|72h" lib components app --include=*.ts --include=*.tsx | grep -v directivas` → sin salida salvo directivas. Correr `npx vitest run lib/sheets tests/lib components/tareas` → PASS. **Checkpoint.**

---

### Task 2: Suscripciones (tipo, hoja, config helpers, rutas)

- [ ] `npm i web-push && npm i -D @types/web-push`.
- [ ] `types/index.ts` (al final):

```ts
// =====================================================
// Notificaciones push
// =====================================================

// Una suscripción Web Push = un dispositivo de un usuario. Hoja `Suscripciones`.
export interface Suscripcion {
  id: string;
  email: string; // minúsculas
  endpoint: string; // único por suscripción
  p256dh: string;
  auth: string;
  userAgent: string;
  creadoEn: string;
}

// Lo que viaja en el payload del push y muestra el Service Worker.
export interface Aviso {
  titulo: string;
  cuerpo: string;
  url: string; // ruta dentro de la app; el SW la abre al tocar
  tag?: string; // agrupa/reemplaza en el sistema
}
```

- [ ] `lib/sheets/core.ts`: `suscripciones: "Suscripciones",` en `SHEETS`.
- [ ] `lib/sheets/suscripciones.ts`:

```ts
import { nanoid } from "nanoid";
import { isDemoMode } from "../demo-mode";
import { nowBuenosAiresISO } from "../fecha-ar";
import { conLockDeHoja, deleteRows, readRange, SHEETS, writeRange } from "./core";
import { buildHeaderMap } from "./headers";
import type { Suscripcion } from "@/types";

// Hoja de suscripciones push: id · email · endpoint · p256dh · auth · user_agent · creado_en.
const RANGE = `${SHEETS.suscripciones}!A:G`;
const COLUMNAS = ["id", "email", "endpoint", "p256dh", "auth", "user_agent", "creado_en"];

function parse(rows: string[][]): { items: Suscripcion[]; rowNumbers: Map<string, number> } {
  const items: Suscripcion[] = [];
  const rowNumbers = new Map<string, number>();
  if (rows.length === 0) return { items, rowNumbers };
  const h = buildHeaderMap(rows[0] ?? []);
  rows.slice(1).forEach((r, i) => {
    const endpoint = h.get(r, "endpoint").trim();
    if (!endpoint) return;
    items.push({
      id: h.get(r, "id"),
      email: h.get(r, "email").trim().toLowerCase(),
      endpoint,
      p256dh: h.get(r, "p256dh"),
      auth: h.get(r, "auth"),
      userAgent: h.get(r, "user_agent"),
      creadoEn: h.get(r, "creado_en"),
    });
    rowNumbers.set(endpoint, i + 2);
  });
  return { items, rowNumbers };
}

function toRow(s: Suscripcion): string[] {
  return [s.id, s.email, s.endpoint, s.p256dh, s.auth, s.userAgent, s.creadoEn];
}

// Todas, o solo las de esos emails (minúsculas).
export async function getSuscripciones(emails?: string[]): Promise<Suscripcion[]> {
  if (isDemoMode()) return [];
  const { items } = parse(await readRange(RANGE));
  if (!emails) return items;
  const set = new Set(emails.map((e) => e.toLowerCase()));
  return items.filter((s) => set.has(s.email));
}

export type SuscripcionInput = Pick<Suscripcion, "email" | "endpoint" | "p256dh" | "auth" | "userAgent">;

// Por endpoint: igual → no escribe (la UI re-sincroniza en cada carga); distinta → actualiza
// esa fila; nueva → agrega. Bajo lock: el "fila libre" no puede pisarse con otro alta.
export async function upsertSuscripcion(input: SuscripcionInput): Promise<"sin-cambios" | "actualizada" | "creada"> {
  if (isDemoMode()) return "sin-cambios";
  return conLockDeHoja(SHEETS.suscripciones, async () => {
    const rows = await readRange(RANGE);
    const { items, rowNumbers } = parse(rows);
    const email = input.email.toLowerCase();
    const existente = items.find((s) => s.endpoint === input.endpoint);
    if (existente) {
      const igual =
        existente.email === email && existente.p256dh === input.p256dh && existente.auth === input.auth;
      if (igual) return "sin-cambios";
      const fila = rowNumbers.get(input.endpoint)!;
      await writeRange(`${SHEETS.suscripciones}!A${fila}:G${fila}`, [
        toRow({ ...existente, email, p256dh: input.p256dh, auth: input.auth, userAgent: input.userAgent }),
      ]);
      return "actualizada";
    }
    const nueva: Suscripcion = { id: nanoid(10), ...input, email, creadoEn: nowBuenosAiresISO() };
    const nextRow = rows.length + 1;
    await writeRange(`${SHEETS.suscripciones}!A${nextRow}:G${nextRow}`, [toRow(nueva)]);
    return "creada";
  });
}

export async function deleteSuscripcion(endpoint: string): Promise<void> {
  if (isDemoMode()) return;
  const { rowNumbers } = parse(await readRange(RANGE));
  const fila = rowNumbers.get(endpoint);
  if (fila) await deleteRows(SHEETS.suscripciones, [fila]);
}

export { COLUMNAS as SUSCRIPCIONES_COLUMNAS };
```

- [ ] `lib/sheets/suscripciones.test.ts` (mock `googleapis` como `partes-comunes.test.ts`): `getSuscripciones(["A@X.com"])` filtra en minúsculas · `upsert` nuevo → `update` en la fila libre · existente igual → **no** llama a `update` · existente con otro `auth` → `update` en su fila · `delete` → `batchUpdate` con la fila.
- [ ] `lib/sheets/config.ts` — helpers de clave suelta:

```ts
// Claves sueltas de Configuracion que no forman parte del formulario del admin (ej. la marca
// del último envío de recordatorios). Buscan la fila por clave; si no existe, la agregan al
// final. NO pasan por updateConfiguracion, que reescribe solo las 11 claves fijas.
export async function getConfigValor(clave: string): Promise<string | undefined> {
  if (isDemoMode()) return undefined;
  const rows = await readRange(`${SHEETS.configuracion}!A:B`);
  const fila = rows.find((r) => (r[0] ?? "").trim() === clave);
  return fila ? (fila[1] ?? "").toString().trim() : undefined;
}

export async function setConfigValor(clave: string, valor: string): Promise<void> {
  if (isDemoMode()) return;
  const rows = await readRange(`${SHEETS.configuracion}!A:B`);
  const idx = rows.findIndex((r) => (r[0] ?? "").trim() === clave);
  const fila = idx === -1 ? rows.length + 1 : idx + 1;
  await writeRange(`${SHEETS.configuracion}!A${fila}:B${fila}`, [[clave, valor]]);
}
```

  Tests en `google-sheets-crud.test.ts`: `getConfigValor` de clave existente/inexistente · `setConfigValor` existente escribe en su fila · inexistente escribe en `rows.length + 1`.
- [ ] `lib/google-sheets.ts`: re-exportar `getSuscripciones, upsertSuscripcion, deleteSuscripcion` y `getConfigValor, setConfigValor`.
- [ ] `lib/schemas.ts`: `export const suscripcionPushSchema = z.object({ endpoint: z.string().url(), keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }), userAgent: z.string().max(120).optional() });`
- [ ] `app/api/push/suscribir/route.ts`:

```ts
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/http/withAuth";
import { jsonError } from "@/lib/api-utils";
import { suscripcionPushSchema } from "@/lib/schemas";
import { deleteSuscripcion, getSuscripciones, upsertSuscripcion } from "@/lib/google-sheets";

export const runtime = "nodejs";

// Guarda la suscripción push de ESTE dispositivo para el usuario de la sesión.
export const POST = withAuth(async (req, session) => {
  const parsed = suscripcionPushSchema.parse(await req.json());
  const resultado = await upsertSuscripcion({
    email: session.user.email,
    endpoint: parsed.endpoint,
    p256dh: parsed.keys.p256dh,
    auth: parsed.keys.auth,
    userAgent: parsed.userAgent ?? "",
  });
  return NextResponse.json({ ok: true, resultado }, { status: resultado === "creada" ? 201 : 200 });
});

// Borra una suscripción: la propia, o cualquiera si es admin.
export const DELETE = withAuth(async (req, session) => {
  const endpoint = req.nextUrl.searchParams.get("endpoint");
  if (!endpoint) return jsonError(400, "Falta endpoint");
  const propia = (await getSuscripciones()).find((s) => s.endpoint === endpoint);
  if (!propia) return NextResponse.json({ ok: true });
  if (propia.email !== session.user.email.toLowerCase() && session.user.rol !== "admin") {
    return jsonError(403, "Esa suscripción no es tuya");
  }
  await deleteSuscripcion(endpoint);
  return NextResponse.json({ ok: true });
});
```

- [ ] `tests/api/push-suscribir.test.ts`: POST válido → 201 y `upsertSuscripcion` con el email de sesión · body inválido → 400 · DELETE propio → 200 y `deleteSuscripcion` · ajeno supervisor → 403 · ajeno admin → 200 · inexistente → 200 sin borrar.
- [ ] Correr; `npx tsc --noEmit`. **Checkpoint.**

---

### Task 3: `lib/push.ts` y `lib/avisos-tarea.ts`

- [ ] `lib/push.ts`:

```ts
import webpush from "web-push";
import { isDemoMode } from "./demo-mode";
import { deleteSuscripcion, getSuscripciones } from "./sheets/suscripciones";
import type { Aviso } from "@/types";

let configurado: boolean | null = null;

// true si hay claves VAPID. Sin ellas el push queda deshabilitado (log) y nada explota.
function asegurarVapid(): boolean {
  if (configurado !== null) return configurado;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!pub || !priv || !subject) {
    console.warn("[push] deshabilitado: faltan VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT");
    configurado = false;
    return false;
  }
  webpush.setVapidDetails(subject, pub, priv);
  configurado = true;
  return true;
}

// Solo para tests.
export function _resetPush() {
  configurado = null;
}

export interface ResultadoPush {
  enviados: number;
  borradas: number;
}

// Manda el aviso a todas las suscripciones de esos emails. Nunca lanza: un push fallido no
// rompe la acción que lo disparó. Suscripciones muertas (410/404) se borran.
export async function notificar(emails: string[], aviso: Aviso): Promise<ResultadoPush> {
  const nada: ResultadoPush = { enviados: 0, borradas: 0 };
  const destinatarios = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (destinatarios.length === 0 || isDemoMode() || !asegurarVapid()) return nada;
  try {
    const subs = await getSuscripciones(destinatarios);
    const payload = JSON.stringify(aviso);
    const r = { ...nada };
    for (const s of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: 24 * 3600 }
        );
        r.enviados++;
      } catch (err) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 410 || status === 404) {
          await deleteSuscripcion(s.endpoint).catch(() => {});
          r.borradas++;
        } else {
          console.error("[push] error enviando a", s.email, err);
        }
      }
    }
    return r;
  } catch (err) {
    console.error("[push] error:", err);
    return nada;
  }
}
```

- [ ] `lib/push.test.ts` (mock `web-push` con `setVapidDetails`/`sendNotification`, mock `./sheets/suscripciones`, `vi.stubEnv` para las claves, `_resetPush()` en `beforeEach`): sin claves → no llama y devuelve ceros · envía a cada suscripción de los emails (normaliza y dedup) · 410 → `deleteSuscripcion` de esa y sigue con las demás (`enviados: 1, borradas: 1`) · error genérico → loguea, no lanza · emails vacíos → nada sin leer.
- [ ] `lib/avisos-tarea.ts` (puro):

```ts
import type { Aviso, Tarea } from "@/types";

export type AccionAvisada = "asignar" | "revisar" | "objetar";

function donde(t: Tarea): string {
  return [t.edificio, t.dpto].filter((x) => x && x.trim()).join(" · ");
}

function recortar(s: string, max: number): string {
  const limpio = s.trim().replace(/\s+/g, " ");
  return limpio.length > max ? `${limpio.slice(0, max - 1)}…` : limpio;
}

// Arma el aviso push de una acción del ciclo de vida. Puro: no decide destinatarios.
export function avisoDeTarea(accion: AccionAvisada, t: Tarea, opts: { asignadoNombre?: string } = {}): Aviso {
  const url = `/tareas/${encodeURIComponent(t.rowId)}`;
  const objetivo = t.objetivo || "(sin objetivo)";
  switch (accion) {
    case "asignar":
      return { titulo: "Te asignaron una tarea", cuerpo: recortar(`${objetivo} · ${donde(t)}`, 160), url };
    case "revisar": {
      const quien = opts.asignadoNombre ? ` — ${opts.asignadoNombre}` : "";
      return { titulo: "Tarea lista para revisar", cuerpo: recortar(`${objetivo} · ${donde(t)}${quien}`, 160), url };
    }
    case "objetar":
      return { titulo: "Tu tarea fue objetada", cuerpo: recortar(`${objetivo}: ${t.notaObjecion ?? ""}`, 120), url };
  }
}
```

- [ ] `lib/avisos-tarea.test.ts`: los 3 títulos/urls · `donde` sin dpto no deja « · » colgado · objeción recortada a 120 con «…» · revisar con nombre del asignado.
- [ ] Correr. **Checkpoint.**

---

### Task 4: Inmediatos en `PATCH /api/tareas/[id]`

- [ ] En `route.ts`: imports `import { notificar } from "@/lib/push";`, `import { avisoDeTarea } from "@/lib/avisos-tarea";`, `import { displayName } from "@/lib/user-display";` (existe; verificar firma `displayName(email, usuarios?)`).
  - **asignar**: después de `const actualizada = await updateTarea({...})`, `after(() => notificar([asignadoA].filter((e) => e !== email), avisoDeTarea("asignar", actualizada)))`; devolver `actualizada`.
  - **revisar**: `const actualizada = await updateTarea(...)`; `after(async () => { const usuarios = await getUsuarios(); const admins = usuarios.filter((u) => u.rol === "admin" && u.activo && u.email.toLowerCase() !== email).map((u) => u.email); await notificar(admins, avisoDeTarea("revisar", actualizada, { asignadoNombre: displayName(email, usuarios) })); })`.
  - **objetar**: `after(() => notificar([t.asignadoA ?? ""].filter((e) => e && e.toLowerCase() !== email), avisoDeTarea("objetar", actualizada)))`.
- [ ] `tests/api/tareas-transiciones.test.ts`: `vi.mock("@/lib/push", () => ({ notificar: vi.fn().mockResolvedValue({ enviados: 0, borradas: 0 }) }))`; casos: asignar → `notificar(["op@x.com"], expect.objectContaining({ titulo: "Te asignaron una tarea" }))` · admin se asigna a sí mismo → `notificar([], …)` (o no llamado; aceptar ambas: afirmar que ningún call tiene su email) · revisar → destinatarios = admins activos sin el actor · objetar → `[asignado]` · aceptar y cerrar → `notificar` no llamado. Recordar que `after` está mockeado como `void fn()`: los asserts van tras un `await new Promise(r => setTimeout(r, 0))`.
- [ ] Correr `npx vitest run tests/api/tareas-transiciones.test.ts`. **Checkpoint.**

---

### Task 5: Recordatorios (puro) + scheduler + `instrumentation.ts`

- [ ] `lib/recordatorios.ts`:

```ts
import type { Aviso, EstadoTarea, Tarea, Usuario } from "@/types";

export const UMBRAL_TRABADA_MS = 24 * 60 * 60 * 1000;

// Timestamp del estado actual; sin él, actualizadoEn; sin ninguno, undefined (se ignora).
function desdeCuando(t: Tarea): number | undefined {
  const porEstado: Partial<Record<EstadoTarea, string | undefined>> = {
    Asignada: t.asignadaEn,
    Aceptada: t.aceptadaEn,
    Objetada: t.objetadaEn,
    "En Revisión": t.revisionEn,
  };
  const iso = porEstado[t.estado] || t.actualizadoEn;
  if (!iso) return undefined;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? undefined : ms;
}

function trabada(t: Tarea, now: number): boolean {
  const desde = desdeCuando(t);
  return desde !== undefined && now - desde >= UMBRAL_TRABADA_MS;
}

const MOTIVO: Record<string, string> = { Asignada: "sin aceptar", Aceptada: "sin empezar", Objetada: "objetada" };

function lugar(t: Tarea): string {
  return [t.objetivo || "(sin objetivo)", t.edificio].filter(Boolean).join(" · ");
}

export interface Recordatorio {
  email: string;
  aviso: Aviso;
}

// Un aviso por destinatario: a cada admin activo por las En Revisión trabadas; a cada asignado
// activo por sus Asignada/Aceptada/Objetada trabadas. Puro.
export function armarRecordatorios(tareas: Tarea[], usuarios: Usuario[], now: number): Recordatorio[] {
  const activos = usuarios.filter((u) => u.activo);
  const admins = activos.filter((u) => u.rol === "admin");
  const activosPorEmail = new Map(activos.map((u) => [u.email.toLowerCase(), u]));
  const out: Recordatorio[] = [];

  const enRevision = tareas.filter((t) => t.estado === "En Revisión" && trabada(t, now));
  if (enRevision.length > 0) {
    const n = enRevision.length;
    const cuerpo = n === 1 ? `${lugar(enRevision[0])} espera tu revisión` : `${n} tareas en revisión hace más de un día`;
    const aviso: Aviso = {
      titulo: "Tareas esperando tu revisión",
      cuerpo,
      url: `/tareas?${new URLSearchParams({ estado: "En Revisión", orden: "antiguas" })}`,
      tag: "recordatorio-revision",
    };
    for (const a of admins) out.push({ email: a.email.toLowerCase(), aviso });
  }

  const porAsignado = new Map<string, Tarea[]>();
  for (const t of tareas) {
    if (!(t.estado in MOTIVO) || !trabada(t, now)) continue;
    const email = (t.asignadoA ?? "").toLowerCase();
    if (!email || !activosPorEmail.has(email)) continue;
    porAsignado.set(email, [...(porAsignado.get(email) ?? []), t]);
  }
  for (const [email, mias] of porAsignado) {
    const n = mias.length;
    const cuerpo = n === 1 ? `${lugar(mias[0])}: ${MOTIVO[mias[0].estado]}` : `${n} tareas esperan tu acción`;
    out.push({
      email,
      aviso: {
        titulo: "Tenés tareas sin avanzar",
        cuerpo,
        url: `/tareas?${new URLSearchParams({ mias: "1", orden: "antiguas" })}`,
        tag: "recordatorio-mias",
      },
    });
  }
  return out;
}
```

- [ ] `lib/recordatorios.test.ts`: los 9 casos del spec.
- [ ] `lib/recordatorios-scheduler.ts`:

```ts
import { getTareas } from "./sheets/tareas";
import { getUsuarios } from "./sheets/usuarios";
import { getConfigValor, setConfigValor } from "./sheets/config";
import { notificar } from "./push";
import { armarRecordatorios } from "./recordatorios";
import { toBuenosAiresISO } from "./fecha-ar";
import { isDemoMode } from "./demo-mode";

export const CLAVE_ULTIMO_ENVIO = "recordatorios_ultimo_envio";
const HORA_ENVIO_ART = 8;
const TICK_MS = 15 * 60 * 1000;

// Fecha/hora de pared en Buenos Aires (UTC-3 fija, como lib/fecha-ar).
function ahoraART(now: number): { fecha: string; hora: number; domingo: boolean } {
  const iso = toBuenosAiresISO(new Date(now)); // YYYY-MM-DDTHH:mm:ss.sss-03:00
  const fecha = iso.slice(0, 10);
  const hora = Number(iso.slice(11, 13));
  const domingo = new Date(now - 3 * 3600 * 1000).getUTCDay() === 0;
  return { fecha, hora, domingo };
}

// Manda los recordatorios del día si es lunes–sábado, ya son las 08:00 ART y no se mandaron
// hoy. La marca del día se guarda al FINAL: si el envío explota a mitad, el próximo tick reintenta.
export async function correrRecordatoriosSiCorresponde(now = Date.now()): Promise<"enviado" | "omitido"> {
  const { fecha, hora, domingo } = ahoraART(now);
  if (domingo || hora < HORA_ENVIO_ART) return "omitido";
  if ((await getConfigValor(CLAVE_ULTIMO_ENVIO)) === fecha) return "omitido";
  const [tareas, usuarios] = await Promise.all([getTareas(), getUsuarios()]);
  const recordatorios = armarRecordatorios(tareas, usuarios, now);
  for (const r of recordatorios) await notificar([r.email], r.aviso);
  await setConfigValor(CLAVE_ULTIMO_ENVIO, fecha);
  console.log(`[recordatorios] ${fecha}: ${recordatorios.length} aviso(s)`);
  return "enviado";
}

declare global {
  // eslint-disable-next-line no-var
  var __recordatoriosIniciado: boolean | undefined;
}

// Arranca el tick. Solo en producción (o RECORDATORIOS_ENABLED=1): en dev el .env.local tiene
// credenciales reales y un `next dev` abierto a las 08:00 mandaría pushes de verdad.
export function iniciarSchedulerRecordatorios(): boolean {
  const habilitado = process.env.NODE_ENV === "production" || process.env.RECORDATORIOS_ENABLED === "1";
  if (!habilitado || isDemoMode() || globalThis.__recordatoriosIniciado) return false;
  globalThis.__recordatoriosIniciado = true;
  const correr = () => correrRecordatoriosSiCorresponde().catch((err) => console.error("[recordatorios] error:", err));
  setTimeout(correr, 60 * 1000); // por si el contenedor arrancó después de las 08:00
  setInterval(correr, TICK_MS);
  return true;
}

// Solo para tests.
export function _resetScheduler() {
  globalThis.__recordatoriosIniciado = undefined;
}
```

- [ ] `lib/recordatorios-scheduler.test.ts` (mocks de `./sheets/tareas`, `./sheets/usuarios`, `./sheets/config`, `./push`, `./demo-mode`; fake timers para `iniciar…`): domingo → omitido sin leer · 07:59 ART → omitido · lunes 08:00 sin envío → envía y guarda · ya enviado hoy → omitido · `notificar` lanza → no guarda · `iniciar` dos veces → 1 interval · sin `NODE_ENV=production`/`RECORDATORIOS_ENABLED` → `false`. Para las fechas usar instantes UTC concretos (ej. lunes 2026-09-21 11:00Z = 08:00 ART).
- [ ] `instrumentation.ts` (raíz):

```ts
// Corre una vez al iniciar el server. Arranca el scheduler de recordatorios push (solo Node,
// solo producción). No se await-ea nada: register debe terminar antes de servir requests.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { iniciarSchedulerRecordatorios } = await import("./lib/recordatorios-scheduler");
  iniciarSchedulerRecordatorios();
}
```

- [ ] Correr. **Checkpoint.**

---

### Task 6: Service Worker + hook + UI

- [ ] `app/sw.ts` (después del `message` listener):

```ts
// =====================================================
// Web Push — muestra el aviso y, al tocarlo, abre/enfoca la app en la URL del aviso.
// =====================================================
interface AvisoPush { titulo: string; cuerpo: string; url: string; tag?: string }

self.addEventListener("push", (event: PushEvent) => {
  let aviso: AvisoPush;
  try {
    aviso = event.data?.json() as AvisoPush;
  } catch {
    return;
  }
  if (!aviso?.titulo) return;
  event.waitUntil(
    self.registration.showNotification(aviso.titulo, {
      body: aviso.cuerpo,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: aviso.tag,
      data: { url: aviso.url },
    })
  );
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? "/tareas";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clientes) => {
      const abierta = clientes.find((c): c is WindowClient => "focus" in c);
      if (abierta) {
        await abierta.focus();
        if ("navigate" in abierta) await abierta.navigate(url);
        return;
      }
      await self.clients.openWindow(url);
    })
  );
});
```

  (Si `tsc` se queja de `PushEvent`/`NotificationEvent`, el archivo ya declara `self` como `ServiceWorkerGlobalScope`; verificar el `declare` existente y agregar `/// <reference lib="webworker" />` si falta.)

- [ ] `hooks/useAvisosPush.ts`:

```ts
"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

export type SoportePush = "ok" | "sin-soporte" | "ios-sin-instalar";
export type EstadoAvisos = {
  soporte: SoportePush;
  permiso: NotificationPermission | "no-disponible";
  suscripto: boolean;
  ocupado: boolean;
  error: string | null;
  claveConfigurada: boolean;
};

const CLAVE_PUBLICA = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function base64UrlAUint8(b64: string): Uint8Array {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const s = (b64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(s);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function detectarSoporte(): SoportePush {
  if (typeof window === "undefined") return "sin-soporte";
  const esIOS = /iP(hone|ad|od)/.test(navigator.userAgent);
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  if (esIOS && !standalone) return "ios-sin-instalar";
  if (!("Notification" in window) || !("PushManager" in window) || !("serviceWorker" in navigator)) return "sin-soporte";
  return "ok";
}

async function suscripcionActual(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

async function guardarEnServer(sub: PushSubscription) {
  const body = { ...sub.toJSON(), userAgent: navigator.userAgent.slice(0, 120) };
  const res = await apiFetch("/api/push/suscribir", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("No se pudo guardar la suscripción");
}

// Estado y acciones de las notificaciones push de ESTE dispositivo. El permiso se pide solo
// desde activar() (a pedido del usuario). Al montar, si ya está suscripto, re-sincroniza con
// el server (la hoja pudo vaciarse o cambió la cuenta en este navegador).
export function useAvisosPush(): EstadoAvisos & { activar: () => Promise<void>; desactivar: () => Promise<void> } {
  const [soporte, setSoporte] = useState<SoportePush>("sin-soporte");
  const [permiso, setPermiso] = useState<EstadoAvisos["permiso"]>("no-disponible");
  const [suscripto, setSuscripto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const s = detectarSoporte();
    setSoporte(s);
    if (s !== "ok") return;
    setPermiso(Notification.permission);
    let vivo = true;
    suscripcionActual()
      .then(async (sub) => {
        if (!vivo) return;
        setSuscripto(!!sub);
        if (sub && Notification.permission === "granted") await guardarEnServer(sub).catch(() => {});
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);

  const activar = useCallback(async () => {
    setOcupado(true);
    setError(null);
    try {
      const p = await Notification.requestPermission();
      setPermiso(p);
      if (p !== "granted") return;
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlAUint8(CLAVE_PUBLICA) }));
      await guardarEnServer(sub);
      setSuscripto(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron activar los avisos");
    } finally {
      setOcupado(false);
    }
  }, []);

  const desactivar = useCallback(async () => {
    setOcupado(true);
    try {
      const sub = await suscripcionActual();
      if (sub) {
        await apiFetch(`/api/push/suscribir?endpoint=${encodeURIComponent(sub.endpoint)}`, { method: "DELETE" });
        await sub.unsubscribe();
      }
      setSuscripto(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron desactivar los avisos");
    } finally {
      setOcupado(false);
    }
  }, []);

  return { soporte, permiso, suscripto, ocupado, error, claveConfigurada: !!CLAVE_PUBLICA, activar, desactivar };
}
```

  Nota: `applicationServerKey` espera `BufferSource`; si `tsc` se queja del `Uint8Array<ArrayBufferLike>`, castear `as BufferSource`.

- [ ] `hooks/useAvisosPush.test.tsx` (stubs: `navigator.serviceWorker.ready` con `pushManager.getSubscription/subscribe`, `Notification` con `permission`/`requestPermission`, `window.matchMedia`, `apiFetch` mockeado): sin soporte · denied → `activar` no suscribe · activar: pide permiso, suscribe con `applicationServerKey` y POSTea · desactivar: DELETE + `unsubscribe` · iOS sin standalone → `ios-sin-instalar` · al montar con suscripción y `granted` → POST de re-sync.

- [ ] `components/layout/AvisosPush.tsx`:

```tsx
"use client";

import { Bell, BellOff, BellRing, Loader2 } from "lucide-react";
import { useAvisosPush } from "@/hooks/useAvisosPush";

// Entrada "Avisos" del menú (drawer mobile y sidebar desktop). Activa/desactiva las
// notificaciones push de este dispositivo y explica los estados en que no se puede.
export function AvisosPush({ className = "" }: { className?: string }) {
  const { soporte, permiso, suscripto, ocupado, error, claveConfigurada, activar, desactivar } = useAvisosPush();
  const base = "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-700";

  if (!claveConfigurada || soporte === "sin-soporte") return null;

  if (soporte === "ios-sin-instalar") {
    return (
      <p className={`${base} ${className}`}>
        <BellOff size={18} /> Avisos: instalá la app para activarlos
      </p>
    );
  }
  if (permiso === "denied") {
    return (
      <p className={`${base} ${className}`} title="Permitilos desde la configuración del sitio en tu navegador">
        <BellOff size={18} /> Avisos bloqueados en el navegador
      </p>
    );
  }
  if (suscripto) {
    return (
      <div className={`${base} justify-between ${className}`}>
        <span className="flex items-center gap-3"><BellRing size={18} className="text-emerald-600" /> Avisos activados</span>
        <button type="button" onClick={desactivar} disabled={ocupado} className="text-xs text-slate-500 underline disabled:opacity-50">
          {ocupado ? <Loader2 size={12} className="animate-spin" /> : "Desactivar"}
        </button>
      </div>
    );
  }
  return (
    <div className={className}>
      <button type="button" onClick={activar} disabled={ocupado} className={`${base} font-medium hover:bg-slate-100 disabled:opacity-50`}>
        {ocupado ? <Loader2 size={18} className="animate-spin" /> : <Bell size={18} />}
        Activar avisos
      </button>
      {error && <p className="px-3 text-xs text-red-600">{error}</p>}
    </div>
  );
}
```

- [ ] `components/layout/AvisosPush.test.tsx` (mock `@/hooks/useAvisosPush`): los 5 estados + sin clave → nada + activar llama `activar`.
- [ ] Montar: en `AppShell.tsx` (sidebar, dentro del `div.px-3.pb-5`, antes de «Instalar app») `<AvisosPush />`; en `MobileDrawer.tsx` (antes de «Instalar app») `<AvisosPush />`. `AppShell.test`/`MobileDrawer.test`: si fallan por `navigator.serviceWorker` ausente, el hook ya tolera (`sin-soporte` → `null`); verificar.
- [ ] `components/tareas/BannerAvisos.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Bell, Loader2, X } from "lucide-react";
import { useAvisosPush } from "@/hooks/useAvisosPush";

const KEY = "avisos-banner-cerrado";

// Invitación única por dispositivo a activar los avisos. Se oculta al activar o con "Ahora no".
export function BannerAvisos() {
  const { soporte, permiso, suscripto, ocupado, claveConfigurada, activar } = useAvisosPush();
  const [cerrado, setCerrado] = useState(true); // arranca oculto: el server no sabe del localStorage
  useEffect(() => {
    try {
      setCerrado(localStorage.getItem(KEY) === "1");
    } catch {
      setCerrado(false);
    }
  }, []);

  if (cerrado || !claveConfigurada || soporte !== "ok" || permiso !== "default" || suscripto) return null;

  const ahoraNo = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* modo privado */
    }
    setCerrado(true);
  };

  return (
    <div className="mt-4 flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 md:flex-row md:items-center">
      <Bell size={18} className="shrink-0 text-slate-700" />
      <p className="flex-1 text-sm text-slate-700">Activá los avisos para enterarte cuando te asignen o revisen una tarea.</p>
      <div className="flex gap-2">
        <button type="button" onClick={activar} disabled={ocupado} className="flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50">
          {ocupado && <Loader2 size={14} className="animate-spin" />} Activar
        </button>
        <button type="button" onClick={ahoraNo} className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100">
          <X size={14} /> Ahora no
        </button>
      </div>
    </div>
  );
}
```

  (El `setCerrado` en efecto es lectura de `localStorage` post-hidratación; si el lint `set-state-in-effect` lo marca, usar `useSyncExternalStore` o inicializar con `typeof window !== "undefined"` guardado en `useState(() => …)` — la segunda opción produce mismatch de hidratación solo en el HTML del banner; preferir `useState(() => (typeof window === "undefined" ? true : leer()))` **no**: mantener el efecto y, si lint marca warning (no error), aceptar.)

- [ ] `components/tareas/BannerAvisos.test.tsx` (mock hook + `localStorage`): se muestra con `default`/no suscripto · «Ahora no» oculta y persiste · no aparece si suscripto/denied/cerrado.
- [ ] Montar en `app/(app)/tareas/page.tsx` debajo de `<PendientesDeSubir />`. El `page.test.tsx` mockea `@/hooks/useAvisosPush` → `{ soporte: "sin-soporte", … }` para que no renderice.
- [ ] Correr `npx vitest run components hooks "app/(app)"`. **Checkpoint.**

---

### Task 7: Env, Docker, CI, docs

- [ ] `.env.example` — sección nueva:

```
# =====================================================
# Notificaciones push (opcional; sin esto la app funciona igual, solo sin avisos)
# =====================================================
# Generar una vez: npx web-push generate-vapid-keys
# VAPID_PUBLIC_KEY=
# VAPID_PRIVATE_KEY=
# VAPID_SUBJECT=mailto:contacto@tu-dominio.com
# ⚠ La pública también va como NEXT_PUBLIC_* (se hornea en el BUILD: build-arg en Docker/CI).
# NEXT_PUBLIC_VAPID_PUBLIC_KEY=
# Los recordatorios diarios solo corren con NODE_ENV=production. Para probarlos en dev:
# RECORDATORIOS_ENABLED=1
```

- [ ] `Dockerfile`: `ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY` + `ENV NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY` junto a los otros.
- [ ] `.github/workflows/ci-cd.yml`: `NEXT_PUBLIC_VAPID_PUBLIC_KEY=${{ vars.NEXT_PUBLIC_VAPID_PUBLIC_KEY }}` en `build-args`.
- [ ] `docs/DEPLOY.md` (o README, donde esté el setup): pasos 1–4 del spec #5.

---

### Task 8: Verificación final

- [ ] `npm test` · `npx tsc --noEmit` · `npm run lint` · `npm run build` (y `grep -c "notificationclick" public/sw.js` ≥ 1).
- [ ] Reporte con el setup manual pendiente (claves VAPID, variable de repo, hoja `Suscripciones`).
