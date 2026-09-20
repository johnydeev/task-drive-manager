# Campana de avisos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Historial de avisos por usuario (hoja `Avisos`, 30 días) con campana + badge de no leídos arriba a la derecha, alimentado por los mismos eventos que mandan push.

**Architecture:** `lib/avisos.ts` (`avisar` / `avisarLote`) envuelve a `notificar`: guarda filas en `Avisos` y después manda el push. Rutas `GET /api/avisos` y `PATCH /api/avisos/leer`. Cliente: `useAvisos` (TanStack, polling 60 s + invalidación por mensaje del SW) y `CampanaAvisos` montada en una barra superior desktop y en el header mobile. Purga de 30 días en la corrida diaria del scheduler.

**Tech Stack:** Next 16 App Router, TanStack Query v5, googleapis (Sheets `values.update` / `values.batchUpdate` / `batchUpdate`), serwist SW, Vitest + Testing Library, date-fns v4.

**Spec:** [`../specs/2026-09-20-campana-de-avisos-design.md`](../specs/2026-09-20-campana-de-avisos-design.md)

Convenciones del repo: sin `git commit` (lo hace Jony); tests colocados; sin `setState` en `useEffect`; sin `Date.now()` en render; botones async con `Loader2` + `disabled`.

---

## Mapa de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `types/index.ts` | modificar | `TipoAviso`, `AvisoGuardado` |
| `lib/sheets/core.ts` | modificar | `SHEETS.avisos`, `writeRanges` |
| `lib/sheets/core.test.ts` | modificar | tests de `writeRanges` |
| `lib/sheets/avisos.ts` | crear | CRUD de la hoja `Avisos` |
| `lib/sheets/avisos.test.ts` | crear | |
| `lib/google-sheets.ts` | modificar | re-exports |
| `lib/avisos.ts` | crear | `avisar`, `avisarLote`, `RETENCION_AVISOS_MS` |
| `lib/avisos.test.ts` | crear | |
| `lib/recordatorios.ts` | modificar | `tag` tipado como `TipoAviso` |
| `lib/recordatorios-scheduler.ts` | modificar | `avisarLote` + purga |
| `lib/recordatorios-scheduler.test.ts` | modificar | |
| `app/api/tareas/[id]/route.ts` | modificar | `notificar` → `avisar` |
| `tests/api/tareas-transiciones.test.ts` | modificar | mock de `@/lib/avisos` |
| `app/api/avisos/route.ts` | crear | GET |
| `app/api/avisos/leer/route.ts` | crear | PATCH |
| `tests/api/avisos.test.ts` | crear | |
| `lib/api-client.ts` | modificar | `api.avisos.list` / `api.avisos.leer` |
| `hooks/queries.ts` | modificar | `useAvisos` |
| `app/sw.ts` | modificar | `postMessage AVISO_NUEVO` |
| `components/providers/RegisterPWA.tsx` | modificar | `AVISO_NUEVO` → `aviso-nuevo` |
| `components/providers/RegisterPWA.test.tsx` | crear | |
| `components/layout/CampanaAvisos.tsx` | crear | campana + panel |
| `components/layout/CampanaAvisos.test.tsx` | crear | |
| `components/layout/AppShell.tsx` | modificar | barra desktop + header mobile |
| `components/layout/AppShell.test.tsx` | modificar | campana presente |
| `docs/SETUP.md`, `docs/AUDITORIA-2026-09.md` | modificar | hoja `Avisos` |

---

### Task 1: Tipos y `writeRanges` en core

**Files:** `types/index.ts`, `lib/sheets/core.ts`, `lib/sheets/core.test.ts`

- [ ] **Step 1: tipos** — después de `interface Aviso` en `types/index.ts`:

```ts
export type TipoAviso =
  | "asignar"
  | "revisar"
  | "objetar"
  | "recordatorio-revision"
  | "recordatorio-mias";

// Fila de la hoja Avisos: lo que muestra la campana.
export interface AvisoGuardado extends Aviso {
  id: string;
  email: string;
  tipo: TipoAviso;
  creadoEn: string;
  leidoEn: string | null;
}
```

