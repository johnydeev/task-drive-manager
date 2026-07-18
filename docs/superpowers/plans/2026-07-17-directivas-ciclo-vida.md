# Ciclo de vida de la Directiva (Pieza B) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans o superpowers:subagent-driven-development para implementar este plan task-by-task. Los steps usan checkbox (`- [ ]`).

> **⚠️ Convención de commits (regla global del usuario):** Claude **NUNCA ejecuta `git commit`** ni prepara staging ni sugiere mensajes. Al cerrar cada task se deja el árbol **verde** (suite + tsc) y se frena; el commit lo hace el usuario en GitLens. Donde el template diría "Commit", acá dice **"Checkpoint"**.

**Spec asociado:** [`docs/superpowers/specs/2026-07-17-directivas-ciclo-vida.md`](../specs/2026-07-17-directivas-ciclo-vida.md) — leer primero.

**Goal:** Dar ciclo de vida a la Directiva: el operario la acepta y la cierra con una nota; el admin puede objetar (reabre); a las 72 h sin objeción se muestra `Cerrada` (cómputo on-read).

**Architecture:** La Directiva suma columnas de timestamps/notas (H–L). Las transiciones se hacen con un `PATCH /api/directivas` que valida estado de origen y permisos server-side (`asignadoA` para aceptar/cerrar, admin para objetar). El estado `Cerrada` es **derivado** en `getDirectivas` (Realizada + >72 h), nunca se persiste. La UI de la tarjeta del integrante (vista Edificios de la Pieza A) suma las acciones según estado y rol.

**Tech Stack:** Next 16, React 19, TypeScript, Zod, TanStack Query, Vitest + Testing Library, googleapis.

**Requisito manual previo (usuario):** agregar en la pestaña `Directivas` los headers `aceptadaEn | realizadaEn | notaCierre | objetadaEn | notaObjecion` en las columnas **H–L**.

---

## File Structure

### Modificar
| Archivo | Cambio |
|---|---|
| `types/index.ts` | `DirectivaEstado` (+`Cerrada`), campos nuevos en `Directiva`, `DirectivaPatchInput` |
| `lib/directivas-estado.ts` (nuevo, +`.test.ts`) | `estadoEfectivo(d, now)` — cómputo del `Cerrada` derivado |
| `lib/sheets/directivas.ts` (+`.test.ts`) | leer/escribir cols H–L; `updateDirectiva(id, patch)`; aplicar `estadoEfectivo` en `getDirectivas` |
| `lib/schemas.ts` | `directivaPatchSchema` |
| `app/api/directivas/route.ts` (+ test) | `PATCH` con acciones aceptar/cerrar/objetar |
| `lib/api-client.ts` | `api.directivas.patch(...)` |
| `components/edificios/IntegranteCard.tsx` (+`.test.tsx`) | badge de estado + acciones (aceptar/cerrar/objetar) por rol |
| `components/edificios/DirectivaItem.tsx` (nuevo) | fila de una directiva con su estado y acciones |

---

## Tasks

### Task 1: Tipos + cómputo `estadoEfectivo`

**Files:**
- Modify: `types/index.ts`
- Create: `lib/directivas-estado.ts`, `lib/directivas-estado.test.ts`

