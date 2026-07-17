# Vista "Edificios": asignaciones + Directivas (Pieza A) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans o superpowers:subagent-driven-development para implementar este plan task-by-task. Los steps usan checkbox (`- [ ]`).

> **⚠️ Convención de commits (regla global del usuario):** Claude **NUNCA ejecuta `git commit`** ni prepara staging ni sugiere mensajes. Al cerrar cada task se deja el árbol **verde** (suite + tsc) y se frena; el commit lo hace el usuario en GitLens. Donde el template diría "Commit", acá dice **"Checkpoint"**.

**Spec asociado:** [`docs/superpowers/specs/2026-07-17-edificios-asignaciones.md`](../specs/2026-07-17-edificios-asignaciones.md) — leer primero.

**Goal:** Que el admin pueda asignar **edificios** (organizativo) y crear/asignar **Directivas** (indicaciones puntuales) a cada integrante, con una vista "Edificios" en el sidebar; cada integrante ve solo lo suyo. La **Tarea** del supervisor no se toca.

**Architecture:** Dos entidades nuevas independientes de la Tarea, guardadas en tabs propios (`Directivas`, `Asignaciones`) con módulos de datos en `lib/sheets/`. Permisos server-side vía `withAuth` (lectura) y un nuevo `withAdmin` (escritura admin-only). UI nueva en `/edificios` que consume hooks de datos; identificación de integrantes por **nombre** (resuelto desde `Usuarios`).

**Tech Stack:** Next 16 (App Router), React 19, TypeScript, Zod, TanStack Query, Vitest + Testing Library, googleapis (Sheets).

**Requisito manual previo (usuario):** crear en la Sheet los tabs `Directivas` (headers `id | descripcion | fecha | asignadoA | creadoPor | creadoEn | estado`) y `Asignaciones` (headers `email | edificio`).

---

## File Structure

### Crear
| Archivo | Responsabilidad |
|---|---|
| `lib/sheets/asignaciones.ts` (+`.test.ts`) | CRUD del tab Asignaciones |
| `lib/sheets/directivas.ts` (+`.test.ts`) | CRUD del tab Directivas |
| `lib/http/withAdmin.ts` (+`.test.ts`) | Wrapper de rutas admin-only |
| `app/api/asignaciones/route.ts` (+ test) | Endpoints de asignaciones |
| `app/api/directivas/route.ts` (+ test) | Endpoints de directivas |
| `lib/user-display.ts` (+`.test.ts`) | Resolver email→nombre |
| `hooks/edificios-queries.ts` (+`.test.tsx`) | `useUsuarios`, `useAsignaciones`, `useDirectivas` |
| `app/(app)/edificios/page.tsx` | Página de la vista |
| `components/edificios/EdificiosView.tsx` (+`.test.tsx`) | Vista (admin todos / supervisor propio) |
| `components/edificios/IntegranteCard.tsx` | Tarjeta por integrante (edificios + directivas) |
| `components/edificios/DirectivaForm.tsx` | Form de crear/asignar directiva |

### Modificar
| Archivo | Cambio |
|---|---|
| `types/index.ts` | Tipos `Directiva`, `DirectivaNuevaInput`, `Asignacion` |
| `lib/schemas.ts` | `directivaNuevaSchema`, `asignacionSchema` |
| `lib/sheets/core.ts` | Sumar `SHEETS.asignaciones`/`SHEETS.directivas` + `getSheetGid(title)` |
| `lib/api-client.ts` | `api.asignaciones.*`, `api.directivas.*` |
| `components/layout/AppShell.tsx` | Item "Edificios" en el sidebar |

---

## Tasks

### Task 1: Tipos + schemas

**Files:**
- Modify: `types/index.ts`
- Modify: `lib/schemas.ts`
- Modify: `tests/lib/schemas.test.ts`

- [ ] **Step 1: Test de los schemas (falla)**

Agregar a `tests/lib/schemas.test.ts`:
```ts
import { directivaNuevaSchema, asignacionSchema } from "@/lib/schemas";

describe("directivaNuevaSchema", () => {
  const base = { descripcion: "Visitar edificio X", fecha: "2026-07-17", asignadoA: "OP@X.com" };
  it("acepta una directiva válida y baja el email", () => {
    const r = directivaNuevaSchema.parse(base);
    expect(r.asignadoA).toBe("op@x.com");
  });
  it("rechaza descripcion vacía", () => {
    expect(directivaNuevaSchema.safeParse({ ...base, descripcion: "" }).success).toBe(false);
  });
  it("rechaza asignadoA no-email", () => {
    expect(directivaNuevaSchema.safeParse({ ...base, asignadoA: "x" }).success).toBe(false);
  });
});

describe("asignacionSchema", () => {
  it("acepta email+edificio y baja el email", () => {
    const r = asignacionSchema.parse({ email: "A@X.com", edificio: "Belgrano 1429" });
    expect(r.email).toBe("a@x.com");
    expect(r.edificio).toBe("Belgrano 1429");
  });
  it("rechaza edificio vacío", () => {
    expect(asignacionSchema.safeParse({ email: "a@x.com", edificio: "" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Correr — debe fallar**

Run: `npx vitest run tests/lib/schemas.test.ts`
Expected: FAIL (schemas no existen).

- [ ] **Step 3: Agregar tipos en `types/index.ts`**

```ts
// Directiva: indicación puntual que el admin asigna a un integrante (independiente de edificio).
export type DirectivaEstado = "Asignada"; // La Pieza B extenderá este union.

export interface Directiva {
  id: string;          // timestamp ISO, id estable
  descripcion: string;
  fecha: string;       // fecha a cumplir (ISO date)
  asignadoA: string;   // email del asignado
  creadoPor: string;   // email del admin creador
  creadoEn: string;    // ISO datetime
  estado: DirectivaEstado;
}

export interface DirectivaNuevaInput {
  descripcion: string;
  fecha: string;
  asignadoA: string;
}

// Asignación organizativa usuario↔edificio.
export interface Asignacion {
  email: string;
  edificio: string;
}
```

- [ ] **Step 4: Agregar schemas en `lib/schemas.ts`**

```ts
// Directiva (admin crea/asigna). Reusa isoDate ya definido en este archivo.
export const directivaNuevaSchema = z.object({
  descripcion: z.string().min(1, "Descripción requerida"),
  fecha: isoDate,
  asignadoA: z.string().email().transform((e) => e.toLowerCase()),
});

