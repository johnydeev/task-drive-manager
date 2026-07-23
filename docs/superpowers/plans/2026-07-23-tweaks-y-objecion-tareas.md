# Tweaks + objeción de tareas (estado "Objetada") — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** cinco cambios: (#1) placeholder de parte común, (#2) fecha estimada opcional, (#3) tarjeta de tareas asignadas en la vista Edificios, (#4) fecha junto al comentario de Revisión, (#5) objeción de tareas con nuevo estado `Objetada`.

**Architecture:** #5 suma un estado al enum de la Tarea (ripple en badges/dashboard) + 2 columnas ya creadas (`nota_objecion`, `objetada_en`) + una acción `objetar` en el PATCH y `revisar` desde `Objetada`. #3 es un componente nuevo alimentado por un fetch único de tareas. El resto son tweaks de form/UI.

**Tech Stack:** Next.js 16 · TanStack Query · Zod · Vitest + RTL · Google Sheets.

**Spec:** [`../specs/2026-07-23-tweaks-y-objecion-tareas-design.md`](../specs/2026-07-23-tweaks-y-objecion-tareas-design.md)

> **Commits:** los hace Jony con GitLens. NO ejecutar `git commit`.
> **VS:** `npx vitest run` + `npx tsc --noEmit` + `npm run lint`. Build al final (Task 6).
> **Prerrequisito manual (Jony):** columnas `nota_objecion` y `objetada_en` ya creadas en `Tareas`. Total 28 columnas (por eso se amplía el rango de lectura, Task 2).

---

## Task 1: #1 placeholder + #2 fecha estimada opcional

**Files:**
- Modify: `components/tareas/TareaForm.tsx`
- Modify: `lib/schemas.ts`
- Test: `tests/lib/schemas.test.ts`

- [ ] **Step 1: Test que falla — `tests/lib/schemas.test.ts`**

Agregar (usa `tareaNuevaSchema`, ya importado o impórtalo):

```ts
import { tareaNuevaSchema } from "@/lib/schemas";

it("tareaNuevaSchema acepta fechaEstimada vacía", () => {
  const base = {
    objetivo: "o", fechaInicio: "2026-07-16", fechaEstimada: "",
    edificio: "E", parteComun: false, dpto: "1A", informe: "i", prioridad: "Media" as const,
  };
  expect(tareaNuevaSchema.safeParse(base).success).toBe(true);
});
```

- [ ] **Step 2: Correr — falla.** `npx vitest run tests/lib/schemas.test.ts` (hoy `fechaEstimada` exige regex ISO).

- [ ] **Step 3: Schema — `lib/schemas.ts`**

En `tareaBaseFields`, cambiar:

```ts
  fechaEstimada: isoDate,
```

por:

```ts
  fechaEstimada: isoDate.or(z.literal("")).optional(),
```

- [ ] **Step 4: Correr — pasa.**

- [ ] **Step 5: Placeholder + label — `components/tareas/TareaForm.tsx`**

Cambiar el placeholder del input de nueva parte común:

```tsx
                placeholder="Ej: TERRAZA (TODO EN MAYÚSCULA)"
```

Cambiar el label de la fecha estimada para que no implique obligatoriedad:

```tsx
        <Field label="Fecha estimada (opcional)" error={f.errors.fechaEstimada?.message}>
```

- [ ] **Step 6: VS.** `npx vitest run` + `npx tsc --noEmit` + `npm run lint`.

- [ ] **Step 7: Punto de commit** — `feat(tareas): placeholder de parte común + fecha estimada opcional`.

---

## Task 2: #5 (data) — estado `Objetada`, columnas, mapping, ripple

**Files:**
- Modify: `types/index.ts`, `lib/schemas.ts`
- Modify: `lib/sheets/core.ts`, `lib/sheets/tareas.ts`
- Modify: `lib/dashboard.ts`, `components/dashboard/Dashboard.tsx`
- Modify: `components/tareas/TareaDetalle.tsx`, `app/(app)/tareas/page.tsx`
- Test: `lib/sheets/tareas.test.ts`, `lib/dashboard.ts` (Record obliga la clave nueva)