- [ ] **Step 1: Test (falla)** — `lib/directivas-estado.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { estadoEfectivo, HORAS_72_MS } from "./directivas-estado";
import type { Directiva } from "@/types";

const base: Directiva = {
  id: "1", descripcion: "x", fecha: "2026-07-17", asignadoA: "op@x.com",
  creadoPor: "a@x.com", creadoEn: "2026-07-17T00:00:00.000Z", estado: "Realizada",
};
const NOW = new Date("2026-07-20T12:00:00.000Z").getTime();

describe("estadoEfectivo", () => {
  it("Realizada + >72h desde realizadaEn => Cerrada", () => {
    const d = { ...base, realizadaEn: new Date(NOW - HORAS_72_MS - 1000).toISOString() };
    expect(estadoEfectivo(d, NOW)).toBe("Cerrada");
  });
  it("Realizada dentro de 72h => sigue Realizada", () => {
    const d = { ...base, realizadaEn: new Date(NOW - 1000).toISOString() };
    expect(estadoEfectivo(d, NOW)).toBe("Realizada");
  });
  it("no-Realizada nunca se cierra por tiempo", () => {
    expect(estadoEfectivo({ ...base, estado: "Aceptada", aceptadaEn: new Date(0).toISOString() }, NOW)).toBe("Aceptada");
    expect(estadoEfectivo({ ...base, estado: "Asignada" }, NOW)).toBe("Asignada");
  });
  it("Realizada sin realizadaEn => no cierra (defensivo)", () => {
    expect(estadoEfectivo({ ...base, realizadaEn: undefined }, NOW)).toBe("Realizada");
  });
});
```

- [ ] **Step 2: Correr — falla.** `npx vitest run lib/directivas-estado.test.ts`

- [ ] **Step 3: Ampliar tipos en `types/index.ts`**

Reemplazar el `DirectivaEstado` actual y ampliar `Directiva`:
```ts
export type DirectivaEstado = "Asignada" | "Aceptada" | "Realizada" | "Cerrada";

export interface Directiva {
  id: string;
  descripcion: string;
  fecha: string;
  asignadoA: string;
  creadoPor: string;
  creadoEn: string;
  estado: DirectivaEstado;
  aceptadaEn?: string;
  realizadaEn?: string;
  notaCierre?: string;
  objetadaEn?: string;
  notaObjecion?: string;
}

export interface DirectivaPatchInput {
  id: string;
  accion: "aceptar" | "cerrar" | "objetar";
  nota?: string;
}
```

- [ ] **Step 4: Implementar `lib/directivas-estado.ts`**

```ts
import type { Directiva, DirectivaEstado } from "@/types";

export const HORAS_72_MS = 72 * 60 * 60 * 1000;

// Estado efectivo (derivado). Una directiva Realizada que superó las 72h desde su
// cierre se considera Cerrada. No hay persistencia: es puro cómputo on-read.
export function estadoEfectivo(d: Directiva, now: number = Date.now()): DirectivaEstado {
  if (d.estado === "Realizada" && d.realizadaEn) {
    const t = new Date(d.realizadaEn).getTime();
    if (!Number.isNaN(t) && now - t > HORAS_72_MS) return "Cerrada";
  }
  return d.estado;
}
```

- [ ] **Step 5: Correr — pasa.** `npx vitest run lib/directivas-estado.test.ts`
- [ ] **Step 6: Checkpoint** — `npm test && npx tsc --noEmit`. Frenar.

---

### Task 2: `lib/sheets/directivas` — cols H–L, `updateDirectiva`, estado efectivo

**Files:**
- Modify: `lib/sheets/directivas.ts`
- Modify: `lib/sheets/directivas.test.ts`

- [ ] **Step 1: Ampliar el test (falla)** — agregar a `lib/sheets/directivas.test.ts`

