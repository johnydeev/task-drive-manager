# Asignación y ciclo de ejecución de Tareas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada tarea tenga un responsable de ejecución asignado por el admin (distinto del creador), con un ciclo de vida `Sin asignar → Asignada → Aceptada → En Proceso → En Revisión → Realizada`, transiciones validadas por rol server-side y cierre automático derivado a las 72 h.

**Architecture:** Se extiende la entidad `Tarea` (columna `estado` ampliada + 6 columnas nuevas). El cierre a 72 h se calcula on-read (nunca se persiste), replicando `lib/directivas-estado.ts`. Las transiciones son un `PATCH` action-based con validación de rol/estado de origen (patrón de `PATCH /api/directivas`). Lectura por header (Fase 1) → las columnas nuevas van en cualquier posición.

**Tech Stack:** Next.js 16 (App Router) · React 19 · TanStack Query · Zod · Vitest + Testing Library · Google Sheets (`lib/sheets/*`).

**Spec:** [`../specs/2026-07-23-asignacion-ejecucion-tareas-design.md`](../specs/2026-07-23-asignacion-ejecucion-tareas-design.md)

> **Commits:** los hace Jony con GitLens. "Punto de commit" = checkpoint donde frenar para que revise/commitee. NO ejecutar `git commit`.

> **Verificación estándar (VS):** en cada checkpoint dejar verde `npx vitest run` + `npx tsc --noEmit` + `npm run lint`. El `npm run build` se corre al final (Task 8).

---

## Enum de estados (referencia para todo el plan)

```ts
export type EstadoTarea =
  | "Sin asignar" | "Asignada" | "Aceptada"
  | "En Proceso" | "En Revisión" | "Realizada";
```

Mapa de migración de valores viejos: `Pendiente → Sin asignar`, `Realizado → Realizada`, `En Proceso` sin cambios.

---

## Phase 0 — Preparación manual de la Sheet (Jony, fuera del código)

> No es una task de código; es prerrequisito operativo. Se documenta acá para el checklist.

- [ ] Agregar 6 columnas a la hoja `Tareas` (posición libre; headers exactos, snake_case): `asignado_a`, `asignada_en`, `aceptada_en`, `revision_en`, `realizada_en`, `comentario_revision`. Mantener el total **≤ 26 columnas (hasta la Z)** y **`id` en la columna A**.
- [ ] Migrar el `estado` de las 21 filas existentes: `Pendiente → Sin asignar`, `Realizado → Realizada` (dejar `En Proceso` igual). `asignado_a` vacío en todas.

---

## Task 1: Fundación — enum, tipos, schemas, mapping y referencias (dejar verde)

El cambio de `EstadoTarea` rompe TS en ~15 archivos de código y varios tests. Esta task hace el cambio **completo** en un solo checkpoint verde: define el enum nuevo, agrega los campos a `Tarea`, mapea las columnas nuevas en la capa de Sheets, y actualiza todas las referencias literales + sus tests.

**Files:**
- Modify: `types/index.ts`
- Modify: `lib/schemas.ts`
- Modify: `lib/sheets/tareas.ts`
- Modify: `lib/dashboard.ts`, `components/dashboard/Dashboard.tsx`
- Modify: `components/tareas/TareaDetalle.tsx`, `app/(app)/tareas/page.tsx`
- Modify: `components/tareas/hooks/useTareaForm.ts`, `lib/demo-data.ts`
- Test: `lib/sheets/tareas.test.ts`, `tests/lib/schemas.test.ts`, `lib/dashboard.test.ts`, y los tests que hardcodean estados viejos (ver Step 8).

- [ ] **Step 1: Enum y tipos — `types/index.ts`**

Reemplazar el type y ampliar `Tarea`:

```ts
export type EstadoTarea =
  | "Sin asignar" | "Asignada" | "Aceptada"
  | "En Proceso" | "En Revisión" | "Realizada";
```

En `interface Tarea`, agregar después de `supervisor`:

```ts
  asignadoA?: string;      // email del responsable de ejecución (FK Usuarios). Vacío = Sin asignar
  asignadaEn?: string;     // ISO datetime — cuándo asignó el admin
  aceptadaEn?: string;     // ISO datetime — cuándo aceptó el asignado
  revisionEn?: string;     // ISO datetime — arranca el reloj de 72 h
  realizadaEn?: string;    // ISO datetime — cierre a mano (distinto de fechaRealizado)
  comentarioRevision?: string; // lo escribe el asignado al mandar a revisar
```

- [ ] **Step 2: Schemas — `lib/schemas.ts`**

Reemplazar `estadoEnum`:

```ts
export const estadoEnum = z.enum([
  "Sin asignar", "Asignada", "Aceptada", "En Proceso", "En Revisión", "Realizada",
]);
```