- [ ] **Step 2: test rojo** — en `lib/sheets/core.test.ts`, agregar `valuesBatchUpdate` al mock (`values: { get, update, batchUpdate: valuesBatchUpdate }`), importar `writeRanges`, y:

```ts
describe("writeRanges", () => {
  it("escribe varios rangos en un solo values.batchUpdate e invalida las hojas", async () => {
    valuesGet.mockResolvedValue(filas("a"));
    await readRange("Avisos!A:H");
    await writeRanges([
      { range: "Avisos!H2", values: [["x"]] },
      { range: "Avisos!H5", values: [["y"]] },
    ]);
    expect(valuesBatchUpdate).toHaveBeenCalledTimes(1);
    expect(valuesBatchUpdate.mock.calls[0][0].requestBody.data).toHaveLength(2);
    await readRange("Avisos!A:H");
    expect(valuesGet).toHaveBeenCalledTimes(2); // invalidó
  });

  it("lista vacía → no llama a Google", async () => {
    await writeRanges([]);
    expect(valuesBatchUpdate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: implementación** — `SHEETS.avisos: "Avisos"` y, debajo de `writeRange`:

```ts
// Varios rangos en UNA llamada (values.batchUpdate). Para marcar leídos N filas sueltas sin
// N escrituras contra la cuota. Lista vacía → no llama a Google.
export async function writeRanges(
  entradas: { range: string; values: (string | number)[][] }[]
): Promise<void> {
  if (entradas.length === 0) return;
  await conReintentos(() =>
    getSheets().spreadsheets.values.batchUpdate({
      spreadsheetId: getSheetId(),
      requestBody: { valueInputOption: "USER_ENTERED", data: entradas },
    })
  );
  for (const hoja of new Set(entradas.map((e) => hojaDeRango(e.range)))) invalidarHoja(hoja);
}
```

- [ ] **Step 4:** `npx vitest run lib/sheets/core.test.ts` → verde. `npx tsc --noEmit`.

### Task 2: `lib/sheets/avisos.ts`

**Files:** `lib/sheets/avisos.ts`, `lib/sheets/avisos.test.ts`, `lib/google-sheets.ts`

- [ ] **Step 1: test rojo** (`lib/sheets/avisos.test.ts`, mock `googleapis` como `suscripciones.test.ts` más `values.batchUpdate`; `spreadsheetsGet` devuelve `{ sheetId: 9, title: "Avisos" }`):

```ts
const HEADER = ["id", "email", "titulo", "cuerpo", "url", "tipo", "creado_en", "leido_en"];
const fila = (id: string, email: string, creado: string, leido = "", tipo = "asignar") =>
  [id, email, `T${id}`, "c", "/tareas/1", tipo, creado, leido];
const T0 = Date.parse("2026-09-20T12:00:00.000Z");

describe("getAvisos", () => {
  it("filtra por email y desde, ordena más nuevos primero, ignora filas sin email/título", ...)
  // filas: a (s@x, T0-1d), b (otro, T0-1d), c (s@x, T0-40d), d (s@x, T0-2h), ["", ...] → [d, a]
  it("leidoEn null si vacío", ...)
});
describe("appendAvisos", () => {
  it("escribe todas las filas en un solo update en la fila libre", ...)  // rows HEADER + 2 → range A4:H5
  it("vacío → no escribe", ...)
});
describe("reemplazarRecordatorios", () => {
  it("borra las existentes del mismo email+tipo y agrega las nuevas", ...) // batchUpdate deleteDimension + update
});
describe("marcarLeidos", () => {
  it("un solo values.batchUpdate con H{n} de las no leídas del email", ...) // no toca leídas ni ajenas; devuelve n
  it("sin no leídas → no escribe y devuelve 0", ...)
});
describe("purgarAvisos", () => {
  it("borra las viejas y las de fecha inválida; devuelve la cantidad", ...)
});
```

- [ ] **Step 2: implementación**

```ts
import { nanoid } from "nanoid";
import { isDemoMode } from "../demo-mode";
import { nowBuenosAiresISO } from "../fecha-ar";
import { conLockDeHoja, deleteRows, readRange, SHEETS, writeRange, writeRanges } from "./core";
import { buildHeaderMap } from "./headers";
import type { AvisoGuardado, TipoAviso } from "@/types";