- [ ] **Step 1: Tipos — `types/index.ts`**

`EstadoTarea` suma `Objetada` (entre `En Revisión` y `Realizada`):

```ts
export type EstadoTarea =
  | "Sin asignar"
  | "Asignada"
  | "Aceptada"
  | "En Proceso"
  | "En Revisión"
  | "Objetada"
  | "Realizada";
```

En `interface Tarea`, después de `comentarioRevision`:

```ts
  notaObjecion?: string;   // motivo de la objeción del admin
  objetadaEn?: string;     // ISO datetime — cuándo se objetó
```

- [ ] **Step 2: Schema — `lib/schemas.ts`**

`estadoEnum` suma `"Objetada"`:

```ts
export const estadoEnum = z.enum([
  "Sin asignar", "Asignada", "Aceptada", "En Proceso", "En Revisión", "Objetada", "Realizada",
]);
```

`tareaTransicionSchema.accion` suma `"objetar"`:

```ts
  accion: z.enum(["aceptar", "empezar", "revisar", "cerrar", "comentar", "objetar"]),
```

- [ ] **Step 3: Rango de lectura — `lib/sheets/core.ts`**

Con 28 columnas se supera la `Z`. Cambiar:

```ts
export const TAREAS_RANGE = `${SHEETS.tareas}!A:AD`;
```

- [ ] **Step 4: Test de mapping que falla — `lib/sheets/tareas.test.ts`**

En el `describe("mapping de asignación / ciclo de vida", ...)`, ampliar el header y agregar aserciones. Reemplazar el `const header = [...]` de ese describe por:

```ts
  const header = [
    ...headerNuevo,
    "asignado_a", "asignada_en", "aceptada_en", "revision_en", "realizada_en",
    "comentario_revision", "nota_objecion", "objetada_en",
  ];
```

Y agregar un caso:

```ts
  it("hace ida y vuelta de nota_objecion / objetada_en", () => {
    const h = buildHeaderMap(header);
    const row = tareaToRow(h, {
      rowId: "2026-07-23T10:00:00.000Z",
      estado: "Objetada",
      notaObjecion: "falta el informe",
      objetadaEn: "2026-07-23T15:00:00.000Z",
    }).map(String);
    const tarea = rowToTarea(h, row, 2);
    expect(tarea.estado).toBe("Objetada");
    expect(tarea.notaObjecion).toBe("falta el informe");
    expect(tarea.objetadaEn).toBe("2026-07-23T15:00:00.000Z");
  });
```

- [ ] **Step 5: Correr — falla.**

- [ ] **Step 6: Mapping + header range — `lib/sheets/tareas.ts`**

En `getTareasHeaderMap`, ampliar el rango:

```ts
  const headerRow = (await readRange(`${SHEETS.tareas}!A1:AD1`))[0] ?? [];
```

En `rowToTarea`, después de `comentarioRevision`:

```ts
    notaObjecion: g("nota_objecion") || undefined,
    objetadaEn: g("objetada_en") || undefined,
```

En `tareaToRow`, agregar al array `CAMPOS`:

```ts
    "nota_objecion", "objetada_en",
```

y los `set(...)`:

```ts
  set("nota_objecion", t.notaObjecion ?? "");
  set("objetada_en", t.objetadaEn ?? "");
```

- [ ] **Step 7: Correr — pasa.**

- [ ] **Step 8: Ripple del enum en dashboard — `lib/dashboard.ts`**

En `buildKpis`, el `porEstado` suma la clave `Objetada` (el `Record<EstadoTarea, number>` la exige):

```ts
  const porEstado: Record<EstadoTarea, number> = {
    "Sin asignar": 0, Asignada: 0, Aceptada: 0, "En Proceso": 0, "En Revisión": 0, Objetada: 0, Realizada: 0,
  };
```

Y el array `ESTADOS`:

```ts
const ESTADOS: EstadoTarea[] = [
  "Sin asignar", "Asignada", "Aceptada", "En Proceso", "En Revisión", "Objetada", "Realizada",
];
```

(`groupByEdificio` no cambia: `Objetada` cae en el `else` → `pendiente`, que representa "en curso".)