Cambiar el default de `tareaNuevaSchema.estado` de `"Pendiente"` a `"Sin asignar"`. **Dejar `tareaPatchEstadoSchema` como está** (se elimina en Task 4, cuando se reescribe el route que lo usa). Agregar al final del archivo los schemas de asignación y transición:

```ts
// Asignar/reasignar (admin): a quién se le asigna la tarea.
export const tareaAsignarSchema = z.object({
  asignadoA: z.string().email().transform((e) => e.toLowerCase()),
});

// Transiciones del ciclo de vida. El permiso depende de la acción (validado en el handler).
export const tareaTransicionSchema = z.object({
  accion: z.enum(["aceptar", "empezar", "revisar", "cerrar", "comentar"]),
  comentario: z.string().optional(), // revisar → comentarioRevision · comentar → comentarioEnProceso
  nota: z.string().optional(),       // cerrar → nota de cierre (comentarioRealizado)
});
```

> `tareaFormSchema` y `tareaUpdateSchema` mantienen `estado`, ahora con el enum nuevo — no requieren más cambios (el default del form se ajusta en Step 6).

- [ ] **Step 3: Test de mapping (falla) — `lib/sheets/tareas.test.ts`**

Agregar un caso que verifique el ida y vuelta de los campos nuevos (usar el patrón de header existente del archivo). Añadir dentro del describe de mapping:

```ts
it("mapea las columnas de asignación/ciclo de vida (rowToTarea ↔ tareaToRow)", () => {
  const header = [
    "id","objetivo","fecha_inicio","fecha_estimada","edificio","edificio_cuit",
    "parte_comun","dpto","informe","comentario_en_proceso","comentario_realizado",
    "reporte_url","proveedor","estado","presupuesto","fecha_realizado","prioridad",
    "supervisor","creado_en","actualizado_en",
    "asignado_a","asignada_en","aceptada_en","revision_en","realizada_en","comentario_revision",
  ];
  const h = buildHeaderMap(header);
  const tarea = rowToTarea(h, tareaToRow(h, {
    rowId: "2026-07-23T10:00:00.000Z",
    estado: "En Revisión",
    asignadoA: "juan@x.com",
    asignadaEn: "2026-07-23T10:00:00.000Z",
    aceptadaEn: "2026-07-23T11:00:00.000Z",
    revisionEn: "2026-07-23T12:00:00.000Z",
    comentarioRevision: "listo para revisar",
  }).map(String), 2);
  expect(tarea.asignadoA).toBe("juan@x.com");
  expect(tarea.revisionEn).toBe("2026-07-23T12:00:00.000Z");
  expect(tarea.comentarioRevision).toBe("listo para revisar");
  expect(tarea.estado).toBe("En Revisión");
});
```

> Verificar que `buildHeaderMap`, `rowToTarea`, `tareaToRow` estén importados en el archivo de test (lo están para los otros casos de mapping).

- [ ] **Step 4: Correr — falla.** `npx vitest run lib/sheets/tareas.test.ts` → FAIL (campos undefined).

- [ ] **Step 5: Mapping — `lib/sheets/tareas.ts`**

En `rowToTarea`, agregar al objeto devuelto (después de `actualizadoEn`):

```ts
    asignadoA: g("asignado_a") || undefined,
    asignadaEn: g("asignada_en") || undefined,
    aceptadaEn: g("aceptada_en") || undefined,
    revisionEn: g("revision_en") || undefined,
    realizadaEn: g("realizada_en") || undefined,
    comentarioRevision: g("comentario_revision") || undefined,
```

En `tareaToRow`, agregar los nombres al array `CAMPOS`:

```ts
    "asignado_a", "asignada_en", "aceptada_en", "revision_en", "realizada_en",
    "comentario_revision",
```

y los `set(...)` correspondientes (después de `set("actualizado_en", ...)`):

```ts
  set("asignado_a", t.asignadoA ?? "");
  set("asignada_en", t.asignadaEn ?? "");
  set("aceptada_en", t.aceptadaEn ?? "");
  set("revision_en", t.revisionEn ?? "");
  set("realizada_en", t.realizadaEn ?? "");
  set("comentario_revision", t.comentarioRevision ?? "");
```

En `appendTarea`, cambiar el default `estado: input.estado ?? "Pendiente"` → `estado: input.estado ?? "Sin asignar"` (aparecen 2 veces: en el objeto demo y en el real; y el `estadoEnum.parse` sigue valiendo con el enum nuevo).

- [ ] **Step 6: Referencias literales en UI/lógica**

`lib/dashboard.ts` — el `Record<EstadoTarea, number>` y las comparaciones. Colapsar a 3 buckets para los KPIs (evita 6 tarjetas):