// Hoja Avisos: id · email · titulo · cuerpo · url · tipo · creado_en · leido_en.
const RANGE = `${SHEETS.avisos}!A:H`;
export const AVISOS_COLUMNAS = ["id", "email", "titulo", "cuerpo", "url", "tipo", "creado_en", "leido_en"];

export type AvisoNuevo = Pick<AvisoGuardado, "email" | "titulo" | "cuerpo" | "url" | "tipo"> & { tag?: string };

interface Parseado { items: AvisoGuardado[]; rowNumbers: Map<string, number> }

function parse(rows: string[][]): Parseado { /* como suscripciones: fila i → i+2; ignora sin email o sin titulo */ }
function toRow(a: AvisoGuardado): string[] { return [a.id, a.email, a.titulo, a.cuerpo, a.url, a.tipo, a.creadoEn, a.leidoEn ?? ""]; }
const ts = (iso: string) => Date.parse(iso);

export async function getAvisos(email: string, opts: { desde: number }): Promise<AvisoGuardado[]>
export async function appendAvisos(filas: AvisoNuevo[]): Promise<void>            // lock + 1 writeRange A{n}:H{n+k-1}
export async function reemplazarRecordatorios(filas: AvisoNuevo[]): Promise<void> // lock: deleteRows(mismo email+tipo) + append
export async function marcarLeidos(email: string, hasta = Date.now()): Promise<number> // writeRanges H{n}
export async function purgarAvisos(antesDe: number): Promise<number>              // deleteRows(creado_en < antesDe o inválida)
```

`append` interno (sin lock) lo comparten `appendAvisos` y `reemplazarRecordatorios`; ambos públicos toman el lock `SHEETS.avisos`. Demo: lecturas `[]`, escrituras no-op / `0`.

- [ ] **Step 3:** re-export en `lib/google-sheets.ts`: `export { getAvisos, appendAvisos, reemplazarRecordatorios, marcarLeidos, purgarAvisos } from "./sheets/avisos";` y `writeRanges` junto a `readRange`.
- [ ] **Step 4:** `npx vitest run lib/sheets/avisos.test.ts` verde.

### Task 3: `lib/avisos.ts` y llamadores

**Files:** `lib/avisos.ts`, `lib/avisos.test.ts`, `lib/recordatorios.ts`, `lib/recordatorios-scheduler.ts` (+test), `app/api/tareas/[id]/route.ts`, `tests/api/tareas-transiciones.test.ts`

- [ ] **Step 1: test rojo** `lib/avisos.test.ts` (mocks `./sheets/avisos`, `./push`, `./demo-mode`): guarda y manda; normaliza; vacío no hace nada; guardar falla → igual manda; `avisarLote` agrupa (recordatorios → `reemplazarRecordatorios`, resto → `appendAvisos`, una llamada por grupo) y `notificar` por ítem; demo nada; nunca lanza aunque `notificar` lance.

- [ ] **Step 2: implementación**

```ts
import type { Aviso, TipoAviso } from "@/types";
import { isDemoMode } from "./demo-mode";
import { notificar } from "./push";
import { appendAvisos, reemplazarRecordatorios, type AvisoNuevo } from "./sheets/avisos";

export const RETENCION_AVISOS_MS = 30 * 24 * 3600 * 1000;

export interface ItemAviso { email: string; aviso: Aviso; tipo: TipoAviso }

const esRecordatorio = (t: TipoAviso) => t.startsWith("recordatorio-");
const normalizar = (emails: string[]) => [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];

// Guarda en la hoja Avisos y después manda el push. Nunca lanza: si guardar falla, el push sale igual.
export async function avisar(emails: string[], aviso: Aviso, tipo: TipoAviso): Promise<void> {
  const destinatarios = normalizar(emails);
  if (destinatarios.length === 0 || isDemoMode()) return;
  await guardar(destinatarios.map((email) => ({ email, aviso, tipo })));
  await notificar(destinatarios, aviso).catch(() => {});
}