export const asignacionSchema = z.object({
  email: z.string().email().transform((e) => e.toLowerCase()),
  edificio: z.string().min(1, "Edificio requerido"),
});
```

- [ ] **Step 5: Correr — debe pasar**

Run: `npx vitest run tests/lib/schemas.test.ts`
Expected: PASS.

- [ ] **Step 6: Checkpoint** — `npm test && npx tsc --noEmit` en verde. Frenar (commit del usuario).

---

### Task 2: `lib/sheets/core` — helper de gid + constantes de tabs

**Files:**
- Modify: `lib/sheets/core.ts`

- [ ] **Step 1: Sumar tabs y `getSheetGid` en `core.ts`**

En el objeto `SHEETS` agregar dos claves:
```ts
export const SHEETS = {
  edificios: "Edificios",
  dptos: "Dptos",
  tareas: "Tareas",
  usuarios: "Usuarios",
  configuracion: "Configuracion",
  asignaciones: "Asignaciones",
  directivas: "Directivas",
} as const;
```

Al final de `core.ts`:
```ts
// gid (sheetId interno) por título de pestaña, cacheado. Necesario para borrar filas
// con batchUpdate/deleteDimension.
const gidCache: Record<string, number> = {};
export async function getSheetGid(title: string): Promise<number> {
  if (gidCache[title] != null) return gidCache[title];
  const meta = await getSheets().spreadsheets.get({
    spreadsheetId: getSheetId(),
    fields: "sheets(properties(sheetId,title))",
  });
  const sheet = meta.data.sheets?.find((s) => s.properties?.title === title);
  const gid = sheet?.properties?.sheetId;
  if (gid == null) throw new Error(`No se encontró la hoja "${title}"`);
  gidCache[title] = gid;
  return gid;
}
```

- [ ] **Step 2: Checkpoint** — `npx tsc --noEmit` en verde (sin test propio; se ejercita en Tasks 3-4). Frenar.

---

### Task 3: `lib/sheets/asignaciones.ts` (CRUD)

**Files:**
- Create: `lib/sheets/asignaciones.ts`
- Create: `lib/sheets/asignaciones.test.ts` (colocado)

- [ ] **Step 1: Test (falla)** — `lib/sheets/asignaciones.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const { valuesGet, valuesAppend, spreadsheetsGet, batchUpdate } = vi.hoisted(() => ({
  valuesGet: vi.fn(), valuesAppend: vi.fn(), spreadsheetsGet: vi.fn(), batchUpdate: vi.fn(),
}));
vi.mock("googleapis", () => ({
  google: { sheets: () => ({ spreadsheets: {
    values: { get: valuesGet, append: valuesAppend, update: vi.fn() },
    get: spreadsheetsGet, batchUpdate,
  } }) },
}));
vi.mock("@/lib/google-auth", () => ({ getGoogleAuth: () => ({}), getSheetId: () => "sheet-id" }));
vi.mock("@/lib/demo-mode", () => ({ isDemoMode: () => false }));

import { getAsignaciones, addAsignacion, removeAsignacion } from "@/lib/sheets/asignaciones";

beforeEach(() => {
  valuesGet.mockReset(); valuesAppend.mockReset().mockResolvedValue({});
  spreadsheetsGet.mockReset(); batchUpdate.mockReset().mockResolvedValue({});
});
const rows = (v: string[][]) => valuesGet.mockResolvedValue({ data: { values: v } });

describe("getAsignaciones", () => {
  it("lista todas y baja el email", async () => {
    rows([["A@X.com", "Belgrano 1429"], ["b@x.com", "Garay 350"]]);
    const all = await getAsignaciones();
    expect(all).toEqual([{ email: "a@x.com", edificio: "Belgrano 1429" }, { email: "b@x.com", edificio: "Garay 350" }]);
  });
  it("filtra por email", async () => {
    rows([["a@x.com", "Belgrano 1429"], ["b@x.com", "Garay 350"]]);
    expect(await getAsignaciones("A@X.com")).toEqual([{ email: "a@x.com", edificio: "Belgrano 1429" }]);
  });
});

describe("addAsignacion", () => {
  it("agrega con append si no existe", async () => {
    rows([]);
    await addAsignacion("a@x.com", "Garay 350");
    expect(valuesAppend).toHaveBeenCalledWith(expect.objectContaining({ range: "Asignaciones!A:B" }));
  });
  it("es idempotente: no agrega si ya existe", async () => {
    rows([["a@x.com", "Garay 350"]]);
    await addAsignacion("A@X.com", "Garay 350");
    expect(valuesAppend).not.toHaveBeenCalled();
  });
});

describe("removeAsignacion", () => {
  it("borra la fila que matchea con deleteDimension", async () => {
    rows([["a@x.com", "Belgrano 1429"], ["a@x.com", "Garay 350"]]);
    spreadsheetsGet.mockResolvedValue({ data: { sheets: [{ properties: { sheetId: 55, title: "Asignaciones" } }] } });
    await removeAsignacion("a@x.com", "Garay 350");
    const range = batchUpdate.mock.calls[0][0].requestBody.requests[0].deleteDimension.range;
    expect(range.sheetId).toBe(55);
    expect(range.startIndex).toBe(2); // fila 3 (idx 1 -> rowNumber 3) -> 0-based 2
    expect(range.endIndex).toBe(3);
  });
});
```

- [ ] **Step 2: Correr — falla.** `npx vitest run lib/sheets/asignaciones.test.ts`

- [ ] **Step 3: Implementar `lib/sheets/asignaciones.ts`**

```ts
import { getSheetId } from "../google-auth";
import { isDemoMode } from "../demo-mode";
import type { Asignacion } from "@/types";
import { getSheets, readRange, SHEETS, getSheetGid } from "./core";

function parse(rows: string[][]): (Asignacion & { rowNumber: number })[] {
  return rows
    .map((r, i) => ({ email: (r[0] ?? "").trim().toLowerCase(), edificio: (r[1] ?? "").trim(), rowNumber: i + 2 }))
    .filter((a) => a.email && a.edificio);
}

export async function getAsignaciones(email?: string): Promise<Asignacion[]> {
  if (isDemoMode()) return [];
  const rows = await readRange(`${SHEETS.asignaciones}!A2:B`);
  const all = parse(rows).map(({ email, edificio }) => ({ email, edificio }));
  if (!email) return all;
  const target = email.trim().toLowerCase();
  return all.filter((a) => a.email === target);
}

export async function addAsignacion(email: string, edificio: string): Promise<Asignacion> {
  const e = email.trim().toLowerCase();
  const ed = edificio.trim();
  const asignacion: Asignacion = { email: e, edificio: ed };
  if (isDemoMode()) return asignacion;
  const existing = await getAsignaciones(e);
  if (existing.some((a) => a.edificio === ed)) return asignacion; // idempotente
  await getSheets().spreadsheets.values.append({
    spreadsheetId: getSheetId(),
    range: `${SHEETS.asignaciones}!A:B`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [[e, ed]] },
  });
  return asignacion;
}