```ts
import { updateDirectiva } from "./directivas";

// helper: fila completa A–L
const rowFull = (over: Partial<Record<string, string>> = {}) => [
  over.id ?? "2026-07-17T10:00:00.000Z", "desc", "2026-07-17",
  over.asignadoA ?? "op@x.com", "admin@x.com", "2026-07-17T10:00:00.000Z",
  over.estado ?? "Aceptada",
  over.aceptadaEn ?? "", over.realizadaEn ?? "", over.notaCierre ?? "",
  over.objetadaEn ?? "", over.notaObjecion ?? "",
];

describe("getDirectivas — estado efectivo", () => {
  it("mapea las columnas H–L y aplica Cerrada si Realizada venció 72h", async () => {
    const viejo = new Date(Date.now() - 100 * 60 * 60 * 1000).toISOString();
    valuesGet.mockResolvedValue({ data: { values: [
      rowFull({ estado: "Realizada", realizadaEn: viejo, notaCierre: "listo" }),
    ] } });
    const [d] = await getDirectivas();
    expect(d.notaCierre).toBe("listo");
    expect(d.estado).toBe("Cerrada"); // derivado
  });
});

describe("updateDirectiva", () => {
  it("mergea el patch y escribe la fila A–L con update", async () => {
    valuesGet.mockResolvedValue({ data: { values: [rowFull({ estado: "Asignada" })] } });
    spreadsheetsGet.mockResolvedValue({ data: { sheets: [{ properties: { sheetId: 66, title: "Directivas" } }] } });
    const upd = await updateDirectiva("2026-07-17T10:00:00.000Z", { estado: "Aceptada", aceptadaEn: "2026-07-18T00:00:00.000Z" });
    expect(upd?.estado).toBe("Aceptada");
    // se escribió con update en el rango de la fila (fila 2 -> A2:L2)
    const call = (await import("googleapis")) as unknown as { __u?: unknown };
    void call;
  });
});
```
> Nota: el mock de `googleapis` de este archivo debe exponer `values.update`. Cambiar `update: vi.fn()` por un spy accesible: agregá `valuesUpdate` al `vi.hoisted(...)` y usalo en el mock (`values: { get: valuesGet, append: valuesAppend, update: valuesUpdate }`), y en el test de `updateDirectiva` afirmá `expect(valuesUpdate).toHaveBeenCalledWith(expect.objectContaining({ range: "Directivas!A2:L2" }))`.

- [ ] **Step 2: Correr — falla.** `npx vitest run lib/sheets/directivas.test.ts`

- [ ] **Step 3: Modificar `lib/sheets/directivas.ts`**

Ampliar `rowToDirectiva` (leer H–L, índices 7–11), aplicar `estadoEfectivo` en `getDirectivas`, escribir A–L en `appendDirectiva`, y sumar `updateDirectiva`:

```ts
import { getSheetId } from "../google-auth";
import { isDemoMode } from "../demo-mode";
import type { Directiva, DirectivaNuevaInput } from "@/types";
import { getSheets, readRange, SHEETS, getSheetGid } from "./core";
import { estadoEfectivo } from "../directivas-estado";

function rowToDirectiva(r: string[]): Directiva {
  return {
    id: r[0] ?? "",
    descripcion: r[1] ?? "",
    fecha: r[2] ?? "",
    asignadoA: (r[3] ?? "").trim().toLowerCase(),
    creadoPor: (r[4] ?? "").trim().toLowerCase(),
    creadoEn: r[5] ?? "",
    estado: (r[6] as Directiva["estado"]) || "Asignada",
    aceptadaEn: r[7] || undefined,
    realizadaEn: r[8] || undefined,
    notaCierre: r[9] || undefined,
    objetadaEn: r[10] || undefined,
    notaObjecion: r[11] || undefined,
  };
}

function directivaToRow(d: Directiva): string[] {
  return [
    d.id, d.descripcion, d.fecha, d.asignadoA, d.creadoPor, d.creadoEn,
    // se guarda el estado base, nunca "Cerrada" (derivado)
    d.estado === "Cerrada" ? "Realizada" : d.estado,
    d.aceptadaEn ?? "", d.realizadaEn ?? "", d.notaCierre ?? "",
    d.objetadaEn ?? "", d.notaObjecion ?? "",
  ];
}

export async function getDirectivas(email?: string): Promise<Directiva[]> {
  if (isDemoMode()) return [];
  const rows = await readRange(`${SHEETS.directivas}!A2:L`);
  const now = Date.now();
  const all = rows
    .filter((r) => r[0])
    .map((r) => {
      const d = rowToDirectiva(r);
      return { ...d, estado: estadoEfectivo(d, now) };
    });
  if (!email) return all;
  const target = email.trim().toLowerCase();
  return all.filter((d) => d.asignadoA === target);
}

export async function appendDirectiva(input: DirectivaNuevaInput, creadoPor: string): Promise<Directiva> {
  const now = new Date().toISOString();
  const directiva: Directiva = {
    id: now, descripcion: input.descripcion, fecha: input.fecha,
    asignadoA: input.asignadoA.trim().toLowerCase(),
    creadoPor: creadoPor.trim().toLowerCase(), creadoEn: now, estado: "Asignada",
  };
  if (isDemoMode()) return directiva;
  await getSheets().spreadsheets.values.append({
    spreadsheetId: getSheetId(),
    range: `${SHEETS.directivas}!A:L`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [directivaToRow(directiva)] },
  });
  return directiva;
}

// Lee la fila cruda de una directiva por id, junto con su número de fila.
async function findDirectivaRow(id: string): Promise<{ d: Directiva; rowNumber: number } | null> {
  const rows = await readRange(`${SHEETS.directivas}!A2:L`);
  const idx = rows.findIndex((r) => (r[0] ?? "") === id);
  if (idx === -1) return null;
  return { d: rowToDirectiva(rows[idx]), rowNumber: idx + 2 };
}

export async function updateDirectiva(id: string, patch: Partial<Directiva>): Promise<Directiva | null> {
  if (isDemoMode()) return null;
  const found = await findDirectivaRow(id);
  if (!found) return null;
  const merged: Directiva = { ...found.d, ...patch, id: found.d.id };
  await getSheets().spreadsheets.values.update({
    spreadsheetId: getSheetId(),
    range: `${SHEETS.directivas}!A${found.rowNumber}:L${found.rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [directivaToRow(merged)] },
  });
  return merged;
}
```
> `deleteDirectiva` no cambia (ya usa `A2:G` para encontrar el id; ampliarlo a `A2:L` es opcional — el id está en la col A igual). Dejarlo como está o ampliar el range a `A2:L` por consistencia.

- [ ] **Step 4: Correr — pasa.** `npx vitest run lib/sheets/directivas.test.ts`
- [ ] **Step 5: Checkpoint** — `npm test && npx tsc --noEmit`. Frenar.

---

### Task 3: `directivaPatchSchema`

**Files:**
- Modify: `lib/schemas.ts`
- Modify: `tests/lib/schemas.test.ts`

- [ ] **Step 1: Test (falla)** — agregar a `tests/lib/schemas.test.ts`

```ts
import { directivaPatchSchema } from "@/lib/schemas";

describe("directivaPatchSchema", () => {
  it("acepta una acción válida", () => {
    expect(directivaPatchSchema.safeParse({ id: "1", accion: "aceptar" }).success).toBe(true);
  });
  it("rechaza acción inválida", () => {
    expect(directivaPatchSchema.safeParse({ id: "1", accion: "xx" }).success).toBe(false);
  });
  it("acepta nota opcional", () => {
    const r = directivaPatchSchema.parse({ id: "1", accion: "cerrar", nota: "listo" });
    expect(r.nota).toBe("listo");
  });
});
```

- [ ] **Step 2: Correr — falla.** `npx vitest run tests/lib/schemas.test.ts`

- [ ] **Step 3: Agregar en `lib/schemas.ts`**

```ts
export const directivaPatchSchema = z.object({
  id: z.string().min(1),
  accion: z.enum(["aceptar", "cerrar", "objetar"]),
  nota: z.string().optional(),
});
```

- [ ] **Step 4: Correr — pasa.** `npx vitest run tests/lib/schemas.test.ts`
- [ ] **Step 5: Checkpoint** — `npm test && npx tsc --noEmit`. Frenar.

---

### Task 4: `PATCH /api/directivas`

**Files:**
- Modify: `app/api/directivas/route.ts`
- Modify: `tests/api/directivas.test.ts`

- [ ] **Step 1: Ampliar el test (falla)** — agregar a `tests/api/directivas.test.ts`

Sumar al mock de `@/lib/sheets/directivas`: `getDirectivaById: vi.fn(), updateDirectiva: vi.fn()`. (Ver Step 3: el route necesita leer la directiva actual por id para validar estado/dueño — se expone `getDirectivaById`.)

```ts
import { PATCH } from "@/app/api/directivas/route";
import { getDirectivaById, updateDirectiva } from "@/lib/sheets/directivas";