```ts
// dashboard.ts — reemplazar el bloque porEstado
const porEstado = { sinAsignar: 0, enCurso: 0, realizadas: 0 };
// ... en el loop:
if (t.estado === "Sin asignar") { porEstado.sinAsignar++; entry.pendiente++; }
else if (t.estado === "Realizada") { porEstado.realizadas++; entry.realizado++; }
else { porEstado.enCurso++; entry.enProceso++; } // Asignada/Aceptada/En Proceso/En Revisión
// ... y donde hoy dice t.estado === "Realizado" (cerradasMes) → "Realizada"
```

Ajustar el `ESTADOS` de `lib/dashboard.ts` si se usa para iterar; si no, quitarlo. Actualizar `lib/dashboard.test.ts` a los estados nuevos y a los nombres de KPI (`sinAsignar/enCurso/realizadas`).

`components/dashboard/Dashboard.tsx` — `ESTADO_COLORS` y `ESTADOS`: usar el enum nuevo; los KPIs pasan a `Sin asignar / En curso / Realizadas` (leyendo `kpis.porEstado.sinAsignar` etc.). Mantener el stacked bar con las 3 series (pendiente→sin asignar, enProceso→en curso, realizado→realizadas).

**Importante para quedar verde:** cambiar TODOS los literales `"Pendiente"`/`"Realizado"` restantes al enum nuevo, si no `tsc` rompe por comparaciones sin overlap. En particular:
- `components/tareas/TareaDetalle.tsx` (~línea 213: `t.estado === "Realizado"` → `"Realizada"`).
- `app/api/tareas/[id]/route.ts` (2 refs: `parsed.estado === "Realizado"` → `"Realizada"`). Este route se reescribe entero en Task 4; acá solo se lo mantiene compilable.

`app/(app)/tareas/page.tsx` y `components/tareas/TareaDetalle.tsx` — el array `ESTADOS` y el color-map pasan a los 6 estados:

```ts
const ESTADO_COLORS: Record<EstadoTarea, string> = {
  "Sin asignar": "bg-slate-100 text-slate-700 border-slate-200",
  "Asignada": "bg-amber-100 text-amber-800 border-amber-200",
  "Aceptada": "bg-indigo-100 text-indigo-800 border-indigo-200",
  "En Proceso": "bg-blue-100 text-blue-800 border-blue-200",
  "En Revisión": "bg-purple-100 text-purple-800 border-purple-200",
  "Realizada": "bg-green-100 text-green-800 border-green-200",
};
```

`components/tareas/hooks/useTareaForm.ts:69` — default `estado: initial?.estado ?? "Sin asignar"`.

`lib/demo-data.ts` — reemplazar los `estado: "Pendiente"/"Realizado"` por `"Sin asignar"/"Realizada"` (dejar `"En Proceso"`).

- [ ] **Step 7: PDF — `components/pdf/TareaReportePdf.tsx` + `tests/lib/pdf-generator.test.ts`**

Si el PDF renderiza el estado o compara contra `"Realizado"`, cambiar a `"Realizada"`. Ajustar `tests/lib/pdf-generator.test.ts` (usa `estado: "Realizado"`).

- [ ] **Step 8: Actualizar tests que hardcodean estados viejos**

Cambiar `"Pendiente"→"Sin asignar"` y `"Realizado"→"Realizada"` en: `tests/lib/schemas.test.ts`, `tests/lib/google-sheets-crud.test.ts`, `tests/lib/google-sheets-mapping.test.ts`, `tests/lib/parse-tareas-rows.test.ts`, `tests/api/tareas-delete.test.ts`, `tests/api/reporte.test.ts`, `tests/components/TareaDetalle.test.tsx`, `components/tareas/hooks/useTareaForm.test.tsx`, `components/tareas/hooks/useTareaDetalle.test.tsx`. (El de `tareas-patch-estado.test.ts` se reescribe entero en Task 4 — dejarlo por ahora, se romperá y se arregla allá; o skipearlo temporalmente.)

- [ ] **Step 9: Correr VS.** `npx vitest run` + `npx tsc --noEmit` + `npm run lint`.
Expected: PASS (salvo `tareas-patch-estado.test.ts`, que se reescribe en Task 4 — si molesta, marcarlo `describe.skip` con un `// TODO Task 4`).

- [ ] **Step 10: Punto de commit** — `feat(tareas): enum de estados + columnas de asignación/ciclo de vida (mapping y refs)`.

---

## Task 2: Cierre derivado a 72 h — `lib/tareas-estado.ts`

**Files:**
- Create: `lib/tareas-estado.ts`
- Test: `lib/tareas-estado.test.ts`