export async function removeAsignacion(email: string, edificio: string): Promise<void> {
  if (isDemoMode()) return;
  const e = email.trim().toLowerCase();
  const ed = edificio.trim();
  const rows = await readRange(`${SHEETS.asignaciones}!A2:B`);
  const match = parse(rows).find((a) => a.email === e && a.edificio === ed);
  if (!match) return;
  const gid = await getSheetGid(SHEETS.asignaciones);
  await getSheets().spreadsheets.batchUpdate({
    spreadsheetId: getSheetId(),
    requestBody: { requests: [{ deleteDimension: { range: {
      sheetId: gid, dimension: "ROWS", startIndex: match.rowNumber - 1, endIndex: match.rowNumber,
    } } }] },
  });
}
```

- [ ] **Step 4: Correr — pasa.** `npx vitest run lib/sheets/asignaciones.test.ts`
- [ ] **Step 5: Checkpoint** — `npm test && npx tsc --noEmit`. Frenar.

---

### Task 4: `lib/sheets/directivas.ts` (CRUD)

**Files:**
- Create: `lib/sheets/directivas.ts`
- Create: `lib/sheets/directivas.test.ts` (colocado)

- [ ] **Step 1: Test (falla)** — `lib/sheets/directivas.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const { valuesGet, valuesAppend, spreadsheetsGet, batchUpdate } = vi.hoisted(() => ({
  valuesGet: vi.fn(), valuesAppend: vi.fn(), spreadsheetsGet: vi.fn(), batchUpdate: vi.fn(),
}));
vi.mock("googleapis", () => ({
  google: { sheets: () => ({ spreadsheets: {
    values: { get: valuesGet, append: valuesAppend, update: vi.fn() },
    get: spreadsheetsGet, batchUpdate,
  } }) },
}));
vi.mock("@/lib/google-auth", () => ({ getGoogleAuth: () => ({}), getSheetId: () => "sheet-id" }));
vi.mock("@/lib/demo-mode", () => ({ isDemoMode: () => false }));

import { getDirectivas, appendDirectiva, deleteDirectiva } from "@/lib/sheets/directivas";

const row = (id: string, asignadoA = "op@x.com") =>
  [id, "desc", "2026-07-17", asignadoA, "admin@x.com", id, "Asignada"];

beforeEach(() => {
  valuesGet.mockReset(); valuesAppend.mockReset().mockResolvedValue({});
  spreadsheetsGet.mockReset(); batchUpdate.mockReset().mockResolvedValue({});
});
const rows = (v: string[][]) => valuesGet.mockResolvedValue({ data: { values: v } });

describe("getDirectivas", () => {
  it("mapea filas y filtra por asignadoA", async () => {
    rows([row("2026-07-17T10:00:00.000Z", "op@x.com"), row("2026-07-17T11:00:00.000Z", "otro@x.com")]);
    const mias = await getDirectivas("OP@X.com");
    expect(mias).toHaveLength(1);
    expect(mias[0].asignadoA).toBe("op@x.com");
    expect(mias[0].estado).toBe("Asignada");
  });
});

describe("appendDirectiva", () => {
  it("crea con id/creadoEn y estado Asignada", async () => {
    const d = await appendDirectiva({ descripcion: "x", fecha: "2026-07-17", asignadoA: "OP@X.com" }, "ADMIN@X.com");
    expect(d.asignadoA).toBe("op@x.com");
    expect(d.creadoPor).toBe("admin@x.com");
    expect(d.estado).toBe("Asignada");
    expect(valuesAppend).toHaveBeenCalledWith(expect.objectContaining({ range: "Directivas!A:G" }));
  });
});

describe("deleteDirectiva", () => {
  it("borra la fila del id con deleteDimension", async () => {
    rows([row("2026-07-17T10:00:00.000Z"), row("2026-07-17T11:00:00.000Z")]);
    spreadsheetsGet.mockResolvedValue({ data: { sheets: [{ properties: { sheetId: 66, title: "Directivas" } }] } });
    await deleteDirectiva("2026-07-17T11:00:00.000Z");
    const range = batchUpdate.mock.calls[0][0].requestBody.requests[0].deleteDimension.range;
    expect(range.sheetId).toBe(66);
    expect(range.startIndex).toBe(2);
  });
});
```

- [ ] **Step 2: Correr — falla.** `npx vitest run lib/sheets/directivas.test.ts`

- [ ] **Step 3: Implementar `lib/sheets/directivas.ts`**

```ts
import { getSheetId } from "../google-auth";
import { isDemoMode } from "../demo-mode";
import type { Directiva, DirectivaNuevaInput } from "@/types";
import { getSheets, readRange, SHEETS, getSheetGid } from "./core";

function rowToDirectiva(r: string[]): Directiva {
  return {
    id: r[0] ?? "",
    descripcion: r[1] ?? "",
    fecha: r[2] ?? "",
    asignadoA: (r[3] ?? "").trim().toLowerCase(),
    creadoPor: (r[4] ?? "").trim().toLowerCase(),
    creadoEn: r[5] ?? "",
    estado: "Asignada",
  };
}

export async function getDirectivas(email?: string): Promise<Directiva[]> {
  if (isDemoMode()) return [];
  const rows = await readRange(`${SHEETS.directivas}!A2:G`);
  const all = rows.filter((r) => r[0]).map(rowToDirectiva);
  if (!email) return all;
  const target = email.trim().toLowerCase();
  return all.filter((d) => d.asignadoA === target);
}

export async function appendDirectiva(input: DirectivaNuevaInput, creadoPor: string): Promise<Directiva> {
  const now = new Date().toISOString();
  const directiva: Directiva = {
    id: now,
    descripcion: input.descripcion,
    fecha: input.fecha,
    asignadoA: input.asignadoA.trim().toLowerCase(),
    creadoPor: creadoPor.trim().toLowerCase(),
    creadoEn: now,
    estado: "Asignada",
  };
  if (isDemoMode()) return directiva;
  await getSheets().spreadsheets.values.append({
    spreadsheetId: getSheetId(),
    range: `${SHEETS.directivas}!A:G`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [[
      directiva.id, directiva.descripcion, directiva.fecha, directiva.asignadoA,
      directiva.creadoPor, directiva.creadoEn, directiva.estado,
    ]] },
  });
  return directiva;
}

