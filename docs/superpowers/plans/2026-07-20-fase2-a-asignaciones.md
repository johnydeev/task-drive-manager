# Fase 2 · A — Asignaciones: unicidad + cartel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans / subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Un edificio se asigna a **un solo integrante** (único global), con validación server-side, y la vista Edificios muestra un cartel rojo **"Quedan X edificios por asignar"** cuando hay activos sin asignar.

**Architecture:** El data-layer deriva `sinAsignar = edificios activos de _Consorcios − edificios ya asignados` (match por nombre canónico normalizado, con `edificioMatches`). `addAsignacion` rechaza si el edificio ya está asignado a cualquiera (R2). Un endpoint expone `sinAsignar`; la vista lo usa para el cartel y para poblar el dropdown de "Agregar edificio" (así no se puede ni elegir uno tomado).

**Tech Stack:** Next.js 16 API routes · TanStack Query · Zod · Vitest + RTL.

**Spec:** [`...-reestructura-tablas-sheets-design.md`](../specs/2026-07-20-reestructura-tablas-sheets-design.md) §8 (R1–R4).

**Decisión de diseño:** la unicidad se implementa por **nombre canónico** (los nombres vienen del picker de `_Consorcios`, ya canónicos). Es equivalente a por-CUIT y no depende del backfill de `edificio_cuit` (pieza C). Cuando C aterrice, se puede migrar a CUIT sin cambiar la UX.

> **Commits:** los hace el usuario con GitLens. "Punto de commit" = checkpoint del usuario.

---

## File Structure

| Archivo | Cambio |
|---|---|
| `lib/sheets/asignaciones.ts` | `computeSinAsignar()` (pura) + `getEdificiosSinAsignar()` (async) + R2 en `addAsignacion`. |
| `lib/sheets/asignaciones.test.ts` | Tests de R2 + `computeSinAsignar`. |
| `app/api/asignaciones/sin-asignar/route.ts` | **NUEVO** GET admin → `string[]` de edificios sin asignar. |
| `app/api/asignaciones/route.ts` | POST: mapear el error de R2 a HTTP 409. |
| `lib/api-client.ts` | `api.asignaciones.sinAsignar()`. |
| `hooks/edificios-queries.ts` | `useEdificiosSinAsignar()`. |
| `components/edificios/EdificiosView.tsx` | Cartel rojo (admin, count>0). |
| `components/edificios/IntegranteCard.tsx` | Dropdown desde `sinAsignar` + `onError` en `addM` + invalidar `sin-asignar`. |
| `components/edificios/EdificiosView.test.tsx` · `IntegranteCard.test.tsx` | Tests de cartel + error. |

---

## Task 1: Data-layer — R2 + sinAsignar

**Files:**
- Modify: `lib/sheets/asignaciones.ts`
- Test: `lib/sheets/asignaciones.test.ts`

- [ ] **Step 1: Test que falla**

Agregar a `lib/sheets/asignaciones.test.ts`:

```typescript
import { computeSinAsignar } from "./asignaciones";
import type { Edificio, Asignacion } from "@/types";

describe("computeSinAsignar", () => {
  it("devuelve activos que no están en ninguna asignación (match normalizado)", () => {
    const activos: Edificio[] = [
      { nombre: "BELGRANO 1429" },
      { nombre: "GARAY 350" },
      { nombre: "NAZCA 2538" },
    ];
    const asignaciones: Asignacion[] = [{ email: "a@x.com", edificio: "Belgrano 1429" }];
    expect(computeSinAsignar(activos, asignaciones)).toEqual(["GARAY 350", "NAZCA 2538"]);
  });
});

describe("addAsignacion — R2 unicidad", () => {
  it("rechaza si el edificio ya está asignado a otro integrante", async () => {
    rows([HEADER, asigRow("Garay 350", "a@x.com")]);
    await expect(addAsignacion("b@x.com", "Garay 350")).rejects.toThrow(/ya está asignado/i);
    expect(valuesAppend).not.toHaveBeenCalled();
  });
});
```

> `HEADER`, `asigRow`, `rows`, `addAsignacion` ya existen en el archivo. Sumar el import de `addAsignacion` si no está.

- [ ] **Step 2: Correr — falla**

Run: `npx vitest run lib/sheets/asignaciones.test.ts`
Expected: FAIL ("computeSinAsignar is not exported"; y R2 no rechaza todavía).