- [ ] **Step 1: Test que falla — `lib/tareas-estado.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { estadoEfectivoTarea, HORAS_72_MS } from "./tareas-estado";
import type { Tarea } from "@/types";

const base = (over: Partial<Tarea>): Tarea => ({
  rowId: "2026-07-23T10:00:00.000Z", objetivo: "o", fechaInicio: "2026-07-23",
  fechaEstimada: "2026-07-24", edificio: "E", parteComun: false, dpto: "1A",
  informe: "i", imagenes: [], videos: [], documentos: [], estado: "En Revisión",
  prioridad: "Media", supervisor: "s@x.com", ...over,
});

describe("estadoEfectivoTarea", () => {
  it("En Revisión + >72h desde revisionEn → Realizada (derivado)", () => {
    const rev = new Date("2026-07-20T10:00:00.000Z").getTime();
    const now = rev + HORAS_72_MS + 1000;
    expect(estadoEfectivoTarea(base({ revisionEn: new Date(rev).toISOString() }), now)).toBe("Realizada");
  });
  it("En Revisión + <72h → sigue En Revisión", () => {
    const rev = Date.now();
    expect(estadoEfectivoTarea(base({ revisionEn: new Date(rev).toISOString() }), rev + 1000)).toBe("En Revisión");
  });
  it("otros estados no se derivan", () => {
    expect(estadoEfectivoTarea(base({ estado: "En Proceso", revisionEn: undefined }))).toBe("En Proceso");
  });
});
```

- [ ] **Step 2: Correr — falla.** `npx vitest run lib/tareas-estado.test.ts`.

- [ ] **Step 3: Implementar — `lib/tareas-estado.ts`**

```ts
import type { EstadoTarea, Tarea } from "@/types";

export const HORAS_72_MS = 72 * 60 * 60 * 1000;

// Estado efectivo (derivado). Una tarea En Revisión que superó las 72h desde revisionEn
// se considera Realizada. Puro cómputo on-read: nunca se persiste.
export function estadoEfectivoTarea(t: Tarea, now: number = Date.now()): EstadoTarea {
  if (t.estado === "En Revisión" && t.revisionEn) {
    const ts = new Date(t.revisionEn).getTime();
    if (!Number.isNaN(ts) && now - ts > HORAS_72_MS) return "Realizada";
  }
  return t.estado;
}
```

- [ ] **Step 4: Correr — pasa.**

- [ ] **Step 5: Punto de commit** — `feat(tareas): cierre derivado a 72h (estadoEfectivoTarea)`.

---

## Task 3: Aplicar el estado derivado al leer — `lib/sheets/tareas.ts`

**Files:**
- Modify: `lib/sheets/tareas.ts`
- Test: `lib/sheets/tareas.test.ts`

- [ ] **Step 1: Test que falla** — agregar a `lib/sheets/tareas.test.ts` un caso sobre `parseTareasRows`/`getTareas` mockeado donde una fila En Revisión con `revision_en` viejo se lee como `Realizada`. Patrón mínimo sobre la función pura:

```ts
it("getTareas deriva En Revisión vencida a Realizada", async () => {
  // Mock de readRange devolviendo header + 1 fila En Revisión con revision_en de hace 4 días,
  // y TareaArchivos vacío. (Seguir el patrón de mock del archivo.)
  // Esperar que la tarea resultante tenga estado "Realizada".
});
```

> Si el archivo ya tiene un helper de mock de `readRange`, reusarlo; si no, testear componiendo `parseTareasRows` + `estadoEfectivoTarea` directamente.

- [ ] **Step 2: Correr — falla.**

- [ ] **Step 3: Implementar** — en `lib/sheets/tareas.ts`, importar y aplicar al mapear en `getTareas` (y en cualquier lectura que exponga el estado):

```ts
import { estadoEfectivoTarea } from "../tareas-estado";
// ...en getTareas, al componer la media:
const conMedia = tareas.map((t) => ({
  ...t, ...mediaFromArchivos(archivos, t.rowId),
  estado: estadoEfectivoTarea(t),
}));
```

> `getTareaByRowId` usa `getTareas`, así que hereda el estado derivado. **Importante:** los handlers de transición del server deben leer el estado **persistido** para validar el origen (ver Task 4, Step 3, nota).

- [ ] **Step 4: Correr — pasa.** + VS.

- [ ] **Step 5: Punto de commit** — `feat(tareas): getTareas expone el estado efectivo (72h)`.

---

## Task 4: Transiciones y permisos — API

Reescribe `PATCH /api/tareas/[id]` como action-based, restringe `PUT` a admin, y mueve la auto-generación del reporte al cierre del admin.