export async function deleteDirectiva(id: string): Promise<void> {
  if (isDemoMode()) return;
  const rows = await readRange(`${SHEETS.directivas}!A2:G`);
  const idx = rows.findIndex((r) => (r[0] ?? "") === id);
  if (idx === -1) return;
  const rowNumber = idx + 2;
  const gid = await getSheetGid(SHEETS.directivas);
  await getSheets().spreadsheets.batchUpdate({
    spreadsheetId: getSheetId(),
    requestBody: { requests: [{ deleteDimension: { range: {
      sheetId: gid, dimension: "ROWS", startIndex: rowNumber - 1, endIndex: rowNumber,
    } } }] },
  });
}
```

- [ ] **Step 4: Correr — pasa.** `npx vitest run lib/sheets/directivas.test.ts`
- [ ] **Step 5: Checkpoint** — `npm test && npx tsc --noEmit`. Frenar.

---

### Task 5: `withAdmin` (wrapper admin-only)

**Files:**
- Create: `lib/http/withAdmin.ts`
- Create: `lib/http/withAdmin.test.ts`

- [ ] **Step 1: Test (falla)** — `lib/http/withAdmin.test.ts`

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ZodError } from "zod";

const { requireAdmin } = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAdmin }));

import { withAdmin } from "./withAdmin";
import type { NextRequest } from "next/server";

const req = () => new Request("http://localhost/api/x") as unknown as NextRequest;
beforeEach(() => requireAdmin.mockReset());

describe("withAdmin", () => {
  it("con admin llama al handler con la sesión", async () => {
    const session = { user: { email: "a@x.com", rol: "admin" } };
    requireAdmin.mockResolvedValue(session);
    const handler = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    const res = await withAdmin(handler)(req(), undefined);
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledWith(expect.anything(), session, undefined);
  });

  it("usa requireAdmin como guard (no requireSession)", async () => {
    requireAdmin.mockResolvedValue({ user: { email: "a@x.com", rol: "admin" } });
    await withAdmin(vi.fn().mockResolvedValue(Response.json({})))(req(), undefined);
    expect(requireAdmin).toHaveBeenCalledTimes(1);
  });

  it("si el handler lanza ZodError, responde 400", async () => {
    requireAdmin.mockResolvedValue({ user: { email: "a@x.com", rol: "admin" } });
    const res = await withAdmin(vi.fn().mockRejectedValue(new ZodError([])))(req(), undefined);
    expect(res.status).toBe(400);
  });
});
```
> Nota: no se testea el path de "no-admin → 403" con un throw síncrono del spy: vitest lo reporta como fallo aunque el catch lo maneje. El 403 lo garantiza `requireAdmin` real (lanza Response 403), y `handleApiError` hace passthrough de Response (ya verificado en la iniciativa anterior).

- [ ] **Step 2: Correr — falla.** `npx vitest run lib/http/withAdmin.test.ts`

- [ ] **Step 3: Implementar `lib/http/withAdmin.ts`**

```ts
import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";

type Session = Awaited<ReturnType<typeof requireAdmin>>;
type AdminHandler<Ctx> = (req: NextRequest, session: Session, ctx: Ctx) => Promise<Response> | Response;

// Como withAuth pero exige rol admin (requireAdmin lanza 401 sin sesión / 403 si no es admin).
export function withAdmin<Ctx = unknown>(handler: AdminHandler<Ctx>) {
  return async (req: NextRequest, ctx: Ctx): Promise<Response> => {
    try {
      const session = await requireAdmin();
      return await handler(req, session, ctx);
    } catch (err) {
      return handleApiError(err);
    }
  };
}
```

- [ ] **Step 4: Correr — pasa.** `npx vitest run lib/http/withAdmin.test.ts`
- [ ] **Step 5: Checkpoint** — `npm test && npx tsc --noEmit`. Frenar.

---

### Task 6: Ruta `/api/asignaciones`

**Files:**
- Create: `app/api/asignaciones/route.ts`
- Create: `tests/api/asignaciones.test.ts`

- [ ] **Step 1: Test (falla)** — `tests/api/asignaciones.test.ts`

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const { requireSession, requireAdmin } = vi.hoisted(() => ({ requireSession: vi.fn(), requireAdmin: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireSession, requireAdmin }));
vi.mock("@/lib/sheets/asignaciones", () => ({
  getAsignaciones: vi.fn(), addAsignacion: vi.fn(), removeAsignacion: vi.fn(),
}));
vi.mock("@/lib/consorcios", () => ({ getConsorciosActivos: vi.fn() }));

import { getAsignaciones, addAsignacion } from "@/lib/sheets/asignaciones";
import { getConsorciosActivos } from "@/lib/consorcios";
import { GET, POST } from "@/app/api/asignaciones/route";
import type { NextRequest } from "next/server";

const reqUrl = (u: string) => new Request(u) as unknown as NextRequest;
beforeEach(() => { requireSession.mockReset(); requireAdmin.mockReset(); vi.clearAllMocks(); });

describe("GET /api/asignaciones", () => {
  it("admin recibe todas", async () => {
    requireSession.mockResolvedValue({ user: { email: "a@x.com", rol: "admin" } });
    vi.mocked(getAsignaciones).mockResolvedValue([{ email: "b@x.com", edificio: "Garay 350" }]);
    const res = await GET(reqUrl("http://localhost/api/asignaciones"), undefined);
    expect(res.status).toBe(200);
    expect(vi.mocked(getAsignaciones)).toHaveBeenCalledWith(); // sin filtro
  });
  it("supervisor recibe solo las suyas", async () => {
    requireSession.mockResolvedValue({ user: { email: "b@x.com", rol: "supervisor" } });
    vi.mocked(getAsignaciones).mockResolvedValue([]);
    await GET(reqUrl("http://localhost/api/asignaciones"), undefined);
    expect(vi.mocked(getAsignaciones)).toHaveBeenCalledWith("b@x.com");
  });
});

describe("POST /api/asignaciones", () => {
  it("admin agrega si el edificio es válido", async () => {
    requireAdmin.mockResolvedValue({ user: { email: "a@x.com", rol: "admin" } });
    vi.mocked(getConsorciosActivos).mockResolvedValue([{ nombre: "Garay 350", cuit: null }]);
    vi.mocked(addAsignacion).mockResolvedValue({ email: "b@x.com", edificio: "Garay 350" });
    const res = await POST(reqUrl("http://localhost/api/asignaciones") /* body abajo */, undefined);
    // el body se inyecta con Request real:
    // (ver nota) — usamos un Request con json
    expect(requireAdmin).toHaveBeenCalled();
    expect([200, 201]).toContain(res.status);
  });

  it("rechaza edificio inexistente en _Consorcios (400)", async () => {
    requireAdmin.mockResolvedValue({ user: { email: "a@x.com", rol: "admin" } });
    vi.mocked(getConsorciosActivos).mockResolvedValue([]);
    const req = new Request("http://localhost/api/asignaciones", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "b@x.com", edificio: "No Existe" }),
    }) as unknown as NextRequest;
    const res = await POST(req, undefined);
    expect(res.status).toBe(400);
  });
});
```
> Para el primer test de POST, construir el `Request` con `body: JSON.stringify({ email: "b@x.com", edificio: "Garay 350" })` y `headers: { "content-type": "application/json" }` (igual que el segundo). El foco es: `requireAdmin` es el guard y con edificio válido responde 201.

- [ ] **Step 2: Correr — falla.** `npx vitest run tests/api/asignaciones.test.ts`

- [ ] **Step 3: Implementar `app/api/asignaciones/route.ts`**

```ts
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/http/withAuth";
import { withAdmin } from "@/lib/http/withAdmin";
import { getAsignaciones, addAsignacion, removeAsignacion } from "@/lib/sheets/asignaciones";
import { getConsorciosActivos } from "@/lib/consorcios";
import { jsonError } from "@/lib/api-utils";
import { asignacionSchema } from "@/lib/schemas";