const patchReq = (body: unknown) =>
  new Request("http://localhost/api/directivas", {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }) as unknown as NextRequest;

describe("PATCH /api/directivas", () => {
  it("aceptar: el asignado mueve Asignada→Aceptada", async () => {
    requireSession.mockResolvedValue({ user: { email: "op@x.com", rol: "supervisor" } });
    vi.mocked(getDirectivaById).mockResolvedValue({ id: "1", descripcion: "x", fecha: "2026-07-17", asignadoA: "op@x.com", creadoPor: "a@x.com", creadoEn: "1", estado: "Asignada" });
    vi.mocked(updateDirectiva).mockResolvedValue({ id: "1", descripcion: "x", fecha: "2026-07-17", asignadoA: "op@x.com", creadoPor: "a@x.com", creadoEn: "1", estado: "Aceptada" });
    const res = await PATCH(patchReq({ id: "1", accion: "aceptar" }), undefined);
    expect(res.status).toBe(200);
    expect(vi.mocked(updateDirectiva)).toHaveBeenCalledWith("1", expect.objectContaining({ estado: "Aceptada" }));
  });

  it("aceptar: un no-asignado → 403", async () => {
    requireSession.mockResolvedValue({ user: { email: "otro@x.com", rol: "supervisor" } });
    vi.mocked(getDirectivaById).mockResolvedValue({ id: "1", descripcion: "x", fecha: "2026-07-17", asignadoA: "op@x.com", creadoPor: "a@x.com", creadoEn: "1", estado: "Asignada" });
    const res = await PATCH(patchReq({ id: "1", accion: "aceptar" }), undefined);
    expect(res.status).toBe(403);
  });

  it("cerrar: requiere nota", async () => {
    requireSession.mockResolvedValue({ user: { email: "op@x.com", rol: "supervisor" } });
    vi.mocked(getDirectivaById).mockResolvedValue({ id: "1", descripcion: "x", fecha: "2026-07-17", asignadoA: "op@x.com", creadoPor: "a@x.com", creadoEn: "1", estado: "Aceptada" });
    const res = await PATCH(patchReq({ id: "1", accion: "cerrar" }), undefined);
    expect(res.status).toBe(400);
  });

  it("objetar: un no-admin → 403", async () => {
    requireSession.mockResolvedValue({ user: { email: "op@x.com", rol: "supervisor" } });
    vi.mocked(getDirectivaById).mockResolvedValue({ id: "1", descripcion: "x", fecha: "2026-07-17", asignadoA: "op@x.com", creadoPor: "a@x.com", creadoEn: "1", estado: "Realizada", realizadaEn: new Date().toISOString() });
    const res = await PATCH(patchReq({ id: "1", accion: "objetar", nota: "rehacer" }), undefined);
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Correr — falla.** `npx vitest run tests/api/directivas.test.ts`

- [ ] **Step 3: Agregar `getDirectivaById` a `lib/sheets/directivas.ts`**

```ts
export async function getDirectivaById(id: string): Promise<Directiva | null> {
  if (isDemoMode()) return null;
  const rows = await readRange(`${SHEETS.directivas}!A2:L`);
  const r = rows.find((row) => (row[0] ?? "") === id);
  if (!r) return null;
  const d = rowToDirectiva(r);
  return { ...d, estado: estadoEfectivo(d, Date.now()) };
}
```

- [ ] **Step 4: Agregar el `PATCH` en `app/api/directivas/route.ts`**

Importar `withAuth`, `updateDirectiva`, `getDirectivaById`, `directivaPatchSchema`, `estadoEfectivo`, `jsonError`. El PATCH usa `withAuth` (no `withAdmin`: la acción define el permiso):

```ts
export const PATCH = withAuth(async (req, session) => {
  const body = await req.json();
  const { id, accion, nota } = directivaPatchSchema.parse(body);
  const d = await getDirectivaById(id);
  if (!d) return jsonError(404, "Directiva no encontrada");

  const esAsignado = d.asignadoA === session.user.email.toLowerCase();
  const esAdmin = session.user.rol === "admin";

  if (accion === "aceptar") {
    if (!esAsignado) return jsonError(403, "Solo el asignado puede aceptar");
    if (d.estado !== "Asignada") return jsonError(409, "La directiva no está en estado Asignada");
    const upd = await updateDirectiva(id, { estado: "Aceptada", aceptadaEn: new Date().toISOString() });
    return NextResponse.json(upd);
  }

  if (accion === "cerrar") {
    if (!esAsignado) return jsonError(403, "Solo el asignado puede cerrar");
    if (d.estado !== "Aceptada") return jsonError(409, "La directiva no está en estado Aceptada");
    if (!nota || !nota.trim()) return jsonError(400, "La nota de cierre es requerida");
    const upd = await updateDirectiva(id, { estado: "Realizada", realizadaEn: new Date().toISOString(), notaCierre: nota.trim() });
    return NextResponse.json(upd);
  }

  // objetar
  if (!esAdmin) return jsonError(403, "Solo el admin puede objetar");
  // getDirectivaById ya aplicó estadoEfectivo: si venció (Cerrada) no se puede objetar.
  if (d.estado !== "Realizada") return jsonError(409, "Solo se puede objetar una directiva Realizada dentro de las 72 h");
  if (!nota || !nota.trim()) return jsonError(400, "La nota de objeción es requerida");
  const upd = await updateDirectiva(id, { estado: "Aceptada", objetadaEn: new Date().toISOString(), notaObjecion: nota.trim() });
  return NextResponse.json(upd);
});
```
> Como `getDirectivaById` devuelve el estado efectivo, una directiva que ya venció las 72 h llega como `Cerrada` y el `objetar` cae en el 409 (no es `Realizada`). Eso implementa el rechazo de objeción fuera de plazo (AC-5).

- [ ] **Step 5: Correr — pasa.** `npx vitest run tests/api/directivas.test.ts`
- [ ] **Step 6: Checkpoint** — `npm test && npx tsc --noEmit`. Frenar.

---

### Task 5: `api-client` — `patch`

**Files:**
- Modify: `lib/api-client.ts`

- [ ] **Step 1: Agregar al bloque `directivas` del `api`**

Importar `DirectivaPatchInput` de `@/types` y sumar:
```ts
    patch: (input: DirectivaPatchInput) =>
      request<Directiva>("/api/directivas", { method: "PATCH", body: JSON.stringify(input) }),
```

- [ ] **Step 2: Checkpoint** — `npx tsc --noEmit` en verde (se ejercita en la UI de la Task 6). Frenar.

---

### Task 6: UI — acciones en la tarjeta del integrante

**Files:**
- Create: `components/edificios/DirectivaItem.tsx`
- Modify: `components/edificios/IntegranteCard.tsx`
- Modify: `components/edificios/IntegranteCard.test.tsx`

- [ ] **Step 1: Ampliar el test (falla)** — agregar a `components/edificios/IntegranteCard.test.tsx`

Sumar `patch: vi.fn().mockResolvedValue({})` al mock de `api.directivas`.

```ts
it("operario ve Aceptar sobre una directiva Asignada propia", () => {
  wrap(
    <IntegranteCard
      usuario={usuario} usuarios={[usuario]} asignaciones={[]}
      directivas={[{ id: "1", descripcion: "x", fecha: "2026-07-17", asignadoA: "op@x.com", creadoPor: "a@x.com", creadoEn: "1", estado: "Asignada" }]}
      readOnly /* readOnly = no-admin (su propia tarjeta) */
    />
  );
  expect(screen.getByRole("button", { name: /aceptar/i })).toBeInTheDocument();
});

it("admin ve Objetar sobre una directiva Realizada", () => {
  wrap(
    <IntegranteCard
      usuario={usuario} usuarios={[usuario]} asignaciones={[]}
      directivas={[{ id: "1", descripcion: "x", fecha: "2026-07-17", asignadoA: "op@x.com", creadoPor: "a@x.com", creadoEn: "1", estado: "Realizada", realizadaEn: "2026-07-17T00:00:00.000Z", notaCierre: "listo" }]}
      readOnly={false}
    />
  );
  expect(screen.getByRole("button", { name: /objetar/i })).toBeInTheDocument();
});
```
> Aclaración de props: en la vista, `readOnly` = "no soy admin". Para el operario sobre SUS directivas, las acciones de aceptar/cerrar deben mostrarse aunque `readOnly` sea true. Por eso `DirectivaItem` recibe flags explícitas: `puedeOperar` (soy el asignado) y `esAdmin`. `IntegranteCard` las calcula. **Actualizar la firma**: `IntegranteCard` recibe además `currentEmail` y `isAdmin` desde `EdificiosView` (pasarlos como props; hoy la card infiere `readOnly` — sumamos estos dos y derivamos las acciones).

- [ ] **Step 2: Correr — falla.** `npx vitest run components/edificios/IntegranteCard.test.tsx`

- [ ] **Step 3: Crear `components/edificios/DirectivaItem.tsx`**

```tsx
"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { Directiva } from "@/types";

const badge: Record<string, string> = {
  Asignada: "bg-slate-100 text-slate-700",
  Aceptada: "bg-blue-100 text-blue-800",
  Realizada: "bg-amber-100 text-amber-800",
  Cerrada: "bg-emerald-100 text-emerald-800",
};

export function DirectivaItem({ d, puedeOperar, esAdmin }: { d: Directiva; puedeOperar: boolean; esAdmin: boolean }) {
  const qc = useQueryClient();
  const [nota, setNota] = useState("");
  const [modo, setModo] = useState<null | "cerrar" | "objetar">(null);
  const m = useMutation({
    mutationFn: (v: { accion: "aceptar" | "cerrar" | "objetar"; nota?: string }) =>
      api.directivas.patch({ id: d.id, accion: v.accion, nota: v.nota }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["directivas"] }); setModo(null); setNota(""); },
  });

  return (
    <li className="rounded-lg border border-slate-200 p-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-slate-700">{d.descripcion} <span className="text-slate-400">({d.fecha})</span></span>
        <span className={`rounded-full px-2 py-0.5 text-xs ${badge[d.estado] ?? ""}`}>{d.estado}</span>
      </div>
      {d.notaObjecion && d.estado === "Aceptada" && (
        <p className="mt-1 text-xs text-red-600">Objetada: {d.notaObjecion}</p>
      )}
      {esAdmin && d.notaCierre && <p className="mt-1 text-xs text-slate-500">Nota de cierre: {d.notaCierre}</p>}

      {/* Acciones del operario asignado */}
      {puedeOperar && d.estado === "Asignada" && (
        <button onClick={() => m.mutate({ accion: "aceptar" })} className="mt-2 rounded bg-slate-900 px-2 py-1 text-xs text-white">Aceptar</button>
      )}
      {puedeOperar && d.estado === "Aceptada" && modo !== "cerrar" && (
        <button onClick={() => setModo("cerrar")} className="mt-2 rounded border border-slate-300 px-2 py-1 text-xs">Cerrar con nota</button>
      )}
      {/* Acción del admin */}
      {esAdmin && d.estado === "Realizada" && modo !== "objetar" && (
        <button onClick={() => setModo("objetar")} className="mt-2 rounded border border-red-300 px-2 py-1 text-xs text-red-700">Objetar</button>
      )}

      {modo && (
        <div className="mt-2 space-y-1">
          <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} placeholder={modo === "cerrar" ? "Nota de cierre" : "Motivo de la objeción"} className="input w-full" />
          <div className="flex justify-end gap-2">
            <button onClick={() => setModo(null)} className="rounded border border-slate-300 px-2 py-1 text-xs">Cancelar</button>
            <button disabled={!nota.trim() || m.isPending} onClick={() => m.mutate({ accion: modo, nota })} className="rounded bg-slate-900 px-2 py-1 text-xs text-white disabled:opacity-50">
              {modo === "cerrar" ? "Cerrar" : "Objetar"}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
```

- [ ] **Step 4: Usar `DirectivaItem` en `IntegranteCard`** y sumar props `currentEmail`/`isAdmin`

En `IntegranteCard`, reemplazar la lista simple de directivas por `<DirectivaItem>` calculando `puedeOperar = usuario.email === currentEmail` y `esAdmin = isAdmin`. Sumar a `Props`: `currentEmail: string; isAdmin: boolean;`. En `EdificiosView`, pasar `currentEmail={myEmail}` e `isAdmin={isAdmin}` a cada `IntegranteCard`.

- [ ] **Step 5: Actualizar `EdificiosView.test.tsx`** si hace falta (los props nuevos no rompen los asserts actuales; agregar `currentEmail`/`isAdmin` es interno).

- [ ] **Step 6: Correr — pasa.** `npx vitest run components/edificios/`
- [ ] **Step 7: Checkpoint** — `npm test && npx tsc --noEmit`. Frenar.

---

### Task 7: Verificación integral

**Files:** (sin código nuevo)

- [ ] **Step 1: Suite** — `npm test` → verde.
- [ ] **Step 2: Typecheck** — `npx tsc --noEmit`.
- [ ] **Step 3: Lint** — `npm run lint`.
- [ ] **Step 4: Build** — `SERWIST_SUPPRESS_TURBOPACK_WARNING=1 npm run build`.
- [ ] **Step 5: Smoke (opcional, con cols H–L creadas):** admin asigna directiva → operario Acepta → Cierra con nota → admin ve la nota y Objeta (reabre) → operario re-cierra → esperar/mockear 72 h → aparece `Cerrada`.
- [ ] **Step 6: Checkpoint final** — todo verde. Frenar (commit del usuario).

---

## Self-Review (post-write)

### Cobertura del spec
- FR-1..FR-4 (endpoint + transiciones + permisos) → Tasks 3, 4
- FR-5, FR-6 (estado efectivo / no cierra si no Realizada) → Tasks 1, 2
- FR-7 (visibilidad) → sin cambios (heredada de A; `getDirectivas(email)` intacto)
- FR-8..FR-11 (UI) → Task 6
- NFR-3 (permisos server-side) → Task 4; NFR-4 (sin escritura on-read) → Task 2 (`getDirectivas` no escribe)
- AC-1..AC-9 → Tasks 1-6 + verificación Task 7

### Consistencia de tipos
- `Directiva` ampliada (Task 1) usada en data layer (Task 2), route (Task 4), api-client (Task 5), UI (Task 6).
- `estadoEfectivo` (Task 1) reutilizada en `getDirectivas` y `getDirectivaById` (Tasks 2, 4).
- `DirectivaPatchInput` (Task 1) usado en schema (Task 3), api-client (Task 5), UI (Task 6).

### Notas
- El PATCH usa `withAuth` (no `withAdmin`) porque el permiso depende de la acción; se valida `asignadoA`/admin dentro del handler.
- El rechazo de objeción fuera de plazo se apoya en que `getDirectivaById` ya devuelve `Cerrada` (derivado) → cae en el 409.

---

## Estimación

- Task 1 (tipos + cómputo): ~0.5 h
- Task 2 (data layer H–L + update): ~1.5 h
- Tasks 3-4 (schema + PATCH): ~1.5 h
- Task 5 (api-client): ~0.2 h
- Task 6 (UI): ~2 h
- Task 7 (verificación): ~0.5 h

**Total: ~6 h** con TDD estricto.