**Files:**
- Modify: `app/api/tareas/[id]/route.ts`
- Modify: `lib/sheets/tareas.ts` (helper de transición que valida el estado **persistido**)
- Modify: `lib/schemas.ts` (eliminar `tareaPatchEstadoSchema`, ya sin uso)
- Test: reescribir `tests/api/tareas-patch-estado.test.ts` → `tests/api/tareas-transiciones.test.ts`

- [ ] **Step 1: Helper que lee el estado persistido — `lib/sheets/tareas.ts`**

`getTareaByRowId` deriva el estado; para validar transiciones necesitamos el **persistido**. Agregar:

```ts
// Igual que getTareaByRowId pero SIN derivar el estado (para validar transiciones).
export async function getTareaPersistida(rowId: string): Promise<Tarea | null> {
  if (isDemoMode()) return getDemoTareaById(rowId);
  const rows = await readRange(TAREAS_RANGE);
  const tarea = parseTareasRows(rows).find((t) => t.rowId === rowId) ?? null;
  if (!tarea) return null;
  const archivos = await getAllArchivos();
  return { ...tarea, ...mediaFromArchivos(archivos, tarea.rowId) };
}
```

- [ ] **Step 2: Test que falla — `tests/api/tareas-transiciones.test.ts`**

Reescribir el archivo cubriendo permisos y estados de origen. Estructura (seguir el patrón de mock de `tests/api/tareas-patch-estado.test.ts` original para `getTareaByRowId`/`updateTarea`/sesión):

```ts
// Casos mínimos:
// 1. asignar: admin OK (Sin asignar → Asignada, set asignadoA/asignadaEn); no-admin → 403.
// 2. aceptar: el asignado OK (Asignada → Aceptada); otro usuario → 403; estado != Asignada → 409.
// 3. empezar: asignado OK (Aceptada → En Proceso).
// 4. revisar: asignado OK (En Proceso → En Revisión, set revisionEn + comentarioRevision).
// 5. cerrar: admin OK (En Revisión → Realizada, set realizadaEn + comentarioRealizado); no-admin → 403.
// 6. reasignar (asignar con otra tarea ya Asignada): resetea aceptadaEn/revisionEn.
```

Cada caso arma el `Request` con `{ accion, ... }` o `{ asignadoA }`, invoca el handler y castea la respuesta.

- [ ] **Step 3: Implementar `PATCH` action-based — `app/api/tareas/[id]/route.ts`**

