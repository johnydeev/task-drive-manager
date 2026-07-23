# Features chicas (bullets, estados, Partes Comunes) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (F1) bullets de edificio que linkean al listado de tareas filtrado + hover; (F2) ✓ verde en directivas/tareas realizadas; (F3) partes comunes en su propia hoja `Partes Comunes` con alta admin-only vía botón `+`.

**Architecture:** F1/F2 son cambios de UI. F3 agrega una hoja `Partes Comunes` (id, nombre), un módulo de datos `lib/sheets/partes-comunes.ts` (lectura por header + append con nanoid/unicidad), endpoints `GET`(auth)/`POST`(admin), y repunta el dropdown del form.

**Tech Stack:** Next.js 16 (App Router) · TanStack Query · Zod · Dexie (offline) · Vitest + RTL · Google Sheets.

**Spec:** [`../specs/2026-07-23-features-bullets-estados-partes-comunes-design.md`](../specs/2026-07-23-features-bullets-estados-partes-comunes-design.md)

> **Commits:** los hace Jony con GitLens. "Punto de commit" = checkpoint donde frenar. NO ejecutar `git commit`.
> **Verificación estándar (VS):** `npx vitest run` + `npx tsc --noEmit` + `npm run lint`. El `build` corre al final (Task 6).
> **Prerrequisito manual (Jony):** la hoja `Partes Comunes` ya existe (headers `id`, `nombre`); poblarla a mano con las partes comunes actuales de `Dptos`.

---

## Task 1: F1 — Bullets de edificio → link + hover

**Files:**
- Modify: `components/edificios/IntegranteCard.tsx`
- Modify: `app/(app)/tareas/page.tsx`
- Test: `components/edificios/IntegranteCard.test.tsx`

- [ ] **Step 1: Test que falla — `IntegranteCard.test.tsx`**

Agregar dentro de `describe("IntegranteCard", ...)`:

```tsx
it("el edificio asignado es un link al listado de tareas de ese edificio", () => {
  wrap(
    <IntegranteCard
      usuario={usuario}
      usuarios={[usuario]}
      asignaciones={[{ email: "op@x.com", edificio: "Garay 350" }]}
      directivas={[]}
      readOnly={false}
      currentEmail="admin@x.com"
      isAdmin
    />
  );
  expect(screen.getByRole("link", { name: "Garay 350" })).toHaveAttribute(
    "href",
    "/tareas?edificio=Garay%20350"
  );
});
```

- [ ] **Step 2: Correr — falla.** `npx vitest run components/edificios/IntegranteCard.test.tsx` (no hay link todavía).

- [ ] **Step 3: Implementar — `IntegranteCard.tsx`**

Agregar el import de `Link` arriba:

```tsx
import Link from "next/link";
```

Reemplazar el contenido del `<span>` del edificio (el nombre `{a.edificio}` suelto) por un `Link` con hover, dejando la `X` como está:

```tsx
          {asignaciones.map((a) => (
            <span
              key={a.edificio}
              className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
            >
              <Link
                href={`/tareas?edificio=${encodeURIComponent(a.edificio)}`}
                className="rounded px-0.5 transition-colors hover:bg-slate-200 hover:text-slate-900"
              >
                {a.edificio}
              </Link>
              {!readOnly && (
                <button
                  onClick={() => removeM.mutate(a.edificio)}
                  disabled={removeM.isPending && removeM.variables === a.edificio}
                  aria-label={`Quitar ${a.edificio}`}
                  className="-mr-0.5 ml-0.5 text-slate-400 hover:text-red-600 disabled:opacity-50"
                >
                  {removeM.isPending && removeM.variables === a.edificio ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <X size={12} />
                  )}
                </button>
              )}
            </span>
          ))}
```

- [ ] **Step 4: Correr — pasa.**

- [ ] **Step 5: `/tareas` lee el query param — `app/(app)/tareas/page.tsx`**

Importar `useSearchParams` e inicializar el filtro `edificio` desde la URL:

```tsx
import { useSearchParams } from "next/navigation";
// ...dentro del componente, al principio (antes de los otros useState):
  const searchParams = useSearchParams();
  const [edificio, setEdificio] = useState<string>(searchParams.get("edificio") ?? "");
```

Quitar la línea vieja `const [edificio, setEdificio] = useState<string>("");` (queda reemplazada por la de arriba).

- [ ] **Step 6: Verificar** — `npx tsc --noEmit` (PASS). Nota: la lectura del param se valida en E2E (abrir un edificio desde la tarjeta y ver el listado filtrado).

> **Contingencia:** `/tareas` es una ruta **dinámica** (`ƒ` en el build), así que `useSearchParams` no debería exigir Suspense. Si el `npm run build` (Task 6) igual se queja de *"useSearchParams() should be wrapped in a suspense boundary"*, envolver el contenido de la page en `<Suspense fallback={null}>` (extraer el cuerpo a un componente interno `TareasInner` y que el default export lo renderice dentro de `<Suspense>`).

- [ ] **Step 7: Punto de commit** — `feat(edificios): el edificio de la tarjeta linkea al listado filtrado`.

---

## Task 2: F2 — ✓ verde en directivas/tareas realizadas

**Files:**
- Modify: `components/edificios/DirectivaItem.tsx`
- Modify: `app/(app)/tareas/page.tsx`
- Test: `components/edificios/IntegranteCard.test.tsx`

- [ ] **Step 1: Test que falla — `IntegranteCard.test.tsx`**

Agregar:

```tsx
it("una directiva Realizada muestra el ✓ verde; una Asignada no", () => {
  const { rerender } = wrap(
    <IntegranteCard
      usuario={usuario} usuarios={[usuario]} asignaciones={[]}
      directivas={[dir({ estado: "Realizada", realizadaEn: "2026-07-17T00:00:00.000Z" })]}
      readOnly currentEmail="op@x.com" isAdmin={false}
    />
  );
  expect(screen.getByLabelText("realizada")).toBeInTheDocument();
  rerender(
    <QueryClientProvider client={new QueryClient()}>
      <IntegranteCard
        usuario={usuario} usuarios={[usuario]} asignaciones={[]}
        directivas={[dir({ estado: "Asignada" })]}
        readOnly currentEmail="op@x.com" isAdmin={false}
      />
    </QueryClientProvider>
  );
  expect(screen.queryByLabelText("realizada")).not.toBeInTheDocument();
});
```

> `rerender` viene de `render`; el helper `wrap` ya lo devuelve implícitamente vía `render(...)`. Como `wrap` retorna el resultado de `render`, `const { rerender } = wrap(...)` funciona.

- [ ] **Step 2: Correr — falla.**

- [ ] **Step 3: Implementar — `DirectivaItem.tsx`**

Importar `Check`:

```tsx
import { Trash2, Loader2, Check } from "lucide-react";
```

En la línea de la descripción, anteponer el ✓ cuando está hecha:

```tsx
        <span className="text-slate-700">
          {(d.estado === "Realizada" || d.estado === "Cerrada") && (
            <Check size={14} className="mr-1 inline text-green-600" aria-label="realizada" />
          )}
          {d.descripcion} <span className="text-slate-400">({d.fecha})</span>
        </span>
```

- [ ] **Step 4: Correr — pasa.**

- [ ] **Step 5: ✓ en las filas de tarea Realizada — `app/(app)/tareas/page.tsx`**

Importar `Check`:

```tsx
import { Plus, Filter, Trash2, Check } from "lucide-react";
```

En el bloque del badge de estado (donde está `<span className={cn("rounded-full border ...", estadoBadge[t.estado])}>{t.estado}</span>`), envolver con el ✓:

```tsx
                <div className="flex items-center gap-1">
                  {t.estado === "Realizada" && (
                    <Check size={14} className="text-green-600" aria-label="realizada" />
                  )}
                  <span className={cn("rounded-full border px-2 py-0.5 text-xs", estadoBadge[t.estado])}>
                    {t.estado}
                  </span>
                </div>
```