- [ ] **Step 9: Ripple en `components/dashboard/Dashboard.tsx`**

`ESTADO_COLORS` suma `Objetada` (rojo, señala rechazo):

```ts
const ESTADO_COLORS: Record<EstadoTarea, string> = {
  "Sin asignar": "#94a3b8",
  Asignada: "#f59e0b",
  Aceptada: "#6366f1",
  "En Proceso": "#3b82f6",
  "En Revisión": "#a855f7",
  Objetada: "#ef4444",
  Realizada: "#10b981",
};
```

`ESTADOS` (filtro) suma `Objetada`:

```ts
const ESTADOS: (EstadoTarea | "Todos")[] = [
  "Todos", "Sin asignar", "Asignada", "Aceptada", "En Proceso", "En Revisión", "Objetada", "Realizada",
];
```

`enCurso` suma `Objetada`:

```ts
  const enCurso =
    kpis.porEstado.Asignada +
    kpis.porEstado.Aceptada +
    kpis.porEstado["En Proceso"] +
    kpis.porEstado["En Revisión"] +
    kpis.porEstado.Objetada;
```

- [ ] **Step 10: Ripple en badges — `app/(app)/tareas/page.tsx` y `components/tareas/TareaDetalle.tsx`**

En ambos archivos, `estadoBadge` suma `Objetada` (rojo) y el `ESTADOS` de `page.tsx` suma `Objetada`. En cada `estadoBadge`:

```ts
  Objetada: "bg-red-100 text-red-800 border-red-200",
```

En `page.tsx`, el array `ESTADOS`:

```ts
const ESTADOS: (EstadoTarea | "Todos")[] = [
  "Todos", "Sin asignar", "Asignada", "Aceptada", "En Proceso", "En Revisión", "Objetada", "Realizada",
];
```

- [ ] **Step 11: VS.** `npx vitest run` + `npx tsc --noEmit` + `npm run lint`. (TS obliga a cubrir todos los `Record<EstadoTarea>`; si algún archivo quedó sin la clave, lo marca acá.)

- [ ] **Step 12: Punto de commit** — `feat(tareas): estado Objetada + columnas nota_objecion/objetada_en + mapping y ripple`.

---

## Task 3: #5 (API) — acción `objetar` + `revisar` desde Objetada

**Files:**
- Modify: `app/api/tareas/[id]/route.ts`
- Modify: `lib/api-client.ts`, `components/tareas/hooks/useTareaDetalle.ts`
- Test: `tests/api/tareas-transiciones.test.ts`

- [ ] **Step 1: Test que falla — `tests/api/tareas-transiciones.test.ts`**

Agregar un `describe`:

```ts
describe("PATCH transiciones — objetar", () => {
  it("admin objeta una tarea En Revisión → Objetada con nota", async () => {
    asSession("admin@x.com", "admin");
    vi.mocked(getTareaPersistida).mockResolvedValue(tarea({ estado: "En Revisión", asignadoA: "juan@x.com" }));
    const res = await patch({ accion: "objetar", nota: "falta el informe" });
    expect(res.status).toBe(200);
    expect(vi.mocked(updateTarea)).toHaveBeenCalledWith(
      expect.objectContaining({ estado: "Objetada", notaObjecion: "falta el informe" })
    );
  });
  it("objetar sin motivo → 400", async () => {
    asSession("admin@x.com", "admin");
    vi.mocked(getTareaPersistida).mockResolvedValue(tarea({ estado: "En Revisión", asignadoA: "juan@x.com" }));
    const res = await patch({ accion: "objetar", nota: "  " });
    expect(res.status).toBe(400);
  });
  it("un no-admin no puede objetar → 403", async () => {
    asSession("juan@x.com", "supervisor");
    vi.mocked(getTareaPersistida).mockResolvedValue(tarea({ estado: "En Revisión", asignadoA: "juan@x.com" }));
    const res = await patch({ accion: "objetar", nota: "x" });
    expect(res.status).toBe(403);
  });
  it("el asignado reenvía una Objetada → En Revisión", async () => {
    asSession("juan@x.com", "supervisor");
    vi.mocked(getTareaPersistida).mockResolvedValue(tarea({ estado: "Objetada", asignadoA: "juan@x.com" }));
    const res = await patch({ accion: "revisar", comentario: "corregido" });
    expect(res.status).toBe(200);
    expect(vi.mocked(updateTarea)).toHaveBeenCalledWith(
      expect.objectContaining({ estado: "En Revisión", comentarioRevision: "corregido" })
    );
  });
});
```