export const runtime = "nodejs";

export const GET = withAuth(async (_req, session) => {
  const data = session.user.rol === "admin"
    ? await getAsignaciones()
    : await getAsignaciones(session.user.email);
  return NextResponse.json(data);
});

export const POST = withAdmin(async (req) => {
  const body = await req.json();
  const { email, edificio } = asignacionSchema.parse(body);
  const consorcios = await getConsorciosActivos();
  if (!consorcios.some((c) => c.nombre === edificio)) {
    return jsonError(400, `Edificio "${edificio}" no es válido o no está activo`);
  }
  const a = await addAsignacion(email, edificio);
  return NextResponse.json(a, { status: 201 });
});

export const DELETE = withAdmin(async (req) => {
  const sp = req.nextUrl.searchParams;
  const email = sp.get("email");
  const edificio = sp.get("edificio");
  if (!email || !edificio) return jsonError(400, "Faltan email y edificio");
  await removeAsignacion(email, edificio);
  return NextResponse.json({ ok: true });
});
```

- [ ] **Step 4: Correr — pasa.** `npx vitest run tests/api/asignaciones.test.ts`
- [ ] **Step 5: Checkpoint** — `npm test && npx tsc --noEmit`. Frenar.

---

### Task 7: Ruta `/api/directivas`

**Files:**
- Create: `app/api/directivas/route.ts`
- Create: `tests/api/directivas.test.ts`

- [ ] **Step 1: Test (falla)** — `tests/api/directivas.test.ts`

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const { requireSession, requireAdmin } = vi.hoisted(() => ({ requireSession: vi.fn(), requireAdmin: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireSession, requireAdmin }));
vi.mock("@/lib/sheets/directivas", () => ({
  getDirectivas: vi.fn(), appendDirectiva: vi.fn(), deleteDirectiva: vi.fn(),
}));
vi.mock("@/lib/google-sheets", () => ({ getUsuarios: vi.fn() }));

import { getDirectivas, appendDirectiva } from "@/lib/sheets/directivas";
import { getUsuarios } from "@/lib/google-sheets";
import { GET, POST } from "@/app/api/directivas/route";
import type { NextRequest } from "next/server";

const jsonReq = (body: unknown) => new Request("http://localhost/api/directivas", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
}) as unknown as NextRequest;
beforeEach(() => { requireSession.mockReset(); requireAdmin.mockReset(); vi.clearAllMocks(); });

describe("GET /api/directivas", () => {
  it("admin recibe todas, supervisor solo las suyas", async () => {
    requireSession.mockResolvedValue({ user: { email: "b@x.com", rol: "supervisor" } });
    vi.mocked(getDirectivas).mockResolvedValue([]);
    await GET(new Request("http://localhost/api/directivas") as unknown as NextRequest, undefined);
    expect(vi.mocked(getDirectivas)).toHaveBeenCalledWith("b@x.com");
  });
});

describe("POST /api/directivas", () => {
  it("crea si asignadoA es un usuario activo", async () => {
    requireAdmin.mockResolvedValue({ user: { email: "a@x.com", rol: "admin" } });
    vi.mocked(getUsuarios).mockResolvedValue([{ email: "op@x.com", nombre: "Op", rol: "supervisor", activo: true, creadoEn: "" }]);
    vi.mocked(appendDirectiva).mockResolvedValue({ id: "1", descripcion: "x", fecha: "2026-07-17", asignadoA: "op@x.com", creadoPor: "a@x.com", creadoEn: "1", estado: "Asignada" });
    const res = await POST(jsonReq({ descripcion: "x", fecha: "2026-07-17", asignadoA: "op@x.com" }), undefined);
    expect(res.status).toBe(201);
    expect(requireAdmin).toHaveBeenCalled();
  });

  it("rechaza si asignadoA no es usuario activo (400)", async () => {
    requireAdmin.mockResolvedValue({ user: { email: "a@x.com", rol: "admin" } });
    vi.mocked(getUsuarios).mockResolvedValue([]);
    const res = await POST(jsonReq({ descripcion: "x", fecha: "2026-07-17", asignadoA: "nadie@x.com" }), undefined);
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Correr — falla.** `npx vitest run tests/api/directivas.test.ts`

- [ ] **Step 3: Implementar `app/api/directivas/route.ts`**

```ts
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/http/withAuth";
import { withAdmin } from "@/lib/http/withAdmin";
import { getDirectivas, appendDirectiva, deleteDirectiva } from "@/lib/sheets/directivas";
import { getUsuarios } from "@/lib/google-sheets";
import { jsonError } from "@/lib/api-utils";
import { directivaNuevaSchema } from "@/lib/schemas";

export const runtime = "nodejs";

export const GET = withAuth(async (_req, session) => {
  const data = session.user.rol === "admin"
    ? await getDirectivas()
    : await getDirectivas(session.user.email);
  return NextResponse.json(data);
});

export const POST = withAdmin(async (req, session) => {
  const body = await req.json();
  const input = directivaNuevaSchema.parse(body);
  const usuarios = await getUsuarios();
  const activo = usuarios.some((u) => u.email === input.asignadoA && u.activo);
  if (!activo) return jsonError(400, `El usuario "${input.asignadoA}" no existe o está inactivo`);
  const d = await appendDirectiva(input, session.user.email);
  return NextResponse.json(d, { status: 201 });
});

export const DELETE = withAdmin(async (req) => {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return jsonError(400, "Falta id");
  await deleteDirectiva(id);
  return NextResponse.json({ ok: true });
});
```

- [ ] **Step 4: Correr — pasa.** `npx vitest run tests/api/directivas.test.ts`
- [ ] **Step 5: Checkpoint** — `npm test && npx tsc --noEmit`. Frenar.

---

### Task 8: `api-client` + helper de nombre + hooks

**Files:**
- Modify: `lib/api-client.ts`
- Create: `lib/user-display.ts`, `lib/user-display.test.ts`
- Create: `hooks/edificios-queries.ts`, `hooks/edificios-queries.test.tsx`

- [ ] **Step 1: Test del helper (falla)** — `lib/user-display.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { displayName } from "./user-display";
import type { Usuario } from "@/types";