(Reemplaza solo el `<span>` del estado; el `<span>` de prioridad de abajo queda igual.)

- [ ] **Step 6: Correr VS.** `npx vitest run` + `npx tsc --noEmit` + `npm run lint`.

- [ ] **Step 7: Punto de commit** — `feat(tareas): ✓ verde en directivas y tareas realizadas`.

---

## Task 3: F3 (data) — hoja `Partes Comunes` + módulo + schema

**Files:**
- Modify: `lib/sheets/core.ts` (agregar la hoja a `SHEETS`)
- Create: `lib/sheets/partes-comunes.ts`
- Modify: `lib/schemas.ts` (schema de alta)
- Test: `lib/sheets/partes-comunes.test.ts`

- [ ] **Step 1: `SHEETS` — `lib/sheets/core.ts`**

Agregar la entrada dentro del objeto `SHEETS`:

```ts
  partesComunes: "Partes Comunes",
```

- [ ] **Step 2: Test que falla — `lib/sheets/partes-comunes.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const { valuesGet, valuesUpdate } = vi.hoisted(() => ({ valuesGet: vi.fn(), valuesUpdate: vi.fn() }));
vi.mock("googleapis", () => ({
  google: { sheets: () => ({ spreadsheets: { values: { get: valuesGet, update: valuesUpdate } } }) },
}));
vi.mock("@/lib/google-auth", () => ({ getGoogleAuth: () => ({}), getSheetId: () => "sheet-id" }));
vi.mock("@/lib/demo-mode", () => ({ isDemoMode: () => false }));

import { normalizeParteComun, getPartesComunes, appendParteComun } from "./partes-comunes";

const HEADER = ["id", "nombre"];
function rows(data: string[][]) {
  valuesGet.mockResolvedValue({ data: { values: data } });
}

beforeEach(() => {
  valuesGet.mockReset();
  valuesUpdate.mockReset().mockResolvedValue({});
});

describe("normalizeParteComun", () => {
  it("MAYÚSCULAS, trim y colapsa espacios (conserva internos)", () => {
    expect(normalizeParteComun("  pozo  de   aire y luz ")).toBe("POZO DE AIRE Y LUZ");
    expect(normalizeParteComun("terraza")).toBe("TERRAZA");
  });
});

describe("getPartesComunes", () => {
  it("lee por header y ordena", async () => {
    rows([HEADER, ["a", "TERRAZA"], ["b", "HALL"]]);
    expect(await getPartesComunes()).toEqual(["HALL", "TERRAZA"]);
  });
});

describe("appendParteComun", () => {
  it("normaliza y escribe una nueva", async () => {
    rows([HEADER, ["a", "HALL"]]);
    const creado = await appendParteComun(" terraza ");
    expect(creado).toBe("TERRAZA");
    expect(valuesUpdate).toHaveBeenCalledTimes(1);
  });
  it("rechaza duplicado (normalizado)", async () => {
    rows([HEADER, ["a", "HALL"]]);
    await expect(appendParteComun("hall")).rejects.toThrow(/ya existe/i);
    expect(valuesUpdate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Correr — falla.** `npx vitest run lib/sheets/partes-comunes.test.ts`.

- [ ] **Step 4: Implementar — `lib/sheets/partes-comunes.ts`**

```ts
import { nanoid } from "nanoid";
import { getSheetId } from "../google-auth";
import { isDemoMode } from "../demo-mode";
import { getDemoDptos } from "../demo-data";
import { getSheets, readRange, SHEETS } from "./core";
import { buildHeaderMap } from "./headers";

// Hoja de partes comunes: headers id · nombre.
const RANGE = `${SHEETS.partesComunes}!A:B`;

// Convención: MAYÚSCULAS, sin espacios al inicio/fin, colapsando espacios múltiples.
export function normalizeParteComun(nombre: string): string {
  return nombre.trim().replace(/\s+/g, " ").toUpperCase();
}