- [ ] **Step 2: Correr — falla.**

- [ ] **Step 3: Handler — `app/api/tareas/[id]/route.ts`**

En la rama `revisar`, aceptar origen `En Proceso` **o** `Objetada`:

```ts
  if (accion === "revisar") {
    if (!esAsignado) return jsonError(403, "Solo el asignado puede mandar a revisión");
    if (t.estado !== "En Proceso" && t.estado !== "Objetada") {
      return jsonError(409, "La tarea no está En Proceso ni Objetada");
    }
    return NextResponse.json(
      await updateTarea({
        rowId: t.rowId,
        estado: "En Revisión",
        revisionEn: now,
        comentarioRevision: comentario ?? "",
      })
    );
  }
```

Agregar la rama `objetar` **antes** de la de `cerrar`:

```ts
  if (accion === "objetar") {
    if (!esAdmin) return jsonError(403, "Solo el admin puede objetar");
    if (t.estado !== "En Revisión") return jsonError(409, "Solo se puede objetar una tarea En Revisión");
    if (!nota?.trim()) return jsonError(400, "El motivo de la objeción es requerido");
    return NextResponse.json(
      await updateTarea({
        rowId: t.rowId,
        estado: "Objetada",
        notaObjecion: nota.trim(),
        objetadaEn: now,
      })
    );
  }
```

- [ ] **Step 4: api-client + hook**

En `lib/api-client.ts`, la unión de `transicionar` suma `"objetar"`:

```ts
      input: {
        accion: "aceptar" | "empezar" | "revisar" | "cerrar" | "comentar" | "objetar";
        comentario?: string;
        nota?: string;
      }
```

En `components/tareas/hooks/useTareaDetalle.ts`, misma unión en la mutation `transicionar`:

```ts
    mutationFn: (input: {
      accion: "aceptar" | "empezar" | "revisar" | "cerrar" | "comentar" | "objetar";
      comentario?: string;
      nota?: string;
    }) => api.tareas.transicionar(rowId, input),
```

Y en `components/tareas/AccionesTarea.tsx`, el tipo `TransicionInput`:

```ts
export type TransicionInput = {
  accion: "aceptar" | "empezar" | "revisar" | "cerrar" | "comentar" | "objetar";
  comentario?: string;
  nota?: string;
};
```

- [ ] **Step 5: Correr — pasa.** `npx vitest run tests/api/tareas-transiciones.test.ts` + `npx tsc --noEmit`.

- [ ] **Step 6: Punto de commit** — `feat(api): objetar tarea (→ Objetada) + revisar desde Objetada`.

---

## Task 4: #5 + #4 (UI) — botón Objetar, panel Objetada, fechas en Comentarios

**Files:**
- Modify: `components/tareas/AccionesTarea.tsx`
- Modify: `components/tareas/TareaDetalle.tsx`
- Test: `tests/components/TareaDetalle.test.tsx`

- [ ] **Step 1: `AccionesTarea` — botón Objetar (admin, En Revisión)**

Reemplazar el bloque `{puedeCerrar && (...)}` (dentro de `t.estado === "En Revisión"`) por uno con textarea neutral y dos botones:

```tsx
          {puedeCerrar && (
            <div>
              <label className="mb-1 block text-sm text-slate-600">
                Comentario (nota de cierre / motivo de objeción)
              </label>
              <textarea value={notaCierre} onChange={(e) => setNotaCierre(e.target.value)} rows={2} className="input w-full" />
              <div className="mt-1 flex gap-2">
                <button
                  disabled={transicionar.isPending}
                  onClick={() => transicionar.mutate({ accion: "cerrar", nota: notaCierre })}
                  className="flex items-center gap-1 rounded-lg bg-green-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  {trPend("cerrar") && <Loader2 size={14} className="animate-spin" />}
                  Cerrar (dar por realizada)
                </button>
                <button
                  disabled={!notaCierre.trim() || transicionar.isPending}
                  onClick={() => transicionar.mutate({ accion: "objetar", nota: notaCierre })}
                  className="flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  {trPend("objetar") && <Loader2 size={14} className="animate-spin" />}
                  Objetar
                </button>
              </div>
            </div>
          )}
```