```ts
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/http/withAuth";
import { deleteTarea, getTareaPersistida, getUsuarios, updateTarea } from "@/lib/google-sheets";
import { trashTareaFolder } from "@/lib/google-drive";
import { generateAndUploadReporte } from "@/lib/pdf-generator";
import { jsonError } from "@/lib/api-utils";
import { tareaAsignarSchema, tareaTransicionSchema, tareaUpdateSchema } from "@/lib/schemas";

export const runtime = "nodejs";
type Params = { params: Promise<{ id: string }> };

// GET: sin cambios (lectura compartida, estado derivado). PUT y DELETE ahora admin-only.
export const PUT = withAuth<Params>(async (req, session, { params }) => {
  if (session.user.rol !== "admin") return jsonError(403, "Solo el admin puede editar los campos de la tarea");
  const { id } = await params;
  const t = await getTareaPersistida(decodeURIComponent(id));
  if (!t) return jsonError(404, "Tarea no encontrada");
  const parsed = tareaUpdateSchema.parse(await req.json());
  return NextResponse.json(await updateTarea({ ...parsed, rowId: t.rowId }));
});

export const DELETE = withAuth<Params>(async (_req, session, { params }) => {
  if (session.user.rol !== "admin") return jsonError(403, "Solo el admin puede borrar tareas");
  const { id } = await params;
  const t = await getTareaPersistida(decodeURIComponent(id));
  if (!t) return jsonError(404, "Tarea no encontrada");
  try {
    await trashTareaFolder({ edificio: t.edificio, objetivo: t.objetivo, ubicacion: t.dpto, rowId: t.rowId });
  } catch (err) { console.error("[delete-tarea] papelera:", err); }
  await deleteTarea(t.rowId);
  return NextResponse.json({ ok: true });
});

// PATCH: asignar (body {asignadoA}) o transición (body {accion,...}). Estado de origen
// validado contra el PERSISTIDO (getTareaPersistida), no el derivado.
export const PATCH = withAuth<Params>(async (req, session, { params }) => {
  const { id } = await params;
  const t = await getTareaPersistida(decodeURIComponent(id));
  if (!t) return jsonError(404, "Tarea no encontrada");
  const body = await req.json();
  const now = new Date().toISOString();
  const email = session.user.email.toLowerCase();
  const esAdmin = session.user.rol === "admin";
  const esAsignado = (t.asignadoA ?? "").toLowerCase() === email;

  // --- Asignar / reasignar (admin) ---
  if ("asignadoA" in body) {
    if (!esAdmin) return jsonError(403, "Solo el admin puede asignar");
    const { asignadoA } = tareaAsignarSchema.parse(body);
    const usuarios = await getUsuarios();
    if (!usuarios.some((u) => u.email === asignadoA && u.activo))
      return jsonError(400, `El usuario "${asignadoA}" no existe o está inactivo`);
    return NextResponse.json(await updateTarea({
      rowId: t.rowId, asignadoA, estado: "Asignada", asignadaEn: now,
      aceptadaEn: "", revisionEn: "", // D3: reasignar resetea el ciclo
    }));
  }

  // --- Transiciones ---
  const { accion, comentario, nota } = tareaTransicionSchema.parse(body);

  if (accion === "aceptar") {
    if (!esAsignado) return jsonError(403, "Solo el asignado puede aceptar");
    if (t.estado !== "Asignada") return jsonError(409, "La tarea no está en estado Asignada");
    return NextResponse.json(await updateTarea({ rowId: t.rowId, estado: "Aceptada", aceptadaEn: now }));
  }
  if (accion === "empezar") {
    if (!esAsignado) return jsonError(403, "Solo el asignado puede iniciar");
    if (t.estado !== "Aceptada") return jsonError(409, "La tarea no está en estado Aceptada");
    return NextResponse.json(await updateTarea({ rowId: t.rowId, estado: "En Proceso" }));
  }
  if (accion === "comentar") {
    if (!esAsignado && !esAdmin) return jsonError(403, "Sin permiso");
    if (t.estado !== "En Proceso") return jsonError(409, "Solo se comenta en En Proceso");
    return NextResponse.json(await updateTarea({ rowId: t.rowId, comentarioEnProceso: comentario ?? "" }));
  }
  if (accion === "revisar") {
    if (!esAsignado) return jsonError(403, "Solo el asignado puede mandar a revisión");
    if (t.estado !== "En Proceso") return jsonError(409, "La tarea no está En Proceso");
    return NextResponse.json(await updateTarea({
      rowId: t.rowId, estado: "En Revisión", revisionEn: now, comentarioRevision: comentario ?? "",
    }));
  }
  // cerrar (admin)
  if (!esAdmin) return jsonError(403, "Solo el admin puede cerrar la tarea");
  if (t.estado !== "En Revisión") return jsonError(409, "La tarea no está En Revisión");
  const updated = await updateTarea({
    rowId: t.rowId, estado: "Realizada", realizadaEn: now,
    comentarioRealizado: nota?.trim() || t.comentarioRealizado,
    fechaRealizado: now.slice(0, 10),
  });
  // Auto-reporte al cerrar (fire-and-forget), igual que antes pero disparado por el admin.
  generateAndUploadReporte(updated)
    .then((r) => updateTarea({ rowId: updated.rowId, reporteUrl: r.url }))
    .catch((err) => console.error("[reporte-auto] error:", err));
  return NextResponse.json(updated);
});
```

> El **override del admin** (mover a cualquier estado / editar cualquier campo) se cubre con `PUT` (admin-only, acepta `estado` vía `tareaUpdateSchema`). Las transiciones "de a un paso" son el camino del asignado.

- [ ] **Step 4: Correr — pasa.** `npx vitest run tests/api/tareas-transiciones.test.ts` + VS.

- [ ] **Step 5: Punto de commit** — `feat(api): transiciones de tarea por rol + PUT/DELETE admin-only + reporte al cerrar`.

---

## Task 5: api-client + hook

**Files:**
- Modify: `lib/api-client.ts`
- Modify: `components/tareas/hooks/useTareaDetalle.ts`
- Test: `components/tareas/hooks/useTareaDetalle.test.tsx`

- [ ] **Step 1: api-client — reemplazar `patchEstado` por `asignar` + `transicionar`**

En `lib/api-client.ts`, dentro de `tareas`, quitar `patchEstado` y agregar:

```ts
    asignar: (rowId: string, asignadoA: string) =>
      request<Tarea>(`/api/tareas/${encodeURIComponent(rowId)}`, {
        method: "PATCH", body: JSON.stringify({ asignadoA }),
      }),
    transicionar: (
      rowId: string,
      input: { accion: "aceptar" | "empezar" | "revisar" | "cerrar" | "comentar"; comentario?: string; nota?: string }
    ) =>
      request<Tarea>(`/api/tareas/${encodeURIComponent(rowId)}`, {
        method: "PATCH", body: JSON.stringify(input),
      }),
```

- [ ] **Step 2: Hook — `useTareaDetalle.ts`**

Reemplazar la mutation `patchEstado` por `asignar` y `transicionar`, y ajustar `canModify` a la nueva semántica (edición de campos = solo admin):