// Varios avisos distintos (recordatorios del día): una escritura por grupo, un push por ítem.
export async function avisarLote(items: ItemAviso[]): Promise<void> {
  const limpios = items.map((i) => ({ ...i, email: i.email.trim().toLowerCase() })).filter((i) => i.email);
  if (limpios.length === 0 || isDemoMode()) return;
  await guardar(limpios);
  for (const i of limpios) await notificar([i.email], i.aviso).catch(() => {});
}

async function guardar(items: ItemAviso[]) {
  const aFila = (i: ItemAviso): AvisoNuevo => ({ email: i.email, titulo: i.aviso.titulo, cuerpo: i.aviso.cuerpo, url: i.aviso.url, tipo: i.tipo });
  const recordatorios = items.filter((i) => esRecordatorio(i.tipo)).map(aFila);
  const inmediatos = items.filter((i) => !esRecordatorio(i.tipo)).map(aFila);
  try {
    if (recordatorios.length) await reemplazarRecordatorios(recordatorios);
    if (inmediatos.length) await appendAvisos(inmediatos);
  } catch (err) {
    console.error("[avisos] error guardando:", err);
  }
}
```

- [ ] **Step 3:** `lib/recordatorios.ts`: `tag: "recordatorio-revision" satisfies TipoAviso` (idem `mias`) y `Recordatorio.aviso` sigue `Aviso`; el scheduler castea `tipo: r.aviso.tag as TipoAviso`. Scheduler:

```ts
  const recordatorios = armarRecordatorios(tareas, usuarios, now);
  await avisarLote(recordatorios.map((r) => ({ email: r.email, aviso: r.aviso, tipo: r.aviso.tag as TipoAviso })));
  await setConfigValor(CLAVE_ULTIMO_ENVIO, fecha);
  console.log(`[recordatorios] ${fecha}: ${recordatorios.length} aviso(s)`);
  try {
    const n = await purgarAvisos(now - RETENCION_AVISOS_MS);
    if (n) console.log(`[avisos] purga: ${n} fila(s)`);
  } catch (err) {
    console.error("[avisos] error purgando:", err);
  }
  return "enviado";
```

Test del scheduler: mock `./avisos` (`avisarLote`) y `./sheets/avisos` (`purgarAvisos`); asserts: `avisarLote` recibe `[{ email: "admin@x.com", aviso: objectContaining({ tag: "recordatorio-revision" }), tipo: "recordatorio-revision" }]`; purga llamada con `LUNES_0800 - 30d` **después** de `setConfigValor` (orden por `mock.invocationCallOrder`); purga que lanza → igual `"enviado"`; `avisarLote` que lanza → rechaza y no guarda la fecha.

- [ ] **Step 4:** ruta: `import { avisar } from "@/lib/avisos"` (sacar `notificar`), 3 llamadas con `"asignar"` / `"revisar"` / `"objetar"`. Test de transiciones: `vi.mock("@/lib/avisos", () => ({ avisar }))`, asserts `avisar(["op@x.com"], objectContaining({...}), "asignar")` etc.
- [ ] **Step 5:** `npx vitest run lib/avisos.test.ts lib/recordatorios-scheduler.test.ts tests/api/tareas-transiciones.test.ts` verde.

### Task 4: rutas `/api/avisos`

**Files:** `app/api/avisos/route.ts`, `app/api/avisos/leer/route.ts`, `tests/api/avisos.test.ts`

```ts
// app/api/avisos/route.ts
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/http/withAuth";
import { getAvisos } from "@/lib/google-sheets";
import { RETENCION_AVISOS_MS } from "@/lib/avisos";

export const runtime = "nodejs";
const TOPE = 50;

// Avisos del usuario de la sesión: últimos 30 días, más nuevos primero, tope 50.
export const GET = withAuth(async (_req, session) => {
  const avisos = (await getAvisos(session.user.email, { desde: Date.now() - RETENCION_AVISOS_MS })).slice(0, TOPE);
  const noLeidos = avisos.filter((a) => !a.leidoEn).length;
  return NextResponse.json({ avisos, noLeidos });
});
```

```ts
// app/api/avisos/leer/route.ts
export const PATCH = withAuth(async (_req, session) => {
  const marcados = await marcarLeidos(session.user.email);
  return NextResponse.json({ ok: true, marcados });
});
```

Tests (`// @vitest-environment node`, mocks `@/lib/auth` y `@/lib/google-sheets`): GET 401 (requireSession lanza `Response` 401 → `handleApiError` passthrough), GET pide con el email de sesión y `desde ≈ now - 30d`, tope 50 y `noLeidos`; PATCH devuelve `marcados`.