- [ ] **Step 2: `AccionesTarea` — panel Objetada (asignado) + guard de panel vacío**

Después del bloque `{t.estado === "En Revisión" && (...)}`, agregar el panel de Objetada:

```tsx
      {esAsignado && t.estado === "Objetada" && (
        <div className="space-y-2">
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
            <p className="text-xs font-medium text-red-700">
              Objeción del admin{t.objetadaEn ? ` - ${formatFecha(t.objetadaEn)}` : ""}
            </p>
            <p className="text-sm whitespace-pre-wrap text-red-800">{t.notaObjecion}</p>
          </div>
          <label className="mb-1 block text-sm text-slate-600">Comentario de revisión (qué corregiste)</label>
          <textarea value={comRevision} onChange={(e) => setComRevision(e.target.value)} rows={2} className="input w-full" />
          <button
            disabled={transicionar.isPending}
            onClick={() => transicionar.mutate({ accion: "revisar", comentario: comRevision })}
            className="flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {trPend("revisar") && <Loader2 size={14} className="animate-spin" />}
            Reenviar a revisión
          </button>
        </div>
      )}
```

Importar `formatFecha` (junto a `formatDateTime`):

```ts
import { formatDateTime, formatFecha } from "@/lib/utils";
```

Agregar el guard de panel vacío (evita la tarjeta "Acciones" vacía en estados sin acción, ej. admin sobre Aceptada/Objetada). Reemplazar la línea `if (!isAdmin && !esAsignado) return null;` por:

```ts
  if (!isAdmin && !esAsignado) return null;
  const mostrarPanel =
    puedeAsignar ||
    puedeCerrar ||
    t.estado === "En Revisión" ||
    (esAsignado && ["Asignada", "Aceptada", "En Proceso", "Objetada"].includes(t.estado));
  if (!mostrarPanel) return null;
```

> `puedeAsignar`/`puedeCerrar` están definidos arriba de esa línea en el archivo actual; el guard va después de ellos.