function parse(rows: string[][]): string[] {
  if (rows.length === 0) return [];
  const h = buildHeaderMap(rows[0] ?? []);
  return rows
    .slice(1)
    .map((r) => h.get(r, "nombre").trim())
    .filter(Boolean);
}

export async function getPartesComunes(): Promise<string[]> {
  if (isDemoMode()) return getDemoDptos("Parte Común").map((d) => d.dpto);
  const rows = await readRange(RANGE);
  return parse(rows).sort((a, b) => a.localeCompare(b, "es"));
}

export async function appendParteComun(nombre: string): Promise<string> {
  const limpio = normalizeParteComun(nombre);
  if (!limpio) throw new Error("El nombre no puede estar vacío");
  if (isDemoMode()) return limpio;
  const rows = await readRange(RANGE);
  const existentes = parse(rows).map(normalizeParteComun);
  if (existentes.includes(limpio)) throw new Error(`La parte común "${limpio}" ya existe`);
  const h = buildHeaderMap(rows[0] ?? []);
  const width = Math.max(1, h.index("id") + 1, h.index("nombre") + 1);
  const row = new Array(width).fill("");
  const set = (name: string, val: string) => {
    const i = h.index(name);
    if (i !== -1) row[i] = val;
  };
  set("id", nanoid(10));
  set("nombre", limpio);
  // Fila libre por cantidad de filas leídas (evita append/table-detection).
  const nextRow = rows.length + 1;
  await getSheets().spreadsheets.values.update({
    spreadsheetId: getSheetId(),
    range: `${SHEETS.partesComunes}!A${nextRow}:B${nextRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] },
  });
  return limpio;
}
```

- [ ] **Step 5: Schema — `lib/schemas.ts`**

Agregar al final:

```ts
export const parteComunNuevaSchema = z.object({
  nombre: z.string().min(1, "El nombre es requerido"),
});
```

- [ ] **Step 6: Correr — pasa** `npx vitest run lib/sheets/partes-comunes.test.ts` + `npx tsc --noEmit`.

- [ ] **Step 7: Punto de commit** — `feat(partes-comunes): módulo de datos + hoja + schema`.

---

## Task 4: F3 (wiring) — API + api-client + offline + hook

**Files:**
- Create: `app/api/partes-comunes/route.ts`
- Modify: `lib/api-client.ts`
- Modify: `lib/offline-db.ts`
- Modify: `hooks/queries.ts`

- [ ] **Step 1: Endpoint — `app/api/partes-comunes/route.ts`**

```ts
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/http/withAuth";
import { withAdmin } from "@/lib/http/withAdmin";
import { getPartesComunes, appendParteComun } from "@/lib/sheets/partes-comunes";
import { jsonError } from "@/lib/api-utils";
import { parteComunNuevaSchema } from "@/lib/schemas";

export const runtime = "nodejs";

export const GET = withAuth(async () => {
  return NextResponse.json(await getPartesComunes());
});

export const POST = withAdmin(async (req) => {
  const { nombre } = parteComunNuevaSchema.parse(await req.json());
  try {
    const creado = await appendParteComun(nombre);
    return NextResponse.json({ nombre: creado }, { status: 201 });
  } catch (err) {
    return jsonError(409, err instanceof Error ? err.message : "No se pudo agregar la parte común");
  }
});
```

- [ ] **Step 2: api-client — `lib/api-client.ts`**

Agregar una entrada `partesComunes` dentro del objeto `api` (junto a `proveedores`):

```ts
  partesComunes: {
    list: () => request<string[]>("/api/partes-comunes"),
    add: (nombre: string) =>
      request<{ nombre: string }>("/api/partes-comunes", {
        method: "POST",
        body: JSON.stringify({ nombre }),
      }),
  },
```

- [ ] **Step 3: Offline cache (v3) — `lib/offline-db.ts`**

Agregar la tabla y su versión. En la clase `AppDB`:

```ts
  cachePartesComunes!: Table<CacheEntry<string[]>, string>;
```

En el constructor, después del bloque `this.version(2)`:

```ts
    // v3: cache de partes comunes (hoja propia).
    this.version(3).stores({
      cachePartesComunes: "key",
    });
```

Y los helpers (mirror de proveedores), al final de la sección de cache:

```ts
export async function cachePartesComunes(value: string[]) {
  const db = getDb();
  await db.cachePartesComunes.put({ key: "all", value, updatedAt: new Date().toISOString() });
}

export async function readCachedPartesComunes(): Promise<string[] | null> {
  const db = getDb();
  const entry = await db.cachePartesComunes.get("all");
  if (!entry || !isFresh(entry.updatedAt)) return null;
  return entry.value;
}
```

- [ ] **Step 4: Hook — `hooks/queries.ts`**

Importar los nuevos helpers de cache:

```ts
import {
  cacheEdificios,
  readCachedEdificios,
  cacheDptos,
  readCachedDptos,
  cacheConfig,
  readCachedConfig,
  cacheProveedores,
  readCachedProveedores,
  cachePartesComunes,
  readCachedPartesComunes,
} from "@/lib/offline-db";
```

Reemplazar la constante `PARTE_COMUN_EDIFICIO` y el hook `usePartesComunes` viejos por:

```ts
// Partes comunes: ahora viven en su propia hoja "Partes Comunes" (no en Dptos).
export const usePartesComunes = (parteComun: boolean) =>
  useCachedQuery({
    queryKey: ["partes-comunes"],
    fetcher: api.partesComunes.list,
    cache: cachePartesComunes,
    readCache: readCachedPartesComunes,
    enabled: parteComun,
  });
```

> `PARTE_COMUN_EDIFICIO` se elimina. Verificar que no lo importe nadie más: `grep -rn "PARTE_COMUN_EDIFICIO" --include=*.ts --include=*.tsx .` → solo debía estar en `queries.ts`. Si aparece en otro archivo, ajustar ese uso.

- [ ] **Step 5: Verificar** — `npx tsc --noEmit` (PASS) + `npx vitest run` (los tests de `hooks/queries.test.tsx` que mockeen `usePartesComunes` pueden necesitar ajuste; ver Step 6).

- [ ] **Step 6: Ajustar `hooks/queries.test.tsx` si rompe**

Si `hooks/queries.test.tsx` referencia `PARTE_COMUN_EDIFICIO` o el fetch viejo de `usePartesComunes` (via `api.dptos.list`), actualizarlo: ahora `usePartesComunes` usa `api.partesComunes.list`. Mockear `api.partesComunes.list` en ese test y esperar la queryKey `["partes-comunes"]`.

- [ ] **Step 7: Correr VS.** PASS.

- [ ] **Step 8: Punto de commit** — `feat(partes-comunes): endpoints + api-client + cache offline + hook`.

---

## Task 5: F3 (UI) — botón `+` en el form (admin) + opciones string

**Files:**
- Modify: `components/tareas/hooks/useTareaForm.ts`
- Modify: `components/tareas/TareaForm.tsx`

- [ ] **Step 1: Lógica de alta en el hook — `useTareaForm.ts`**

Agregar imports:

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
```

Dentro de `useTareaForm`, después de los otros hooks de datos:

```ts
  const qc = useQueryClient();
  const { data: session } = useSession();
  const isAdmin = session?.user?.rol === "admin";
  const [nuevaParteComun, setNuevaParteComun] = useState("");
  const [showAddParte, setShowAddParte] = useState(false);

  const addParteComun = useMutation({
    mutationFn: (nombre: string) => api.partesComunes.add(nombre),
    onSuccess: ({ nombre }) => {
      qc.invalidateQueries({ queryKey: ["partes-comunes"] });
      setValue("dpto", nombre); // seleccionar la recién creada
      setNuevaParteComun("");
      setShowAddParte(false);
    },
  });
```

`partesComunesOptions` pasa a ser `string[]` (la fetcher ahora devuelve `string[]`). Cambiar la línea:

```ts
  const partesComunesOptions = useMemo(() => partesComunesQ.data ?? [], [partesComunesQ.data]);
```

(no cambia el código, pero su tipo ahora es `string[]`). Exponer lo nuevo en el `return`:

```ts
    isAdmin,
    nuevaParteComun,
    setNuevaParteComun,
    showAddParte,
    setShowAddParte,
    addParteComun,
```

- [ ] **Step 2: UI del dropdown + botón `+` — `TareaForm.tsx`**

Reemplazar el bloque del `<Field label="Parte común">` (rama `f.parteComun`) por:

```tsx
        <Field label="Parte común" error={f.errors.dpto?.message}>
          <div className="flex gap-2">
            <select {...f.register("dpto")} className="input flex-1" disabled={f.partesComunesQ.isLoading}>
              <option value="">
                {f.partesComunesQ.isLoading ? "Cargando…" : "Seleccionar parte común"}
              </option>
              {f.partesComunesOptions.map((nombre) => (
                <option key={nombre} value={nombre}>
                  {nombre}
                </option>
              ))}
            </select>
            {f.isAdmin && (
              <button
                type="button"
                onClick={() => f.setShowAddParte((s) => !s)}
                aria-label="Agregar parte común"
                className="rounded-lg border border-slate-300 bg-white px-3 text-slate-700 hover:bg-slate-50"
              >
                <Plus size={16} />
              </button>
            )}
          </div>
          {f.isAdmin && f.showAddParte && (
            <div className="mt-2 flex gap-2">
              <input
                value={f.nuevaParteComun}
                onChange={(e) => f.setNuevaParteComun(e.target.value)}
                placeholder="Ej: TERRAZA"
                className="input flex-1"
              />
              <button
                type="button"
                disabled={!f.nuevaParteComun.trim() || f.addParteComun.isPending}
                onClick={() => f.addParteComun.mutate(f.nuevaParteComun)}
                className="flex items-center gap-1 rounded-lg bg-slate-900 px-3 text-sm text-white disabled:opacity-50"
              >
                {f.addParteComun.isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                Agregar
              </button>
            </div>
          )}
          {f.addParteComun.isError && (
            <p className="mt-1 text-xs text-red-600">{f.addParteComun.error?.message}</p>
          )}
        </Field>
```

Agregar `Plus` al import de lucide:

```tsx
import { Loader2, CloudOff, Plus } from "lucide-react";
```

- [ ] **Step 3: Verificar** — `npx tsc --noEmit` (PASS).

- [ ] **Step 4: E2E (humano):** con la hoja `Partes Comunes` poblada, tildar "Parte común", ver el dropdown; como admin, `+` → escribir `terraza` → se guarda `TERRAZA`, aparece y queda seleccionada. Como no-admin, no aparece el `+`. Agregar un duplicado → mensaje de "ya existe".

- [ ] **Step 5: Punto de commit** — `feat(partes-comunes): botón + para agregar parte común (admin) en el form`.

---

## Task 6: Verificación final

- [ ] **Step 1:** `npx vitest run` → todo verde.
- [ ] **Step 2:** `npx tsc --noEmit` && `npm run lint` → sin errores.
- [ ] **Step 3:** `npm run build` → OK.
- [ ] **Step 4: Punto de commit final** (si hace falta algún ajuste de docs).

---

## Nota fuera de alcance (para decidir aparte)

El `<select>` de **Estado** en `TareaForm.tsx` (líneas ~123-129) todavía tiene los valores viejos `Pendiente`/`En Proceso`/`Realizado` (son texto en JSX, por eso `tsc` no los cazó). Con el ciclo de vida nuevo, el estado lo maneja el flujo de asignación, así que ese selector probablemente **deba sacarse o restringirse** — es una decisión de producto, no entra en estas 3 features.