const us: Usuario[] = [{ email: "a@x.com", nombre: "Ana", rol: "admin", activo: true, creadoEn: "" }];

describe("displayName", () => {
  it("devuelve el nombre si el email resuelve", () => {
    expect(displayName("A@X.com", us)).toBe("Ana");
  });
  it("cae al email si no resuelve o no hay nombre", () => {
    expect(displayName("z@x.com", us)).toBe("z@x.com");
    expect(displayName("a@x.com", undefined)).toBe("a@x.com");
  });
});
```

- [ ] **Step 2: Correr — falla.** `npx vitest run lib/user-display.test.ts`

- [ ] **Step 3: Implementar `lib/user-display.ts`**

```ts
import type { Usuario } from "@/types";

// Resuelve el email de un usuario a su nombre para mostrar en UI. Fallback: el email.
export function displayName(email: string, usuarios: Usuario[] | undefined): string {
  const target = email.trim().toLowerCase();
  const u = usuarios?.find((x) => x.email.toLowerCase() === target);
  return u?.nombre?.trim() || email;
}
```

- [ ] **Step 4: Sumar al `api` en `lib/api-client.ts`**

Dentro del objeto `api`, agregar (importar tipos `Asignacion`, `Directiva`, `DirectivaNuevaInput` de `@/types`):
```ts
  asignaciones: {
    list: () => request<Asignacion[]>("/api/asignaciones"),
    add: (email: string, edificio: string) =>
      request<Asignacion>("/api/asignaciones", { method: "POST", body: JSON.stringify({ email, edificio }) }),
    remove: (email: string, edificio: string) =>
      request<{ ok: true }>(
        `/api/asignaciones?email=${encodeURIComponent(email)}&edificio=${encodeURIComponent(edificio)}`,
        { method: "DELETE" }
      ),
  },
  directivas: {
    list: () => request<Directiva[]>("/api/directivas"),
    create: (input: DirectivaNuevaInput) =>
      request<Directiva>("/api/directivas", { method: "POST", body: JSON.stringify(input) }),
    remove: (id: string) =>
      request<{ ok: true }>(`/api/directivas?id=${encodeURIComponent(id)}`, { method: "DELETE" }),
  },
```

- [ ] **Step 5: Test de hooks (falla)** — `hooks/edificios-queries.test.tsx`

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/api-client", () => ({
  api: {
    usuarios: { list: vi.fn().mockResolvedValue([{ email: "a@x.com", nombre: "Ana", rol: "admin", activo: true, creadoEn: "" }]) },
    asignaciones: { list: vi.fn().mockResolvedValue([{ email: "a@x.com", edificio: "Garay 350" }]) },
    directivas: { list: vi.fn().mockResolvedValue([]) },
  },
}));
import { useUsuarios, useAsignaciones, useDirectivas } from "./edificios-queries";

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}
beforeEach(() => vi.clearAllMocks());

describe("edificios-queries", () => {
  it("useUsuarios trae la lista", async () => {
    const { result } = renderHook(() => useUsuarios(), { wrapper: wrap() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0].nombre).toBe("Ana");
  });
  it("useAsignaciones trae la lista", async () => {
    const { result } = renderHook(() => useAsignaciones(), { wrapper: wrap() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
  });
  it("useDirectivas trae la lista", async () => {
    const { result } = renderHook(() => useDirectivas(), { wrapper: wrap() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});
```

- [ ] **Step 6: Correr — falla.** `npx vitest run hooks/edificios-queries.test.tsx`

- [ ] **Step 7: Implementar `hooks/edificios-queries.ts`**

```ts
"use client";
import { useCachedQuery } from "./useCachedQuery";
import { api } from "@/lib/api-client";

// La vista Edificios requiere conexión: sin cache offline (cache/readCache opcionales).
export const useUsuarios = () => useCachedQuery({ queryKey: ["usuarios"], fetcher: api.usuarios.list });
export const useAsignaciones = () => useCachedQuery({ queryKey: ["asignaciones"], fetcher: api.asignaciones.list });
export const useDirectivas = () => useCachedQuery({ queryKey: ["directivas"], fetcher: api.directivas.list });
```

- [ ] **Step 8: Correr — pasa.** `npx vitest run hooks/edificios-queries.test.tsx lib/user-display.test.ts`
- [ ] **Step 9: Checkpoint** — `npm test && npx tsc --noEmit`. Frenar.

---

### Task 9: Sidebar + página `/edificios` + `EdificiosView`

**Files:**
- Modify: `components/layout/AppShell.tsx`
- Create: `app/(app)/edificios/page.tsx`
- Create: `components/edificios/EdificiosView.tsx`, `components/edificios/EdificiosView.test.tsx`

- [ ] **Step 1: Test de componente (falla)** — `components/edificios/EdificiosView.test.tsx`

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EdificiosView } from "./EdificiosView";

vi.mock("next-auth/react", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api-client", () => ({
  api: {
    usuarios: { list: vi.fn().mockResolvedValue([
      { email: "admin@x.com", nombre: "Admin", rol: "admin", activo: true, creadoEn: "" },
      { email: "op@x.com", nombre: "Operario Uno", rol: "supervisor", activo: true, creadoEn: "" },
    ]) },
    asignaciones: { list: vi.fn().mockResolvedValue([{ email: "op@x.com", edificio: "Garay 350" }]), add: vi.fn(), remove: vi.fn() },
    directivas: { list: vi.fn().mockResolvedValue([]), create: vi.fn(), remove: vi.fn() },
    edificios: { list: vi.fn().mockResolvedValue([{ nombre: "Garay 350" }]) },
  },
}));
import { useSession } from "next-auth/react";

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><EdificiosView /></QueryClientProvider>);
}
beforeEach(() => vi.clearAllMocks());