```ts
  const isAdmin = session?.user?.rol === "admin";
  const esAsignado = !!session?.user?.email &&
    session.user.email.toLowerCase() === t?.asignadoA?.toLowerCase();

  const asignar = useMutation({
    mutationFn: (asignadoA: string) => api.tareas.asignar(rowId, asignadoA),
    onSuccess: (u) => { qc.setQueryData(["tarea", rowId], u); qc.invalidateQueries({ queryKey: ["tareas"] }); },
  });
  const transicionar = useMutation({
    mutationFn: (input: { accion: "aceptar" | "empezar" | "revisar" | "cerrar" | "comentar"; comentario?: string; nota?: string }) =>
      api.tareas.transicionar(rowId, input),
    onSuccess: (u) => { qc.setQueryData(["tarea", rowId], u); qc.invalidateQueries({ queryKey: ["tareas"] }); },
  });

  // Editar campos (form) y borrar: SOLO admin. El asignado no edita campos.
  const canEditFields = !session?.user || isAdmin;
```

Devolver `asignar`, `transicionar`, `isAdmin`, `esAsignado`, `canEditFields` (reemplaza `patchEstado`/`canModify`). Actualizar `useTareaDetalle.test.tsx`: el test que llamaba `patchEstado.mutateAsync("Realizado")` pasa a `transicionar.mutateAsync({ accion: "cerrar" })` esperando `api.tareas.transicionar` con `("r1", { accion: "cerrar" })`.

- [ ] **Step 3: Correr — pasa.** `npx vitest run components/tareas/hooks` + `npx tsc --noEmit`.

- [ ] **Step 4: Punto de commit** — `feat(client): asignar/transicionar en api-client + hook`.

---

## Task 6: UI del detalle — badge, responsable, acciones por rol/estado, contador 72h

**Files:**
- Modify: `components/tareas/TareaDetalle.tsx`
- Test: `tests/components/TareaDetalle.test.tsx`

- [ ] **Step 1: Bloque de acciones por estado/rol**

En `TareaDetalle.tsx`, consumir `asignar`, `transicionar`, `isAdmin`, `esAsignado`, `canEditFields` del hook. Reemplazar el botón/select de estado viejo por acciones contextuales. Reglas (una sola acción visible por estado):

- **Sin asignar** + admin → dropdown de integrantes activos (`useUsuarios`) + botón **Asignar** (`asignar.mutate(email)`).
- **Asignada** + admin → mismo dropdown, botón **Reasignar**. + esAsignado → botón **Aceptar** (`transicionar.mutate({ accion: "aceptar" })`).
- **Aceptada** + esAsignado → botón **Empezar** (`{ accion: "empezar" }`).
- **En Proceso** + esAsignado → textarea `comentarioEnProceso` con botón **Guardar comentario** (`{ accion: "comentar", comentario }`) + botón **Enviar a revisión** que abre un textarea `comentarioRevision` y confirma (`{ accion: "revisar", comentario }`).
- **En Revisión** + admin → botón **Cerrar (dar por realizada)** con textarea opcional de nota (`{ accion: "cerrar", nota }`).

Cada botón async: `disabled={mut.isPending}` y spinner `Loader2 animate-spin` reemplazando el ícono/label mientras `isPending` (regla global de UI). El form de edición de campos (`TareaForm`) se muestra solo si `canEditFields`.

- [ ] **Step 2: Contador de 72h (En Revisión)**

Cuando `t.estado === "En Revisión"` y hay `t.revisionEn`, mostrar el tiempo restante:

```tsx
{t.estado === "En Revisión" && t.revisionEn && (() => {
  const vence = new Date(t.revisionEn).getTime() + 72 * 3600 * 1000;
  const restanteH = Math.max(0, Math.round((vence - Date.now()) / 3600000));
  return <p className="text-xs text-purple-700">Cierre automático en ~{restanteH} h</p>;
})()}
```

> Nota: cuando vencen las 72h, `getTareas` ya devuelve `estado: "Realizada"` (derivado), así que este bloque desaparece solo.

- [ ] **Step 3: Badge de estado**

Usar el `ESTADO_COLORS` de 6 estados (definido en Task 1) para el badge, y mostrar `Responsable: {displayName(t.asignadoA, usuarios)}` (o "Sin asignar").

- [ ] **Step 4: Tests de componente — `tests/components/TareaDetalle.test.tsx`**

Casos (mockeando `useTareaDetalle` o `api`): admin sobre tarea Sin asignar ve el dropdown + Asignar; el asignado sobre Aceptada ve Empezar; el asignado sobre En Proceso ve Enviar a revisión; el admin sobre En Revisión ve Cerrar; un tercero (no admin, no asignado) no ve acciones. Ajustar el mock `estado` a los valores nuevos.