### Task 5: cliente — `api.avisos`, `useAvisos`, SW, `RegisterPWA`

- [ ] `lib/api-client.ts`: `avisos: { list: () => request<{ avisos: AvisoGuardado[]; noLeidos: number }>("/api/avisos"), leer: () => request<{ ok: true; marcados: number }>("/api/avisos/leer", { method: "PATCH" }) }`.
- [ ] `hooks/queries.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
export const AVISOS_KEY = ["avisos"] as const;
export const useAvisos = () =>
  useQuery({ queryKey: AVISOS_KEY, queryFn: api.avisos.list, refetchInterval: 60_000, refetchOnWindowFocus: true, staleTime: 30_000 });
```

- [ ] `app/sw.ts` handler `push`:

```ts
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(...),
      self.clients.matchAll({ type: "window" }).then((cs) => cs.forEach((c) => c.postMessage({ type: "AVISO_NUEVO" }))),
    ])
  );
```

- [ ] `RegisterPWA.tsx` `onMessage`: `if (event.data?.type === "AVISO_NUEVO") window.dispatchEvent(new CustomEvent("aviso-nuevo"));`. Test nuevo `RegisterPWA.test.tsx`: stub `navigator.serviceWorker` con `register` resuelto y `addEventListener` capturado; disparar el listener con `{ data: { type: "AVISO_NUEVO" } }` → `window` recibe `aviso-nuevo`; ídem `TAREAS_SYNCED` → `tareas-synced`.

### Task 6: `CampanaAvisos`

**Files:** `components/layout/CampanaAvisos.tsx`, `components/layout/CampanaAvisos.test.tsx`

Comportamiento (spec #4): botón `aria-label="Avisos"` + badge; abrir → snapshot de no leídos (`useState`), `setQueryData` optimista + `api.avisos.leer()` (si falla `invalidateQueries`); cerrar por click afuera / `Escape` / elegir; ítems `<button>` con título (negrita si estaba no leído al abrir), cuerpo `line-clamp-2`, `formatDistance(new Date(creadoEn), new Date(ahora), { addSuffix: true, locale: es })`; `ahora` = `useState(() => Date.now())` renovado al abrir; click → `router.push(url)`; vacío «Sin avisos»; error «No se pudieron cargar los avisos». Efecto único: listener `aviso-nuevo` → `invalidateQueries(AVISOS_KEY)` (sin `setState`). Panel `z-40`, `absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)]`, `role="dialog"`.

Tests (mock `@/hooks/queries` `useAvisos`, `@/lib/api-client` `api`, `next/navigation` `useRouter`; envolver en `QueryClientProvider`): badge `3`, `9+`, oculto en 0; abrir llama `api.avisos.leer` y badge desaparece; ítem no leído `font-semibold`; click navega y cierra; `Escape` cierra; vacío; error; `aviso-nuevo` invalida (spy `invalidateQueries`).

### Task 7: `AppShell`

- Sidebar: sacar `<OfflineIndicator />` (línea ~63), dejar solo el `<h1>`.
- Antes de `<header … md:hidden>`, barra desktop:

```tsx
<div className="sticky top-0 z-30 hidden h-12 items-center justify-end gap-3 border-b border-slate-200 bg-white px-6 md:flex">
  <CampanaAvisos />
  <OfflineIndicator />
</div>
```

- Header mobile, celda derecha: `<div className="flex items-center gap-3 justify-self-end"><CampanaAvisos /><OfflineIndicator /></div>`.
- `AppShell.test.tsx`: mock `./CampanaAvisos` → `<button aria-label="Avisos" />`; assert `getAllByLabelText("Avisos")` length 2.

### Task 8: docs + verificación

- `docs/SETUP.md`: hoja `Avisos` con encabezados. `docs/AUDITORIA-2026-09.md`: sección «Campana de avisos» + setup.
- `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.