- [ ] **Step 3: `TareaDetalle` — fechas en Comentarios (#4 Revisión + #5 Objeción)**

En la sección Comentarios, actualizar el subtítulo de Revisión y agregar el de Objeción. Reemplazar el bloque de `comentarioRevision` y sumar el de objeción:

```tsx
        {(t.comentarioEnProceso || t.comentarioRevision || t.notaObjecion || t.comentarioRealizado) && (
          <Section title="Comentarios">
            {t.comentarioEnProceso && (
              <div>
                <p className="text-xs font-medium text-slate-500">En proceso</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{t.comentarioEnProceso}</p>
              </div>
            )}
            {t.comentarioRevision && (
              <div className="mt-2">
                <p className="text-xs font-medium text-slate-500">
                  Revisión{t.revisionEn ? ` - ${formatFecha(t.revisionEn)}` : ""}
                </p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{t.comentarioRevision}</p>
              </div>
            )}
            {t.notaObjecion && (
              <div className="mt-2">
                <p className="text-xs font-medium text-red-600">
                  Objeción{t.objetadaEn ? ` - ${formatFecha(t.objetadaEn)}` : ""}
                </p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{t.notaObjecion}</p>
              </div>
            )}
            {t.comentarioRealizado && (
              <div className="mt-2">
                <p className="text-xs font-medium text-slate-500">Cierre</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{t.comentarioRealizado}</p>
              </div>
            )}
          </Section>
        )}
```

Verificar que `formatFecha` esté importado en `TareaDetalle.tsx` (ya lo está: `import { cn, formatFecha, formatDateTime } from "@/lib/utils";`).

- [ ] **Step 4: Test — `tests/components/TareaDetalle.test.tsx`**

Agregar (el mock de `api.tareas` ya tiene `get`; se pasa una tarea con `revisionEn`/`notaObjecion` vía el mock `fakeTarea` — crear un caso que sobrescriba `get`):

```tsx
it("muestra la fecha de Revisión y la objeción en Comentarios", async () => {
  vi.mocked(api.tareas.get).mockResolvedValueOnce({
    ...fakeTareaBase,
    estado: "Objetada",
    comentarioRevision: "listo",
    revisionEn: "2026-07-23T12:00:00.000Z",
    notaObjecion: "falta el informe",
    objetadaEn: "2026-07-23T15:00:00.000Z",
  });
  render(wrap(<TareaDetalle rowId={TAREA_ROW_ID} />));
  expect(await screen.findByText(/Revisión - /)).toBeInTheDocument();
  expect(screen.getByText(/Objeción - /)).toBeInTheDocument();
  expect(screen.getByText("falta el informe")).toBeInTheDocument();
});
```

> Extraer el objeto `fakeTarea` del mock a un `fakeTareaBase` reutilizable (o repetir los campos base). `api` debe importarse en el test (agregar `import { api } from "@/lib/api-client";` si no está).

- [ ] **Step 5: VS.** `npx vitest run` + `npx tsc --noEmit` + `npm run lint`.

- [ ] **Step 6: Punto de commit** — `feat(tareas): UI de objeción (Objetar/Reenviar) + fechas en Comentarios`.

---

## Task 5: #3 — Tarjeta de tareas asignadas en la vista Edificios

**Files:**
- Modify: `hooks/edificios-queries.ts`
- Create: `components/edificios/TareasAsignadasCard.tsx`
- Modify: `components/edificios/EdificiosView.tsx`
- Test: `components/edificios/TareasAsignadasCard.test.tsx`

- [ ] **Step 1: Hook — `hooks/edificios-queries.ts`**

Agregar:

```ts
import type { Tarea } from "@/types";

// Todas las tareas (para agrupar por integrante en la vista Edificios).
export const useTareas = () =>
  useCachedQuery<Tarea[]>({ queryKey: ["tareas-all"], fetcher: () => api.tareas.list({}) });
```

- [ ] **Step 2: Test que falla — `components/edificios/TareasAsignadasCard.test.tsx`**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TareasAsignadasCard } from "./TareasAsignadasCard";
import type { Tarea } from "@/types";

const t = (over: Partial<Tarea>): Tarea => ({
  rowId: "2026-07-16T10:00:00.000Z", objetivo: "Obj", fechaInicio: "2026-07-16", fechaEstimada: "",
  edificio: "Edif A", parteComun: false, dpto: "1A", informe: "", imagenes: [], videos: [], documentos: [],
  estado: "En Proceso", prioridad: "Media", supervisor: "s@x.com", ...over,
});