- [ ] **Step 3: Implementar en `asignaciones.ts`**

Agregar import y funciones:

```typescript
import type { Asignacion, Edificio } from "@/types";
import { getConsorciosActivos } from "../consorcios";
import { edificioMatches } from "./edificios";

// Activos de _Consorcios que no aparecen en ninguna asignación (match normalizado).
export function computeSinAsignar(activos: Edificio[], asignaciones: Asignacion[]): string[] {
  return activos
    .map((e) => e.nombre)
    .filter((nombre) => !asignaciones.some((a) => edificioMatches(a.edificio, nombre)));
}

export async function getEdificiosSinAsignar(): Promise<string[]> {
  const [activos, asignaciones] = await Promise.all([
    getConsorciosActivos(),
    getAsignaciones(),
  ]);
  return computeSinAsignar(activos, asignaciones);
}
```

En `addAsignacion`, reemplazar el chequeo idempotente por la regla R2 (rechaza si ya está asignado a **cualquiera**):

```typescript
  const rows = await readRange(RANGE);
  const existing = parse(rows);
  const conflicto = existing.find((a) => edificioMatches(a.edificio, ed));
  if (conflicto) {
    throw new Error(`El edificio "${ed}" ya está asignado a ${conflicto.email}`);
  }
```

> Verificar que `edificioMatches` esté exportado de `./edificios` (lo está).

- [ ] **Step 4: Correr — pasa**

Run: `npx vitest run lib/sheets/asignaciones.test.ts`
Expected: PASS. (Ajustar el test "es idempotente" viejo: ahora re-agregar el mismo edificio **rechaza** en vez de no-op — cambiar esa expectativa a `.rejects.toThrow`.)

- [ ] **Step 5: Punto de commit** — `feat(asignaciones): unicidad de edificio (R2) + sinAsignar`.

---

## Task 2: API — endpoint sin-asignar + 409 en POST

**Files:**
- Create: `app/api/asignaciones/sin-asignar/route.ts`
- Modify: `app/api/asignaciones/route.ts`

- [ ] **Step 1: Crear el endpoint**

```typescript
// app/api/asignaciones/sin-asignar/route.ts
import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/http/withAdmin";
import { getEdificiosSinAsignar } from "@/lib/sheets/asignaciones";

export const runtime = "nodejs";

export const GET = withAdmin(async () => {
  const edificios = await getEdificiosSinAsignar();
  return NextResponse.json(edificios);
});
```

- [ ] **Step 2: Mapear R2 a 409 en el POST**

En `app/api/asignaciones/route.ts`, envolver `addAsignacion` en try/catch:

```typescript
export const POST = withAdmin(async (req) => {
  const body = await req.json();
  const { email, edificio } = asignacionSchema.parse(body);
  const consorcios = await getConsorciosActivos();
  if (!consorcios.some((c) => c.nombre === edificio)) {
    return jsonError(400, `Edificio "${edificio}" no es válido o no está activo`);
  }
  try {
    const a = await addAsignacion(email, edificio);
    return NextResponse.json(a, { status: 201 });
  } catch (err) {
    return jsonError(409, err instanceof Error ? err.message : "El edificio ya está asignado");
  }
});
```

- [ ] **Step 3: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Punto de commit** — `feat(api): endpoint sin-asignar + 409 en asignación duplicada`.

---

## Task 3: api-client + hook

**Files:**
- Modify: `lib/api-client.ts`
- Modify: `hooks/edificios-queries.ts`

- [ ] **Step 1: Agregar método al api-client**

En `lib/api-client.ts`, dentro de `asignaciones`:

```typescript
    sinAsignar: () => request<string[]>("/api/asignaciones/sin-asignar"),
```

- [ ] **Step 2: Hook**

En `hooks/edificios-queries.ts`:

```typescript
export const useEdificiosSinAsignar = () =>
  useCachedQuery({ queryKey: ["edificios-sin-asignar"], fetcher: api.asignaciones.sinAsignar });
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Punto de commit** — `feat(client): sinAsignar en api-client + hook`.

---

## Task 4: UI — cartel + dropdown + error

**Files:**
- Modify: `components/edificios/EdificiosView.tsx`
- Modify: `components/edificios/IntegranteCard.tsx`
- Test: `components/edificios/EdificiosView.test.tsx`, `components/edificios/IntegranteCard.test.tsx`

- [ ] **Step 1: Cartel en EdificiosView**

Importar el hook y renderizar el cartel (solo admin, count>0), arriba del grid:

```tsx
import { useUsuarios, useAsignaciones, useDirectivas, useEdificiosSinAsignar } from "@/hooks/edificios-queries";
// ...
  const sinAsignarQ = useEdificiosSinAsignar();
  const sinAsignar = sinAsignarQ.data ?? [];
// dentro del return, después del <p> de subtítulo:
  {isAdmin && sinAsignar.length > 0 && (
    <div
      role="alert"
      className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
    >
      Quedan {sinAsignar.length} edificios por asignar
    </div>
  )}
```

- [ ] **Step 2: IntegranteCard — dropdown desde sinAsignar + error + invalidación**

- Reemplazar el `useQuery(["edificios"])` por el hook `useEdificiosSinAsignar()` para poblar el `<select>` (ya no hace falta el `.filter` contra las propias asignaciones):

```tsx
import { useEdificiosSinAsignar } from "@/hooks/edificios-queries";
// ...
  const sinAsignarQ = useEdificiosSinAsignar();
// en el select:
  {(sinAsignarQ.data ?? []).map((nombre) => (
    <option key={nombre} value={nombre}>{nombre}</option>
  ))}
```

- Agregar manejo de error e invalidación de `sin-asignar` a las mutaciones:

```tsx
  const [addError, setAddError] = useState<string | null>(null);
  const addM = useMutation({
    mutationFn: (edificio: string) => api.asignaciones.add(usuario.email, edificio),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["asignaciones"] });
      qc.invalidateQueries({ queryKey: ["edificios-sin-asignar"] });
      setNuevoEdificio("");
      setAddError(null);
    },
    onError: (e: Error) => setAddError(e.message),
  });
  const removeM = useMutation({
    mutationFn: (edificio: string) => api.asignaciones.remove(usuario.email, edificio),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["asignaciones"] });
      qc.invalidateQueries({ queryKey: ["edificios-sin-asignar"] });
    },
  });
```

Y mostrar `addError` debajo del select:

```tsx
  {addError && <p className="mt-1 text-xs text-red-600">{addError}</p>}
```

- [ ] **Step 3: Tests de componente**

En `EdificiosView.test.tsx`, agregar un caso: con `useEdificiosSinAsignar` devolviendo `["A","B"]` y sesión admin, se renderiza "Quedan 2 edificios por asignar". Mockear el hook (o `api.asignaciones.sinAsignar`). Con `[]`, no aparece el cartel.

```tsx
// patrón según el mock existente del archivo (mockear @/hooks/edificios-queries)
it("muestra el cartel con el conteo de sin asignar (admin)", () => {
  // ...render con sinAsignar=["A","B"], isAdmin
  expect(screen.getByRole("alert")).toHaveTextContent("Quedan 2 edificios por asignar");
});
```

En `IntegranteCard.test.tsx`, agregar: al fallar `api.asignaciones.add` (rejected), se muestra el mensaje de error.

- [ ] **Step 4: Correr suite + typecheck**

Run: `npx vitest run components/edificios && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Verificación E2E**

Levantar la app (skill `run`). Como admin: verificar cartel con el número correcto, que el dropdown solo ofrece sin-asignar, que asignar uno lo saca del dropdown y baja el contador, y que quitar uno lo devuelve. Intentar asignar un edificio ya tomado (vía API) devuelve 409 con mensaje.

- [ ] **Step 6: Punto de commit** — `feat(edificios): cartel de sin-asignar + dropdown filtrado + manejo de error`.

---

## Self-review

- **Cobertura §8:** R1 (unicidad, Task 1) · R2 (validación al asignar + 409, Tasks 1-2) · R3 (`computeSinAsignar` derivado, Task 1) · R4 (cartel, Task 4). ✓
- **Sin placeholders:** código real en cada paso. Firmas consistentes: `computeSinAsignar(activos, asignaciones)`, `getEdificiosSinAsignar()`, `api.asignaciones.sinAsignar()`, `useEdificiosSinAsignar()`.
- **Fuera de alcance (correcto):** backfill `edificio_cuit` (pieza C), reporte único (B), validación enums (E).