- [ ] **Step 5: Correr — pasa.** `npx vitest run tests/components/TareaDetalle.test.tsx` + VS.

- [ ] **Step 6: Punto de commit** — `feat(tareas): UI de asignación y ciclo de vida en el detalle`.

---

## Task 7: Listado — filtros "Mis tareas asignadas" y "Sin asignar"

**Files:**
- Modify: `lib/tareas-filter.ts`, `lib/tareas-filter.test.ts`
- Modify: `app/api/tareas/route.ts` (aceptar `asignado` y `sinAsignar` como query params)
- Modify: `lib/api-client.ts` (agregar los filtros a `tareas.list`)
- Modify: `app/(app)/tareas/page.tsx` (UI de los filtros)

- [ ] **Step 1: Test que falla — `lib/tareas-filter.test.ts`**

```ts
it("filtra por asignado", () => {
  const ts = [tarea({ asignadoA: "a@x.com" }), tarea({ asignadoA: "b@x.com" })];
  expect(filterTareas(ts, { asignado: "a@x.com" })).toHaveLength(1);
});
it("filtra sin asignar", () => {
  const ts = [tarea({ asignadoA: "a@x.com" }), tarea({ asignadoA: undefined })];
  expect(filterTareas(ts, { sinAsignar: true })).toHaveLength(1);
});
```

- [ ] **Step 2: Implementar filtros — `lib/tareas-filter.ts`**

Agregar a `TareaFilters`: `asignado?: string;` y `sinAsignar?: boolean;`. En `filterTareas`:

```ts
    if (filters.asignado && (t.asignadoA ?? "").toLowerCase() !== filters.asignado.toLowerCase()) return false;
    if (filters.sinAsignar && (t.asignadoA ?? "").trim() !== "") return false;
```

- [ ] **Step 3: API + api-client**

`app/api/tareas/route.ts` — leer los params:

```ts
    asignado: sp.get("asignado") || undefined,
    sinAsignar: sp.get("sinAsignar") === "1" || undefined,
```

`lib/api-client.ts` — sumar `asignado?: string; sinAsignar?: boolean;` a la firma de `tareas.list` y serializar `sinAsignar` como `"1"`.

- [ ] **Step 4: UI — `app/(app)/tareas/page.tsx`**

Agregar dos toggles/botones de filtro: **"Mis tareas asignadas"** (setea `asignado` = email de sesión) y **"Sin asignar"** (setea `sinAsignar`). Integrarlos al estado de filtros existente y a la key de la query.

- [ ] **Step 5: Correr — pasa.** `npx vitest run lib/tareas-filter.test.ts` + VS.

- [ ] **Step 6: Punto de commit** — `feat(tareas): filtros "Mis tareas asignadas" y "Sin asignar"`.

---

## Task 8: Verificación final + E2E manual

- [ ] **Step 1: Suite completa.** `npx vitest run` → todo verde (254+ tests, incluidos los nuevos).
- [ ] **Step 2: Tipos + lint.** `npx tsc --noEmit` && `npm run lint` → sin errores.
- [ ] **Step 3: Build.** `npm run build` → OK.
- [ ] **Step 4: E2E manual (skill `run`), con las columnas ya creadas en la Sheet (Phase 0):**
  - Supervisor crea una tarea → nace **Sin asignar**.
  - Admin la asigna a un integrante → **Asignada**; reasigna a otro → sigue Asignada con el nuevo (aceptadaEn/revisionEn vacíos).
  - El asignado: **Aceptar → Empezar → (comentario) → Enviar a revisión** (con comentario). Verificar que NO puede editar prioridad/fechas.
  - Admin **Cierra** → **Realizada** + se genera el reporte.
  - Un no-admin no ve botón de borrar; solo el admin borra.
  - Filtros "Mis tareas asignadas" / "Sin asignar" funcionan.
  - (Opcional, difícil de forzar) dejar una tarea En Revisión con `revision_en` de hace >72h en la Sheet y verificar que se ve **Realizada**.
- [ ] **Step 5: Punto de commit final** — `docs: cerrar plan de asignación/ciclo de vida de tareas` (si se actualizó algún doc).

---

## Notas de diseño heredadas (recordatorio)

- Lectura por header → las 6 columnas van en cualquier posición; `id` queda en la **columna A**; total **≤ Z (26 cols)**.
- El cierre a 72h es **derivado on-read** (nunca se persiste); el cierre a mano del admin **sí** persiste `estado="Realizada"`.
- Validación de transiciones contra el estado **persistido** (`getTareaPersistida`), no el derivado.
- Los no-admin **no editan campos**; el asignado solo mueve estado (sus transiciones) + comentarios.