describe("TareasAsignadasCard", () => {
  it("agrupa En curso y Realizadas, y linkea al detalle", () => {
    render(
      <TareasAsignadasCard tareas={[t({ objetivo: "Activa" }), t({ objetivo: "Hecha", estado: "Realizada" })]} />
    );
    expect(screen.getByText("En curso")).toBeInTheDocument();
    expect(screen.getByText("Realizadas")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Activa/ })).toHaveAttribute(
      "href",
      "/tareas/2026-07-16T10%3A00%3A00.000Z"
    );
  });

  it("no muestra el grupo Realizadas si no hay ninguna", () => {
    render(<TareasAsignadasCard tareas={[t({ estado: "En Proceso" })]} />);
    expect(screen.queryByText("Realizadas")).not.toBeInTheDocument();
  });

  it("no renderiza nada sin tareas", () => {
    const { container } = render(<TareasAsignadasCard tareas={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 3: Correr — falla.**

- [ ] **Step 4: Componente — `components/edificios/TareasAsignadasCard.tsx`**

```tsx
"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { EstadoTarea, Tarea } from "@/types";

const estadoBadge: Record<EstadoTarea, string> = {
  "Sin asignar": "bg-slate-100 text-slate-700",
  Asignada: "bg-amber-100 text-amber-800",
  Aceptada: "bg-indigo-100 text-indigo-800",
  "En Proceso": "bg-blue-100 text-blue-800",
  "En Revisión": "bg-purple-100 text-purple-800",
  Objetada: "bg-red-100 text-red-800",
  Realizada: "bg-green-100 text-green-800",
};

export function TareasAsignadasCard({ tareas }: { tareas: Tarea[] }) {
  if (tareas.length === 0) return null;
  const enCurso = tareas.filter((t) => t.estado !== "Realizada");
  const realizadas = tareas.filter((t) => t.estado === "Realizada");

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Tareas asignadas</p>
      {enCurso.length > 0 && <Grupo titulo="En curso" tareas={enCurso} />}
      {realizadas.length > 0 && <Grupo titulo="Realizadas" tareas={realizadas} />}
    </div>
  );
}

function Grupo({ titulo, tareas }: { titulo: string; tareas: Tarea[] }) {
  return (
    <div className="mt-2">
      <p className="text-xs font-medium text-slate-500">{titulo}</p>
      <ul className="mt-1 space-y-1">
        {tareas.map((t) => (
          <li key={t.rowId}>
            <Link
              href={`/tareas/${encodeURIComponent(t.rowId)}`}
              className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm hover:bg-slate-50"
            >
              <span className="min-w-0 flex-1 truncate text-slate-700">
                {t.objetivo || "(sin objetivo)"} <span className="text-slate-400">· {t.edificio}</span>
              </span>
              <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs", estadoBadge[t.estado])}>{t.estado}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 5: Correr — pasa.**

- [ ] **Step 6: Wiring — `components/edificios/EdificiosView.tsx`**

Importar el hook y el componente:

```tsx
import { useUsuarios, useAsignaciones, useDirectivas, useEdificiosSinAsignar, useTareas } from "@/hooks/edificios-queries";
import { TareasAsignadasCard } from "./TareasAsignadasCard";
```

Traer las tareas:

```tsx
  const tareasQ = useTareas();
```

Reemplazar el `.map` de integrantes por uno que apile las dos tarjetas (filtrando las tareas del integrante):

```tsx
        {integrantes.map((u) => (
          <div key={u.email} className="space-y-4">
            <IntegranteCard
              usuario={u}
              usuarios={usuariosQ.data}
              asignaciones={(asignacionesQ.data ?? []).filter(
                (a) => a.email.toLowerCase() === u.email.toLowerCase()
              )}
              directivas={(directivasQ.data ?? []).filter(
                (d) => d.asignadoA.toLowerCase() === u.email.toLowerCase()
              )}
              readOnly={!isAdmin}
              currentEmail={myEmail}
              isAdmin={isAdmin}
            />
            <TareasAsignadasCard
              tareas={(tareasQ.data ?? []).filter(
                (t) => (t.asignadoA ?? "").toLowerCase() === u.email.toLowerCase()
              )}
            />
          </div>
        ))}
```

> El `key` pasa del `IntegranteCard` al `div` contenedor.

- [ ] **Step 7: VS.** `npx vitest run` + `npx tsc --noEmit` + `npm run lint`.

- [ ] **Step 8: Punto de commit** — `feat(edificios): tarjeta de tareas asignadas por integrante`.

---

## Task 6: Verificación final

- [ ] **Step 1:** `npx vitest run` → verde.
- [ ] **Step 2:** `npx tsc --noEmit` && `npm run lint` → sin errores.
- [ ] **Step 3:** `npm run build` → OK.
- [ ] **Step 4: E2E (humano):**
  - Crear tarea sin fecha estimada (no da error).
  - Admin objeta una tarea En Revisión (con motivo) → queda **Objetada** en rojo; sin motivo el botón está deshabilitado.
  - El asignado ve la objeción con fecha, corrige y **Reenviar a revisión** → vuelve a En Revisión con el comentario nuevo.
  - En el detalle: "Revisión - {fecha}" y "Objeción - {fecha}".
  - En la vista Edificios, cada integrante muestra su tarjeta de tareas (En curso / Realizadas), clickeables.
  - Placeholder de parte común muestra "(TODO EN MAYÚSCULA)".