describe("EdificiosView", () => {
  it("admin ve a todos los integrantes por nombre", async () => {
    vi.mocked(useSession).mockReturnValue({ data: { user: { email: "admin@x.com", rol: "admin" } } } as never);
    renderView();
    await waitFor(() => expect(screen.getByText("Admin")).toBeInTheDocument());
    expect(screen.getByText("Operario Uno")).toBeInTheDocument();
  });

  it("supervisor ve solo su propia tarjeta", async () => {
    vi.mocked(useSession).mockReturnValue({ data: { user: { email: "op@x.com", rol: "supervisor" } } } as never);
    renderView();
    await waitFor(() => expect(screen.getByText("Operario Uno")).toBeInTheDocument());
    expect(screen.queryByText("Admin")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr — falla.** `npx vitest run components/edificios/EdificiosView.test.tsx`

- [ ] **Step 3: Implementar `components/edificios/EdificiosView.tsx`**

Estructura (seguir el estilo de `UsuariosManager`): usa `useSession`, `useUsuarios`, `useAsignaciones`, `useDirectivas`. Filtra la lista de integrantes según rol y renderiza una `IntegranteCard` por cada uno.

```tsx
"use client";

import { useSession } from "next-auth/react";
import { useMemo } from "react";
import { useUsuarios, useAsignaciones, useDirectivas } from "@/hooks/edificios-queries";
import { IntegranteCard } from "./IntegranteCard";
import type { Usuario } from "@/types";

export function EdificiosView() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.rol === "admin";
  const myEmail = session?.user?.email?.toLowerCase() ?? "";

  const usuariosQ = useUsuarios();
  const asignacionesQ = useAsignaciones();
  const directivasQ = useDirectivas();

  const integrantes = useMemo(() => {
    const all = (usuariosQ.data ?? []).filter((u) => u.activo);
    if (isAdmin) return all;
    return all.filter((u: Usuario) => u.email.toLowerCase() === myEmail);
  }, [usuariosQ.data, isAdmin, myEmail]);

  return (
    <div className="px-4 py-4 md:px-8 md:py-6 max-w-5xl mx-auto w-full">
      <h2 className="text-xl font-semibold text-slate-900">Edificios</h2>
      <p className="text-sm text-slate-600">Edificios y directivas por integrante</p>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        {integrantes.map((u) => (
          <IntegranteCard
            key={u.email}
            usuario={u}
            usuarios={usuariosQ.data}
            asignaciones={(asignacionesQ.data ?? []).filter((a) => a.email.toLowerCase() === u.email.toLowerCase())}
            directivas={(directivasQ.data ?? []).filter((d) => d.asignadoA.toLowerCase() === u.email.toLowerCase())}
            readOnly={!isAdmin}
          />
        ))}
      </div>
    </div>
  );
}
```
> `IntegranteCard` se implementa en la Task 10. Para que este test pase, crear un stub mínimo de `IntegranteCard` que renderice `displayName(usuario.email, usuarios)` (título). Se completa en la próxima task.

Crear stub `components/edificios/IntegranteCard.tsx`:
```tsx
"use client";
import type { Asignacion, Directiva, Usuario } from "@/types";
import { displayName } from "@/lib/user-display";

export function IntegranteCard(props: {
  usuario: Usuario; usuarios: Usuario[] | undefined;
  asignaciones: Asignacion[]; directivas: Directiva[]; readOnly: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="font-medium text-slate-900">{displayName(props.usuario.email, props.usuarios)}</h3>
    </div>
  );
}
```

- [ ] **Step 4: Crear la página `app/(app)/edificios/page.tsx`**

```tsx
import { EdificiosView } from "@/components/edificios/EdificiosView";
export default function EdificiosPage() {
  return <EdificiosView />;
}
```

- [ ] **Step 5: Agregar item al sidebar en `AppShell.tsx`**

Importar `Building2` de `lucide-react` y sumar al array `NAV` (después de "Tareas"):
```ts
{ href: "/edificios", label: "Edificios", Icon: Building2 },
```
(sin `adminOnly`: visible a todos)

- [ ] **Step 6: Correr — pasa.** `npx vitest run components/edificios/EdificiosView.test.tsx`
- [ ] **Step 7: Checkpoint** — `npm test && npx tsc --noEmit`. Frenar.

---

### Task 10: `IntegranteCard` completa + `DirectivaForm`

**Files:**
- Modify: `components/edificios/IntegranteCard.tsx`
- Create: `components/edificios/DirectivaForm.tsx`
- Create: `components/edificios/IntegranteCard.test.tsx`

- [ ] **Step 1: Test (falla)** — `components/edificios/IntegranteCard.test.tsx`

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { IntegranteCard } from "./IntegranteCard";
import type { Usuario } from "@/types";

vi.mock("@/lib/api-client", () => ({
  api: {
    asignaciones: { add: vi.fn().mockResolvedValue({}), remove: vi.fn().mockResolvedValue({}) },
    directivas: { create: vi.fn().mockResolvedValue({}), remove: vi.fn().mockResolvedValue({}) },
    edificios: { list: vi.fn().mockResolvedValue([{ nombre: "Garay 350" }, { nombre: "Belgrano 1429" }]) },
  },
}));

const usuario: Usuario = { email: "op@x.com", nombre: "Operario Uno", rol: "supervisor", activo: true, creadoEn: "" };
function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}
beforeEach(() => vi.clearAllMocks());

describe("IntegranteCard", () => {
  it("admin: muestra edificios asignados y el botón Asignar directiva", () => {
    wrap(<IntegranteCard usuario={usuario} usuarios={[usuario]}
      asignaciones={[{ email: "op@x.com", edificio: "Garay 350" }]} directivas={[]} readOnly={false} />);
    expect(screen.getByText("Operario Uno")).toBeInTheDocument();
    expect(screen.getByText("Garay 350")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /asignar directiva/i })).toBeInTheDocument();
  });

  it("supervisor (readOnly): no muestra acciones de edición", () => {
    wrap(<IntegranteCard usuario={usuario} usuarios={[usuario]}
      asignaciones={[]} directivas={[]} readOnly />);
    expect(screen.queryByRole("button", { name: /asignar directiva/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr — falla.** `npx vitest run components/edificios/IntegranteCard.test.tsx`

- [ ] **Step 3: Implementar `IntegranteCard.tsx`** (reemplaza el stub)

Requisitos: título = `displayName`; lista de edificios con botón quitar (admin); combobox/select para agregar edificio desde `api.edificios.list` (admin); lista de directivas; botón "Asignar directiva" que abre `DirectivaForm` (admin). Usa `useMutation` + `useQueryClient` (invalidar `["asignaciones"]` / `["directivas"]`) como en `UsuariosManager`/`TareaDetalle`. En `readOnly`, ocultar agregar/quitar y el botón.

```tsx
"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { displayName } from "@/lib/user-display";
import type { Asignacion, Directiva, Usuario } from "@/types";
import { Trash2, Plus, ClipboardList } from "lucide-react";
import { DirectivaForm } from "./DirectivaForm";

interface Props {
  usuario: Usuario; usuarios: Usuario[] | undefined;
  asignaciones: Asignacion[]; directivas: Directiva[]; readOnly: boolean;
}

export function IntegranteCard({ usuario, usuarios, asignaciones, directivas, readOnly }: Props) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [nuevoEdificio, setNuevoEdificio] = useState("");

  const edificiosQ = useQuery({ queryKey: ["edificios"], queryFn: api.edificios.list, staleTime: 5 * 60_000, enabled: !readOnly });

  const addM = useMutation({
    mutationFn: (edificio: string) => api.asignaciones.add(usuario.email, edificio),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["asignaciones"] }); setNuevoEdificio(""); },
  });
  const removeM = useMutation({
    mutationFn: (edificio: string) => api.asignaciones.remove(usuario.email, edificio),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["asignaciones"] }),
  });

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
      <h3 className="font-medium text-slate-900">{displayName(usuario.email, usuarios)}</h3>

      {/* Edificios */}
      <div>
        <p className="text-xs font-medium text-slate-500 uppercase">Edificios</p>
        <ul className="mt-1 space-y-1">
          {asignaciones.map((a) => (
            <li key={a.edificio} className="flex items-center justify-between text-sm">
              <span className="text-slate-700">{a.edificio}</span>
              {!readOnly && (
                <button onClick={() => removeM.mutate(a.edificio)} aria-label={`Quitar ${a.edificio}`} className="text-red-600">
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          ))}
          {asignaciones.length === 0 && <li className="text-sm text-slate-400">Sin edificios</li>}
        </ul>
        {!readOnly && (
          <div className="mt-2 flex gap-2">
            <select value={nuevoEdificio} onChange={(e) => setNuevoEdificio(e.target.value)} className="input flex-1">
              <option value="">Agregar edificio…</option>
              {edificiosQ.data?.filter((e) => !asignaciones.some((a) => a.edificio === e.nombre))
                .map((e) => <option key={e.nombre} value={e.nombre}>{e.nombre}</option>)}
            </select>
            <button disabled={!nuevoEdificio || addM.isPending} onClick={() => addM.mutate(nuevoEdificio)}
              className="rounded-lg bg-slate-900 px-3 text-sm text-white disabled:opacity-50">
              <Plus size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Directivas */}
      <div>
        <p className="text-xs font-medium text-slate-500 uppercase">Directivas</p>
        <ul className="mt-1 space-y-1">
          {directivas.map((d) => (
            <li key={d.id} className="text-sm text-slate-700">• {d.descripcion} <span className="text-slate-400">({d.fecha})</span></li>
          ))}
          {directivas.length === 0 && <li className="text-sm text-slate-400">Sin directivas</li>}
        </ul>
        {!readOnly && (
          <button onClick={() => setShowForm((s) => !s)}
            className="mt-2 flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700">
            <ClipboardList size={14} /> Asignar directiva
          </button>
        )}
        {showForm && !readOnly && (
          <DirectivaForm asignadoA={usuario.email} onDone={() => { setShowForm(false); qc.invalidateQueries({ queryKey: ["directivas"] }); }} />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Implementar `components/edificios/DirectivaForm.tsx`**

```tsx
"use client";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { Loader2 } from "lucide-react";

export function DirectivaForm({ asignadoA, onDone }: { asignadoA: string; onDone: () => void }) {
  const [descripcion, setDescripcion] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);

  const createM = useMutation({
    mutationFn: () => api.directivas.create({ descripcion, fecha, asignadoA }),
    onSuccess: onDone,
    onError: (e) => setError(e instanceof Error ? e.message : "Error al crear"),
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (!descripcion.trim()) { setError("Descripción requerida"); return; } createM.mutate(); }}
      className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={2} placeholder="Indicación (ej. Visitar edificio X y crear tareas)" className="input w-full" />
      <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="input w-full" />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex justify-end">
        <button type="submit" disabled={createM.isPending} className="flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-60">
          {createM.isPending && <Loader2 size={14} className="animate-spin" />} Asignar
        </button>
      </div>
    </form>
  );
}
```
> Nota: `DirectivaForm` recibe `asignadoA` ya resuelto (la card lo pasa). El selector "Asignar a" del spec (FR-5) queda implícito: al abrir el form desde la card de un integrante, el asignado es ese integrante. (Si más adelante se quiere un form standalone con selector de usuario, se agrega ahí.)

- [ ] **Step 5: Correr — pasa.** `npx vitest run components/edificios/IntegranteCard.test.tsx`
- [ ] **Step 6: Checkpoint** — `npm test && npx tsc --noEmit`. Frenar.

---

### Task 11: Verificación integral

**Files:** (sin código nuevo)

- [ ] **Step 1: Suite completa** — `npm test` → todo verde.
- [ ] **Step 2: Typecheck** — `npx tsc --noEmit` → sin errores.
- [ ] **Step 3: Lint** — `npm run lint` → sin errores nuevos.
- [ ] **Step 4: Build** — `SERWIST_SUPPRESS_TURBOPACK_WARNING=1 npm run build` → compila.
- [ ] **Step 5: Smoke manual (opcional, requiere Sheet real con los tabs creados):** loguear como admin → /edificios → asignar un edificio y una directiva a un supervisor → loguear como ese supervisor → ver su tarjeta con el edificio y la directiva, en lectura.
- [ ] **Step 6: Checkpoint final** — dejar todo verde. Frenar (commit del usuario en GitLens).

---

## Self-Review (post-write)

### Cobertura del spec
- FR-1..FR-5 (Directivas) → Tasks 1, 4, 7, 10
- FR-6..FR-10 (Asignaciones) → Tasks 1, 3, 6
- FR-11..FR-14 (Vista) → Tasks 9, 10 (+ D7 nombre → Task 8 `displayName`)
- FR-15 (Tarea sin cambios) → no se toca ningún archivo de Tareas (verificado por suite existente en Task 11)
- NFR-5 (permisos server-side) → `withAdmin` (Task 5) aplicado en POST/DELETE de ambas rutas
- AC-1..AC-10 → Tasks 3-10 + verificación Task 11

### Notas de diseño
- El "selector Asignar a" (FR-5) se implementa de forma contextual: se abre el `DirectivaForm` desde la tarjeta del integrante, así el asignado ya está fijado. Cubre el caso de uso (admin asigna a un integrante puntual) sin un dropdown extra. Si se necesita el dropdown standalone, se suma sin cambiar el modelo.
- Se evita testear el path 403 con throw síncrono de spies (artefacto de vitest ya conocido); el gate admin se verifica asegurando que `requireAdmin` es el guard.

### Riesgo/pendiente
- Los tabs `Directivas` y `Asignaciones` deben existir en la Sheet real antes del smoke (Task 11 Step 5). En demo mode, ambos devuelven vacío (sin romper).

---

## Estimación

- Tasks 1-2 (tipos, schemas, core): ~1 h
- Tasks 3-4 (data layer): ~1.5 h
- Tasks 5-7 (wrapper + rutas): ~2 h
- Task 8 (api-client + hooks + helper): ~1 h
- Tasks 9-10 (UI): ~2.5 h
- Task 11 (verificación): ~0.5 h

**Total: ~8-9 h** con TDD estricto.
