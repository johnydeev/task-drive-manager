# Reestructura de tablas — Fase 1 (bajo riesgo) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar la Fase 1 del spec de reestructura: lectura/escritura por **nombre de header** (no por índice), renombrado a `snake_case`, borrado de columnas reservadas, normalización de enums/fechas/booleanos y columnas de auditoría `creado_en`/`actualizado_en`, sin mover datos pesados.

**Architecture:** Se agrega un utilitario `lib/sheets/headers.ts` que mapea columnas por nombre de header **tolerando alias** (normaliza acentos/espacios/guiones bajos y acepta nombre viejo y nuevo). Los mapeos `rowToX`/`xToRow` de cada hoja pasan a usarlo, leyendo el header row (fila 1) de la Sheet. Como el código tolera headers viejos y nuevos, el renombrado real de la planilla se desacopla del deploy (no requiere lockstep).

**Tech Stack:** TypeScript estricto · Google Sheets API (`googleapis`) · Zod · Vitest (tests colocados junto al código).

**Spec:** [`docs/superpowers/specs/2026-07-20-reestructura-tablas-sheets-design.md`](../specs/2026-07-20-reestructura-tablas-sheets-design.md) (§6, §6.1, §7.9, Fase 1 de §9).

**Alcance:** SOLO Fase 1. Queda para la Fase 2 (plan aparte): hoja hija `TareaArchivos`, `edificio_cuit` + backfills, unicidad/cartel de `Asignaciones`, reporte único, limpieza de tablas auxiliares de columnas altas.

> **Nota sobre commits:** el dueño del repo maneja commits con GitLens. Los pasos "Punto de commit" son checkpoints que **hace el usuario** (no el agente ejecuta `git commit`). El agente avisa "listo para commitear" al llegar a cada checkpoint.

---

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `lib/sheets/headers.ts` *(nuevo)* | Utilitario: normalizar header + `buildHeaderMap(headerRow)` con búsqueda por nombre canónico + alias. |
| `lib/sheets/headers.test.ts` *(nuevo)* | Tests del utilitario. |
| `lib/sheets/values.ts` *(nuevo)* | Normalizadores de valores compartidos: `toDateOnly`, `toBool`, `boolToCell`. |
| `lib/sheets/values.test.ts` *(nuevo)* | Tests de los normalizadores. |
| `lib/sheets/tareas.ts` *(modificar)* | `rowToTarea`/`tareaToRow`/`parseTareasRows`/`appendTarea`/`updateTarea` por header; `creado_en`/`actualizado_en`; fechas `YYYY-MM-DD`. |
| `lib/sheets/usuarios.ts` *(modificar)* | Read/write por header; `actualizado_en`; `activo`/`rol` normalizados. |
| `lib/sheets/directivas.ts` *(modificar)* | Read/write por header; `actualizado_en`; fecha `YYYY-MM-DD`. |
| `lib/sheets/edificios.ts` *(modificar)* | `getDptos` lee `Dptos` por header (sin `edificio_cuit` todavía — eso es Fase 2). |
| `lib/sheets/asignaciones.ts` *(modificar)* | Read por header (sin `edificio_cuit` todavía). |
| `lib/sheets/config.ts` *(modificar)* | Read por header. |
| `types/index.ts` *(modificar)* | `Tarea.creadoEn`/`Tarea.actualizadoEn`; `Usuario.actualizadoEn`; `Directiva.actualizadoEn`. |
| `docs/superpowers/specs/.../MIGRACION-fase1.md` *(nuevo, checklist)* | Pasos manuales en la planilla (rename de headers, borrar O/P, backfill `creado_en`). |

**Convención de campos:** los campos TS siguen en `camelCase` (`creadoEn`, `fechaInicio`); solo los **headers de la Sheet** van `snake_case`. `headers.ts` es el único puente entre ambos.

---

## Task 1: Utilitario de lectura por header

**Files:**
- Create: `lib/sheets/headers.ts`
- Test: `lib/sheets/headers.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```typescript
// lib/sheets/headers.test.ts
import { describe, it, expect } from "vitest";
import { normalizeHeader, buildHeaderMap } from "./headers";

describe("normalizeHeader", () => {
  it("baja a minúsculas, saca acentos, espacios y guiones bajos", () => {
    expect(normalizeHeader("Fecha inicio")).toBe("fechainicio");
    expect(normalizeHeader("fecha_inicio")).toBe("fechainicio");
    expect(normalizeHeader("Parte común")).toBe("partecomun");
    expect(normalizeHeader("  Reporte URL ")).toBe("reporteurl");
  });
});

describe("buildHeaderMap", () => {
  const header = ["rowId", "Objetivo", "Fecha inicio", "Parte común"];

  it("encuentra por nombre canónico normalizado", () => {
    const h = buildHeaderMap(header);
    expect(h.index("objetivo")).toBe(1);
    expect(h.get(["a", "b", "c", "d"], "fecha_inicio")).toBe("c");
  });

  it("encuentra por alias cuando el header está con el nombre viejo", () => {
    const h = buildHeaderMap(header);
    // canonical "id" no existe como header, pero "rowId" (alias) sí
    expect(h.index("id", ["rowId"])).toBe(0);
    expect(h.get(["ID-1", "obj", "c", "d"], "id", ["rowId"])).toBe("ID-1");
  });

  it("devuelve -1 y '' para columnas ausentes", () => {
    const h = buildHeaderMap(header);
    expect(h.index("no_existe")).toBe(-1);
    expect(h.get(["a"], "no_existe")).toBe("");
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run lib/sheets/headers.test.ts`
Expected: FAIL con "Cannot find module './headers'" o "normalizeHeader is not a function".

- [ ] **Step 3: Implementar el utilitario**

```typescript
// lib/sheets/headers.ts
// Utilitario para mapear columnas de una Sheet por NOMBRE de header en vez de
// por índice fijo. Tolera diferencias de mayúsculas, acentos y espacios vs
// guiones bajos, y permite alias (para renames que no son normalización-
// equivalentes, ej. "rowId" -> "id"). Así el código funciona con los headers
// viejos o los nuevos: renombrar la planilla no requiere lockstep con el deploy.

export function normalizeHeader(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // saca diacríticos
    .replace(/[\s_]+/g, ""); // "fecha inicio" y "fecha_inicio" -> "fechainicio"
}

export interface HeaderMap {
  /** Índice de columna (0-based) del nombre canónico o alguno de sus alias; -1 si no existe. */
  index(canonical: string, aliases?: string[]): number;
  /** Valor de la celda para ese nombre; "" si la columna o la celda no existen. */
  get(row: string[], canonical: string, aliases?: string[]): string;
}

export function buildHeaderMap(headerRow: string[]): HeaderMap {
  const norm = headerRow.map(normalizeHeader);
  const find = (canonical: string, aliases: string[] = []): number => {
    const candidates = [canonical, ...aliases].map(normalizeHeader);
    for (const c of candidates) {
      const i = norm.indexOf(c);
      if (i !== -1) return i;
    }
    return -1;
  };
  return {
    index: find,
    get: (row, canonical, aliases) => {
      const i = find(canonical, aliases);
      return i === -1 ? "" : (row[i] ?? "");
    },
  };
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx vitest run lib/sheets/headers.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Punto de commit** (lo hace el usuario con GitLens)

Archivos: `lib/sheets/headers.ts`, `lib/sheets/headers.test.ts`.
Mensaje sugerido: `feat(sheets): utilitario de lectura por header con alias`.

---

## Task 2: Normalizadores de valores compartidos

**Files:**
- Create: `lib/sheets/values.ts`
- Test: `lib/sheets/values.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```typescript
// lib/sheets/values.test.ts
import { describe, it, expect } from "vitest";
import { toDateOnly, toBool, boolToCell } from "./values";

describe("toDateOnly", () => {
  it("trunca un ISO datetime a YYYY-MM-DD", () => {
    expect(toDateOnly("2026-07-10T14:30:00.000Z")).toBe("2026-07-10");
  });
  it("deja una fecha ya en YYYY-MM-DD igual", () => {
    expect(toDateOnly("2026-07-10")).toBe("2026-07-10");
  });
  it("devuelve '' para vacío o formato no reconocido", () => {
    expect(toDateOnly("")).toBe("");
    expect(toDateOnly("no-es-fecha")).toBe("");
  });
});

describe("toBool", () => {
  it("interpreta TRUE/Sí como true y FALSE como false (tolerante)", () => {
    expect(toBool("TRUE")).toBe(true);
    expect(toBool("true")).toBe(true);
    expect(toBool("Sí")).toBe(true);
    expect(toBool("FALSE")).toBe(false);
    expect(toBool("")).toBe(false);
  });
});

describe("boolToCell", () => {
  it("serializa a TRUE/FALSE canónico", () => {
    expect(boolToCell(true)).toBe("TRUE");
    expect(boolToCell(false)).toBe("FALSE");
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run lib/sheets/values.test.ts`
Expected: FAIL con "Cannot find module './values'".

- [ ] **Step 3: Implementar los normalizadores**

```typescript
// lib/sheets/values.ts
// Normalizadores de valores de celda compartidos entre las hojas.

// Fecha de calendario: YYYY-MM-DD. Trunca cualquier parte de hora/timezone.
// Devuelve "" si no reconoce el formato (evita propagar basura a la DB futura).
export function toDateOnly(v: string): string {
  const s = (v ?? "").trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}

// Booleano tolerante a lo que ya hay en la planilla (TRUE/FALSE/Sí, may/min).
export function toBool(v: string): boolean {
  const s = (v ?? "").toString().trim().toLowerCase();
  return s === "true" || s === "sí" || s === "si" || s === "verdadero";
}

// Serialización canónica de booleano para escribir en la Sheet.
export function boolToCell(b: boolean): "TRUE" | "FALSE" {
  return b ? "TRUE" : "FALSE";
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx vitest run lib/sheets/values.test.ts`
Expected: PASS.

- [ ] **Step 5: Punto de commit** (usuario / GitLens)

Archivos: `lib/sheets/values.ts`, `lib/sheets/values.test.ts`.
Mensaje sugerido: `feat(sheets): normalizadores de fecha y booleano`.

---

## Task 3: Tipos — columnas de auditoría

**Files:**
- Modify: `types/index.ts`

- [ ] **Step 1: Agregar campos de auditoría a los tipos**

En `types/index.ts`, dentro de `interface Tarea` (después de `supervisor: string;`), agregar:

```typescript
  creadoEn?: string; // ISO datetime — auditoría (header creado_en). Backfill = rowId.
  actualizadoEn?: string; // ISO datetime — auditoría (header actualizado_en).
```

En `interface Usuario` (después de `creadoEn: string;`), agregar:

```typescript
  actualizadoEn?: string; // ISO datetime — última modificación (rol/activo).
```

En `interface Directiva` (después de `notaObjecion?: string;`), agregar:

```typescript
  actualizadoEn?: string; // ISO datetime — última mutación de estado.
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: PASS (sin errores nuevos; los campos son opcionales, no rompen consumidores).

- [ ] **Step 3: Punto de commit** (usuario / GitLens)

Archivo: `types/index.ts`.
Mensaje sugerido: `feat(types): campos de auditoría creadoEn/actualizadoEn`.

---

## Task 4: `Tareas` — lectura por header

**Files:**
- Modify: `lib/sheets/tareas.ts` (funciones `rowToTarea`, `parseTareasRows`, `getTareas`)
- Test: `tests/lib/` o colocado — usar `lib/sheets/tareas.test.ts` *(nuevo)*

**Contexto:** hoy `rowToTarea(row, rowNumber)` lee índices fijos (`row[16]`, etc.) y `parseTareasRows` filtra por `looksLikeRowId(r[0])`. Pasa a: construir el header map de la fila 1, encontrar la columna `id` (alias `rowId`) para el filtro, y leer cada campo por header.

- [ ] **Step 1: Escribir el test que falla**

```typescript
// lib/sheets/tareas.test.ts
import { describe, it, expect } from "vitest";
import { parseTareasRows } from "./tareas";

// Header NUEVO (snake_case) + una fila de datos.
const headerNuevo = [
  "id", "objetivo", "fecha_inicio", "fecha_estimada", "edificio", "edificio_cuit",
  "parte_comun", "dpto", "informe", "comentario_en_proceso", "comentario_realizado",
  "reporte_url", "proveedor", "estado", "presupuesto", "fecha_realizado", "prioridad",
  "supervisor", "creado_en", "actualizado_en",
];
const filaNueva = [
  "2026-07-10T14:30:00.000Z", "Filtración", "2026-07-10", "2026-07-20", "Belgrano 1429",
  "30-54410451-5", "FALSE", "3A", "informe", "", "", "https://drive/r.pdf", "Prov",
  "Realizado", "1000", "2026-07-15", "Alta", "sup@x.com", "2026-07-10T14:30:00.000Z", "",
];

// Header VIEJO (como está hoy en prod) — mismo orden semántico, sin edificio_cuit,
// con reservadas O/P y con imagenes/videos/documentos.
const headerViejo = [
  "rowId", "Objetivo", "Fecha inicio", "Fecha estimada", "Edificio", "Parte común",
  "Dpto / Parte común", "Informe", "comentario en proceso", "comentario realizado",
  "Imágenes", "Videos", "Documentos", "Reporte URL", "(reservado)", "(reservado2)",
  "Proveedor", "Estado", "Presupuesto", "Fecha realizado", "Prioridad", "Supervisor",
];
const filaVieja = [
  "2026-07-11T09:00:00.000Z", "Pintura", "2026-07-11T00:00:00.000Z", "2026-07-21", "Nazca 2538",
  "SI", "HALL", "informe2", "", "", "[]", "[]", "[]", "", "", "",
  "ProvB", "Pendiente", "", "", "Media", "sup2@x.com",
];

describe("parseTareasRows — lectura por header", () => {
  it("mapea con headers NUEVOS (snake_case)", () => {
    const ts = parseTareasRows([headerNuevo, filaNueva]);
    expect(ts).toHaveLength(1);
    expect(ts[0].objetivo).toBe("Filtración");
    expect(ts[0].edificio).toBe("Belgrano 1429");
    expect(ts[0].parteComun).toBe(false);
    expect(ts[0].estado).toBe("Realizado");
    expect(ts[0].reporteUrl).toBe("https://drive/r.pdf");
    expect(ts[0].supervisor).toBe("sup@x.com");
  });

  it("mapea con headers VIEJOS (alias) — no requiere renombrar aún", () => {
    const ts = parseTareasRows([headerViejo, filaVieja]);
    expect(ts).toHaveLength(1);
    expect(ts[0].objetivo).toBe("Pintura");
    expect(ts[0].parteComun).toBe(true); // "SI" -> true
    expect(ts[0].dpto).toBe("HALL");
    expect(ts[0].fechaInicio).toBe("2026-07-11"); // truncado a YYYY-MM-DD
  });

  it("ignora filas que no son de datos (header/basura)", () => {
    const ts = parseTareasRows([headerNuevo, ["", "", ""], filaNueva]);
    expect(ts).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run lib/sheets/tareas.test.ts`
Expected: FAIL (la firma actual de `parseTareasRows` trata la fila 1 como dato y mapea por índice fijo).

- [ ] **Step 3: Reescribir `rowToTarea` y `parseTareasRows` por header**

En `lib/sheets/tareas.ts`, reemplazar `rowToTarea` y `parseTareasRows` por:

```typescript
import { buildHeaderMap, type HeaderMap } from "./headers";
import { toDateOnly, toBool } from "./values";

// Alias de columnas: nombre canónico (snake_case nuevo) -> nombres viejos aceptados.
const ID_ALIASES = ["rowId"];
const DPTO_ALIASES = ["Dpto / Parte común", "Dpto"];

// Mapea una fila usando el header map (tolera headers viejos y nuevos).
export function rowToTarea(h: HeaderMap, row: string[], rowNumber: number): Tarea {
  const g = (name: string, aliases?: string[]) => h.get(row, name, aliases);
  const presupuestoRaw = g("presupuesto");
  return {
    rowId: g("id", ID_ALIASES),
    rowNumber,
    objetivo: g("objetivo"),
    fechaInicio: toDateOnly(g("fecha_inicio")),
    fechaEstimada: toDateOnly(g("fecha_estimada")),
    edificio: g("edificio"),
    parteComun: toBool(g("parte_comun")),
    dpto: g("dpto", DPTO_ALIASES),
    informe: g("informe"),
    comentarioEnProceso: g("comentario_en_proceso") || undefined,
    comentarioRealizado: g("comentario_realizado") || undefined,
    imagenes: [], // la media sale en Fase 2; en Fase 1 no se lee de acá
    videos: [],
    documentos: [],
    reporteUrl: g("reporte_url") || undefined,
    proveedor: g("proveedor") || undefined,
    estado: (g("estado") as EstadoTarea) || "Pendiente",
    presupuesto: presupuestoRaw ? Number(presupuestoRaw) || undefined : undefined,
    fechaRealizado: toDateOnly(g("fecha_realizado")) || undefined,
    prioridad: (g("prioridad") as Prioridad) || "Media",
    supervisor: g("supervisor"),
    creadoEn: g("creado_en") || undefined,
    actualizadoEn: g("actualizado_en") || undefined,
  };
}

function looksLikeRowId(value: string | undefined): boolean {
  if (!value) return false;
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value.trim());
}

// La fila 1 es el header. Se construye el header map y se filtran las filas de
// datos por la columna id (alias rowId), tolerando header ausente o filas vacías.
export function parseTareasRows(rows: string[][]): Tarea[] {
  if (rows.length === 0) return [];
  const header = rows[0] ?? [];
  const h = buildHeaderMap(header);
  const idIdx = h.index("id", ID_ALIASES);
  const col = idIdx === -1 ? 0 : idIdx;
  return rows
    .slice(1)
    .map((r, i) => ({ r, rowNumber: i + 2 })) // +2: fila 1 es header, datos arrancan en 2
    .filter(({ r }) => looksLikeRowId(r[col]))
    .map(({ r, rowNumber }) => rowToTarea(h, r, rowNumber));
}
```

> **IMPORTANTE — media en Fase 1:** en esta fase `imagenes/videos/documentos` se devuelven vacíos desde `rowToTarea` **NO se elimina la lógica de escritura todavía** (ver Task 5). Para no romper la galería del detalle mientras tanto, ver la nota de compatibilidad al final de Task 5.

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx vitest run lib/sheets/tareas.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Punto de commit** (usuario / GitLens)

Archivos: `lib/sheets/tareas.ts`, `lib/sheets/tareas.test.ts`.
Mensaje sugerido: `refactor(sheets): Tareas lee por header con alias`.

> **⚠ Decisión de secuencia sobre la media:** devolver la media vacía en Fase 1 **rompería la galería** hasta la Fase 2. Para evitarlo, en Fase 1 mantené la lectura de media por header con alias a las columnas viejas (`Imágenes`/`Videos`/`Documentos`) usando `safeJsonArr`, y recién en Fase 2 se elimina. Ver Task 4b.

---

## Task 4b: `Tareas` — mantener lectura de media (compat Fase 1)

**Files:**
- Modify: `lib/sheets/tareas.ts` (`rowToTarea`)
- Test: `lib/sheets/tareas.test.ts`

**Motivo:** la media se separa recién en Fase 2. En Fase 1 hay que **seguir leyéndola** de las columnas actuales (por header con alias) para no romper el detalle/galería.

- [ ] **Step 1: Escribir el test que falla**

```typescript
// agregar a lib/sheets/tareas.test.ts
it("sigue leyendo media (JSON) por header en Fase 1", () => {
  const header = [...headerViejo];
  const fila = [...filaVieja];
  // columnas Imágenes/Videos con arrays JSON
  fila[10] = '["https://d/i1.jpg","https://d/i2.jpg"]';
  fila[11] = '["https://d/v1.mp4"]';
  const ts = parseTareasRows([header, fila]);
  expect(ts[0].imagenes).toEqual(["https://d/i1.jpg", "https://d/i2.jpg"]);
  expect(ts[0].videos).toEqual(["https://d/v1.mp4"]);
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run lib/sheets/tareas.test.ts -t "sigue leyendo media"`
Expected: FAIL (hoy devuelve `[]`).

- [ ] **Step 3: Restaurar la lectura de media por header**

En `rowToTarea`, reemplazar las 3 líneas `imagenes/videos/documentos: []` por:

```typescript
    imagenes: safeJsonArr(g("imagenes", ["Imágenes", "Imagenes"])),
    videos: safeJsonArr(g("videos", ["Videos"])),
    documentos: safeJsonArr(g("documentos", ["Documentos"])),
```

Y agregar el helper `safeJsonArr` arriba del archivo (era local a `rowToTarea`):

```typescript
function safeJsonArr(v?: string): string[] {
  if (!v) return [];
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Correr los tests**

Run: `npx vitest run lib/sheets/tareas.test.ts`
Expected: PASS (todos, incluido el nuevo).

- [ ] **Step 5: Punto de commit** (usuario / GitLens)

Mensaje sugerido: `refactor(sheets): Tareas mantiene lectura de media por header (compat F1)`.

---

## Task 5: `Tareas` — escritura por header + auditoría

**Files:**
- Modify: `lib/sheets/tareas.ts` (`tareaToRow`, `appendTarea`, `updateTarea`)
- Test: `lib/sheets/tareas.test.ts`

**Contexto:** `tareaToRow` arma hoy un array fijo A:V por índice. Pasa a construir la fila **según el header map** (coloca cada valor en la columna que le corresponde por nombre), sizeando el array al ancho del header. Así, si una columna se reordena, la escritura no se corrompe. Además setea `creado_en`/`actualizado_en` y normaliza fechas/booleanos.

- [ ] **Step 1: Escribir el test que falla**

```typescript
// agregar a lib/sheets/tareas.test.ts
import { tareaToRow } from "./tareas";
import { buildHeaderMap } from "./headers";

describe("tareaToRow — escritura por header", () => {
  it("coloca cada campo en la columna de su header", () => {
    const h = buildHeaderMap(headerNuevo);
    const row = tareaToRow(h, {
      rowId: "2026-07-10T14:30:00.000Z",
      objetivo: "Obj",
      edificio: "Belgrano 1429",
      parteComun: true,
      estado: "Pendiente",
      prioridad: "Alta",
      supervisor: "sup@x.com",
      creadoEn: "2026-07-10T14:30:00.000Z",
      actualizadoEn: "2026-07-12T00:00:00.000Z",
    });
    expect(row[headerNuevo.indexOf("id")]).toBe("2026-07-10T14:30:00.000Z");
    expect(row[headerNuevo.indexOf("objetivo")]).toBe("Obj");
    expect(row[headerNuevo.indexOf("parte_comun")]).toBe("TRUE");
    expect(row[headerNuevo.indexOf("creado_en")]).toBe("2026-07-10T14:30:00.000Z");
    expect(row[headerNuevo.indexOf("actualizado_en")]).toBe("2026-07-12T00:00:00.000Z");
    expect(row.length).toBe(headerNuevo.length);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run lib/sheets/tareas.test.ts -t "escritura por header"`
Expected: FAIL (la firma actual es `tareaToRow(t)` y devuelve 22 columnas por índice fijo).

- [ ] **Step 3: Reescribir `tareaToRow` por header**

```typescript
import { boolToCell, toDateOnly } from "./values";

// Arma la fila según las posiciones del header map. El array se dimensiona al
// ancho del header; cada campo va a la columna de su nombre (o se omite si esa
// columna no existe en la Sheet).
export function tareaToRow(
  h: HeaderMap,
  t: Partial<Tarea> & { rowId: string }
): (string | number)[] {
  const width = Math.max(
    ...[
      "id", "objetivo", "fecha_inicio", "fecha_estimada", "edificio", "parte_comun",
      "dpto", "informe", "comentario_en_proceso", "comentario_realizado", "reporte_url",
      "proveedor", "estado", "presupuesto", "fecha_realizado", "prioridad", "supervisor",
      "creado_en", "actualizado_en",
    ].map((n) => h.index(n) + 1),
    1
  );
  const row: (string | number)[] = new Array(width).fill("");
  const set = (name: string, value: string | number, aliases?: string[]) => {
    const i = h.index(name, aliases);
    if (i !== -1) row[i] = value;
  };
  set("id", t.rowId, ID_ALIASES);
  set("objetivo", t.objetivo ?? "");
  set("fecha_inicio", toDateOnly(t.fechaInicio ?? ""));
  set("fecha_estimada", toDateOnly(t.fechaEstimada ?? ""));
  set("edificio", t.edificio ?? "");
  set("parte_comun", boolToCell(!!t.parteComun));
  set("dpto", t.dpto ?? "", DPTO_ALIASES);
  set("informe", t.informe ?? "");
  set("comentario_en_proceso", t.comentarioEnProceso ?? "");
  set("comentario_realizado", t.comentarioRealizado ?? "");
  set("reporte_url", t.reporteUrl ?? "");
  set("proveedor", t.proveedor ?? "");
  set("estado", t.estado ?? "Pendiente");
  set("presupuesto", t.presupuesto ?? "");
  set("fecha_realizado", toDateOnly(t.fechaRealizado ?? ""));
  set("prioridad", t.prioridad ?? "Media");
  set("supervisor", t.supervisor ?? "");
  set("creado_en", t.creadoEn ?? "");
  set("actualizado_en", t.actualizadoEn ?? "");
  // La media (imagenes/videos/documentos) se mantiene en sus columnas viejas en
  // Fase 1: se escribe aparte (ver nota) hasta que la Fase 2 la mueva a TareaArchivos.
  return row;
}
```

> **Nota media en escritura (Fase 1):** para no perder la media al guardar, agregá al final de `tareaToRow` la escritura de las columnas viejas por header, sólo si existen:
> ```typescript
> const setJson = (name: string, arr: string[] | undefined, aliases: string[]) => {
>   const i = h.index(name, aliases);
>   if (i !== -1) row[i] = JSON.stringify(arr ?? []);
> };
> setJson("imagenes", t.imagenes, ["Imágenes", "Imagenes"]);
> setJson("videos", t.videos, ["Videos"]);
> setJson("documentos", t.documentos, ["Documentos"]);
> ```

- [ ] **Step 4: Actualizar `appendTarea` y `updateTarea` para usar el header map + auditoría**

En `appendTarea`, antes de escribir, leer el header row y setear auditoría:

```typescript
  const now = new Date().toISOString();
  const rowId = input.rowId?.trim() || now;
  const tarea: Tarea = {
    rowId,
    // ...los mismos campos que hoy...
    supervisor,
    creadoEn: now,
    actualizadoEn: now,
  };
  const all = await readRange(`${SHEETS.tareas}!A:Z`);
  const header = all[0] ?? [];
  const h = buildHeaderMap(header);
  const nextRow = all.length + 1;
  const width = tareaToRow(h, tarea).length;
  const lastCol = colLetter(width); // helper: 1->A, 27->AA
  await getSheets().spreadsheets.values.update({
    spreadsheetId: getSheetId(),
    range: `${SHEETS.tareas}!A${nextRow}:${lastCol}${nextRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [tareaToRow(h, tarea)] },
  });
  tarea.rowNumber = nextRow;
  return tarea;
```

En `updateTarea`, tras mergear, setear `actualizadoEn` y escribir por header:

```typescript
  const merged: Tarea = {
    ...current, ...input, rowId: current.rowId,
    actualizadoEn: new Date().toISOString(),
  };
  if (merged.parteComun && !merged.dpto?.trim()) merged.dpto = "Parte Común";
  const all = await readRange(`${SHEETS.tareas}!A:Z`);
  const h = buildHeaderMap(all[0] ?? []);
  const width = tareaToRow(h, merged).length;
  const lastCol = colLetter(width);
  await getSheets().spreadsheets.values.update({
    spreadsheetId: getSheetId(),
    range: `${SHEETS.tareas}!A${current.rowNumber}:${lastCol}${current.rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [tareaToRow(h, merged)] },
  });
  return merged;
```

Agregar el helper `colLetter` en `lib/sheets/headers.ts` (y exportarlo):

```typescript
// Convierte un número de columna 1-based a letra(s) A1: 1->A, 26->Z, 27->AA.
export function colLetter(n: number): string {
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s || "A";
}
```

Y su test en `headers.test.ts`:

```typescript
import { colLetter } from "./headers";
describe("colLetter", () => {
  it("convierte índice de columna a letra A1", () => {
    expect(colLetter(1)).toBe("A");
    expect(colLetter(22)).toBe("V");
    expect(colLetter(26)).toBe("Z");
    expect(colLetter(27)).toBe("AA");
  });
});
```

- [ ] **Step 5: Correr todos los tests de Tareas + headers**

Run: `npx vitest run lib/sheets/tareas.test.ts lib/sheets/headers.test.ts`
Expected: PASS.

- [ ] **Step 6: Actualizar los tests existentes que rompieron**

Los tests en `tests/lib/google-sheets-crud.test.ts` (si mockean `tareaToRow`/`rowToTarea` con la firma vieja) deben actualizarse a la nueva firma `(h, ...)`. Correr toda la suite:

Run: `npx vitest run`
Expected: PASS. Ajustar cualquier test roto por el cambio de firma (mismo comportamiento, nueva firma).

- [ ] **Step 7: Punto de commit** (usuario / GitLens)

Archivos: `lib/sheets/tareas.ts`, `lib/sheets/headers.ts`, `lib/sheets/tareas.test.ts`, `lib/sheets/headers.test.ts`, tests ajustados.
Mensaje sugerido: `feat(sheets): Tareas escribe por header + auditoría creado/actualizado`.

---

## Task 6: `Usuarios` — header + `actualizado_en`

**Files:**
- Modify: `lib/sheets/usuarios.ts`
- Test: `lib/sheets/usuarios.test.ts` *(nuevo)*

- [ ] **Step 1: Escribir el test que falla**

```typescript
// lib/sheets/usuarios.test.ts
import { describe, it, expect } from "vitest";
import { rowsToUsuarios } from "./usuarios";

const header = ["email", "nombre", "rol", "activo", "creado_en", "actualizado_en"];

describe("rowsToUsuarios — por header", () => {
  it("mapea con headers nuevos y normaliza rol/activo", () => {
    const rows = [
      header,
      ["ADMIN@X.com", "Admin", "ADMIN", "TRUE", "2026-01-01T00:00:00Z", ""],
      ["op@x.com", "Op", "supervisor", "FALSE", "2026-02-01T00:00:00Z", "2026-03-01T00:00:00Z"],
    ];
    const us = rowsToUsuarios(rows);
    expect(us).toHaveLength(2);
    expect(us[0].email).toBe("admin@x.com");
    expect(us[0].rol).toBe("admin");
    expect(us[0].activo).toBe(true);
    expect(us[1].activo).toBe(false);
    expect(us[1].actualizadoEn).toBe("2026-03-01T00:00:00Z");
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run lib/sheets/usuarios.test.ts`
Expected: FAIL ("rowsToUsuarios is not exported").

- [ ] **Step 3: Refactor de `usuarios.ts` a header**

Reemplazar `rowToUsuario` + `getUsuarios` por una versión que construye el header map y expone `rowsToUsuarios` (testeable sin red):

```typescript
import { buildHeaderMap } from "./headers";
import { toBool } from "./values";

export function rowsToUsuarios(rows: string[][]): Usuario[] {
  if (rows.length === 0) return [];
  const h = buildHeaderMap(rows[0] ?? []);
  return rows
    .slice(1)
    .filter((r) => h.get(r, "email"))
    .map((r) => {
      const rolRaw = h.get(r, "rol").trim().toLowerCase();
      return {
        email: h.get(r, "email").trim().toLowerCase(),
        nombre: h.get(r, "nombre"),
        rol: (rolRaw === "admin" ? "admin" : "supervisor") as Rol,
        activo: h.get(r, "activo") === "" ? true : toBool(h.get(r, "activo")),
        creadoEn: h.get(r, "creado_en"),
        actualizadoEn: h.get(r, "actualizado_en") || undefined,
      };
    });
}

export async function getUsuarios(): Promise<Usuario[]> {
  if (isDemoMode()) return getDemoUsuarios();
  const rows = await readRange(`${SHEETS.usuarios}!A:F`); // incluye header (fila 1)
  return rowsToUsuarios(rows);
}
```

> Nota: `activo` por defecto `true` cuando la celda está vacía (mantiene el comportamiento actual `!== "false"`).

En `appendUsuario`, agregar `actualizadoEn` = ahora y escribir la columna F. En `setUsuarioActivo`, además de la col `activo`, actualizar `actualizado_en` de esa fila (escribir la celda de `actualizado_en` con el ISO actual, localizando su columna por header).

- [ ] **Step 4: Correr los tests**

Run: `npx vitest run lib/sheets/usuarios.test.ts`
Expected: PASS.

- [ ] **Step 5: Verificar la suite y ajustar tests existentes**

Run: `npx vitest run`
Expected: PASS. Ajustar `tests/lib/google-sheets-crud.test.ts` si testea `getUsuarios` con rangos `A2:E` (ahora es `A:F` con header).

- [ ] **Step 6: Punto de commit** (usuario / GitLens)

Mensaje sugerido: `feat(sheets): Usuarios por header + actualizado_en`.

---

## Task 7: `Directivas` — header + fechas + `actualizado_en`

**Files:**
- Modify: `lib/sheets/directivas.ts`
- Test: `lib/sheets/directivas.test.ts` (existente — ajustar + agregar)

- [ ] **Step 1: Escribir el test que falla**

```typescript
// agregar a lib/sheets/directivas.test.ts
import { rowsToDirectivas } from "./directivas";

const headerDir = [
  "id", "descripcion", "fecha", "asignado_a", "creado_por", "creado_en",
  "estado", "aceptada_en", "realizada_en", "nota_cierre", "objetada_en",
  "nota_objecion", "actualizado_en",
];

describe("rowsToDirectivas — por header", () => {
  it("mapea con headers nuevos y trunca fecha a YYYY-MM-DD", () => {
    const rows = [
      headerDir,
      ["2026-07-17T10:00:00Z", "desc", "2026-07-17T00:00:00Z", "op@x.com",
       "admin@x.com", "2026-07-17T10:00:00Z", "Asignada", "", "", "", "", "", ""],
    ];
    const ds = rowsToDirectivas(rows, Date.now());
    expect(ds[0].fecha).toBe("2026-07-17");
    expect(ds[0].asignadoA).toBe("op@x.com");
    expect(ds[0].estado).toBe("Asignada");
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run lib/sheets/directivas.test.ts -t "por header"`
Expected: FAIL ("rowsToDirectivas is not exported").

- [ ] **Step 3: Refactor de `directivas.ts` a header**

Extraer `rowsToDirectivas(rows, now)` que usa el header map y aplica `estadoEfectivo`, y hacer que `getDirectivas`/`getDirectivaById`/`findDirectivaRow` lo usen. `rowToDirectiva` pasa a leer por header (alias no hacen falta: los nombres camelCase viejos normalizan igual que snake_case, salvo que no — verificar: `asignadoA`→"asignadoa" y `asignado_a`→"asignadoa" ✓). Truncar `fecha` con `toDateOnly`. `directivaToRow` escribe por header y agrega `actualizado_en`. En `updateDirectiva`, setear `actualizadoEn` = ahora en el merge.

```typescript
import { buildHeaderMap } from "./headers";
import { toDateOnly } from "./values";

export function rowsToDirectivas(rows: string[][], now: number): Directiva[] {
  if (rows.length === 0) return [];
  const h = buildHeaderMap(rows[0] ?? []);
  return rows
    .slice(1)
    .filter((r) => h.get(r, "id"))
    .map((r) => {
      const d: Directiva = {
        id: h.get(r, "id"),
        descripcion: h.get(r, "descripcion"),
        fecha: toDateOnly(h.get(r, "fecha")),
        asignadoA: h.get(r, "asignado_a").trim().toLowerCase(),
        creadoPor: h.get(r, "creado_por").trim().toLowerCase(),
        creadoEn: h.get(r, "creado_en"),
        estado: (h.get(r, "estado") as Directiva["estado"]) || "Asignada",
        aceptadaEn: h.get(r, "aceptada_en") || undefined,
        realizadaEn: h.get(r, "realizada_en") || undefined,
        notaCierre: h.get(r, "nota_cierre") || undefined,
        objetadaEn: h.get(r, "objetada_en") || undefined,
        notaObjecion: h.get(r, "nota_objecion") || undefined,
        actualizadoEn: h.get(r, "actualizado_en") || undefined,
      };
      return { ...d, estado: estadoEfectivo(d, now) };
    });
}
```

Y `getDirectivas` pasa a `readRange(\`${SHEETS.directivas}!A:M\`)` (incluye header + la nueva col `actualizado_en` = M).

- [ ] **Step 4: Ajustar los tests existentes de `directivas.test.ts`**

Los tests actuales arman filas por índice sin header (`row(id)` devuelve un array plano) y esperan rangos `A:L`. Actualizarlos para incluir el header row al inicio del array de `rows(...)` y los rangos a `A:M`. Correr:

Run: `npx vitest run lib/sheets/directivas.test.ts`
Expected: PASS (existentes ajustados + nuevo).

- [ ] **Step 5: Verificar la suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 6: Punto de commit** (usuario / GitLens)

Mensaje sugerido: `feat(sheets): Directivas por header + fecha YYYY-MM-DD + actualizado_en`.

---

## Task 8: `Dptos`, `Asignaciones`, `Configuracion` — lectura por header

**Files:**
- Modify: `lib/sheets/edificios.ts` (`getDptos`), `lib/sheets/asignaciones.ts`, `lib/sheets/config.ts`
- Test: `lib/sheets/edificios.test.ts` *(nuevo)* (u otros colocados)

**Motivo:** completar la convención de lectura por header en las hojas simples. **No** se agrega `edificio_cuit` acá (Fase 2). Solo pasar de índice fijo a header.

- [ ] **Step 1: Escribir el test que falla (Dptos)**

```typescript
// lib/sheets/edificios.test.ts
import { describe, it, expect } from "vitest";
import { rowsToDptos } from "./edificios";

describe("rowsToDptos — por header", () => {
  it("mapea con headers nuevos y viejos", () => {
    const nuevo = [["id_dpto", "dpto", "edificio_ref"], ["D1", "3A", "Belgrano 1429"]];
    const viejo = [["ID dpto", "DPTO", "Edificio ref"], ["D2", "HALL", "Nazca 2538"]];
    expect(rowsToDptos(nuevo)[0]).toEqual({ idDpto: "D1", dpto: "3A", edificioRef: "Belgrano 1429" });
    expect(rowsToDptos(viejo)[0]).toEqual({ idDpto: "D2", dpto: "HALL", edificioRef: "Nazca 2538" });
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run lib/sheets/edificios.test.ts`
Expected: FAIL ("rowsToDptos is not exported").

- [ ] **Step 3: Refactor de las 3 hojas a header**

En `edificios.ts`, extraer `rowsToDptos(rows)` con header map (alias: `id_dpto`/"ID dpto", `dpto`/"DPTO", `edificio_ref`/"Edificio ref" — todos normalizan igual salvo el caso, así que no hacen falta alias explícitos) y que `getDptos` lea `Dptos!A:C` (con header) y lo use. Igual para `asignaciones.ts` (headers `email`, `edificio`) y `config.ts` (headers `clave`, `valor`, `descripcion`).

- [ ] **Step 4: Correr los tests**

Run: `npx vitest run lib/sheets/edificios.test.ts`
Expected: PASS.

- [ ] **Step 5: Verificar la suite y ajustar tests existentes**

Run: `npx vitest run`
Expected: PASS. Ajustar rangos en tests que asumían `A2:C`.

- [ ] **Step 6: Punto de commit** (usuario / GitLens)

Mensaje sugerido: `feat(sheets): Dptos/Asignaciones/Configuracion leen por header`.

---

## Task 9: Enums validados con Zod en escritura

**Files:**
- Modify: `lib/schemas.ts` (ya tiene `estadoEnum`, `prioridadEnum`, `rolEnum`)
- Modify: `lib/sheets/tareas.ts`, `lib/sheets/directivas.ts` (validar antes de escribir)

**Motivo:** garantizar que nunca se escriba un enum inválido (typo) a la Sheet.

- [ ] **Step 1: Escribir el test que falla**

```typescript
// agregar a lib/sheets/tareas.test.ts
import { estadoEnum, prioridadEnum } from "@/lib/schemas";
it("los enums de tareaToRow son valores válidos del schema", () => {
  const h = buildHeaderMap(headerNuevo);
  const row = tareaToRow(h, { rowId: "x", estado: "Realizado", prioridad: "Baja" });
  expect(() => estadoEnum.parse(row[headerNuevo.indexOf("estado")])).not.toThrow();
  expect(() => prioridadEnum.parse(row[headerNuevo.indexOf("prioridad")])).not.toThrow();
});
```

- [ ] **Step 2: Correr el test**

Run: `npx vitest run lib/sheets/tareas.test.ts -t "enums"`
Expected: PASS (los defaults ya son válidos) — este test es un guard de regresión. Si el paso previo dejó un default inválido, FALLA y se corrige.

- [ ] **Step 3: Endurecer `appendTarea`/`updateTarea`**

Antes de escribir, parsear `estado`/`prioridad` con los enums de `schemas.ts` (lanzando si son inválidos). Idem `estado` de Directiva. Esto es defensa en profundidad sobre las rutas de API que ya validan.

- [ ] **Step 4: Correr la suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 5: Punto de commit** (usuario / GitLens)

Mensaje sugerido: `feat(sheets): valida enums con Zod antes de escribir`.

---

## Task 10: Verificación end-to-end + checklist de migración manual

**Files:**
- Create: `docs/superpowers/specs/MIGRACION-fase1.md` (checklist de pasos manuales en la planilla)

- [ ] **Step 1: Correr toda la suite y el typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS ambos.

- [ ] **Step 2: Levantar la app y verificar el flujo real (demo-mode primero)**

Usar la skill `run` / `verify` del proyecto. Verificar: listar tareas, abrir detalle (galería con media), crear tarea, editar, y que `creado_en`/`actualizado_en` se pueblan. Con `DEMO_MODE` no toca Sheets reales.

- [ ] **Step 3: Escribir el checklist de migración manual de la planilla**

Crear `docs/superpowers/specs/MIGRACION-fase1.md` con estos pasos (el código ya tolera headers viejos y nuevos, así que esto se puede hacer **después** de deployar, sin downtime):

```markdown
# Migración manual — Fase 1 (planilla)

El código lee/escribe por header con alias, así que estos pasos NO requieren
coordinación con el deploy. Hacerlos en la Sheet principal (GOOGLE_SHEET_ID).

## 1. Backfill de creado_en (Tareas) — ANTES de tocar headers
1. Insertar una columna nueva al final con header `creado_en`.
2. En la primera fila de datos: `=A2` (copia el rowId). Arrastrar hasta el final.
3. Seleccionar la columna → Copiar → Pegado especial → Solo valores.
4. Agregar también columna `actualizado_en` (vacía; se puebla sola en el próximo update).

## 2. Renombrar headers a snake_case (todas las hojas)
Usar el mapa de §6.1 del spec. Ej. Tareas: rowId→id, Fecha inicio→fecha_inicio, etc.
(El código ya matchea ambos, esto es por legibilidad + DB-readiness.)

## 3. Borrar columnas reservadas de Tareas
Eliminar las columnas `(reservado)` y `(reservado2)` (O y P). Están vacías.
El código tolera el corrimiento (lee por header).

## 4. Verificar en la app
Recargar la app y confirmar que todo sigue funcionando (lista, detalle, alta, edición).
```

- [ ] **Step 4: Punto de commit** (usuario / GitLens)

Mensaje sugerido: `docs: checklist de migración manual Fase 1`.

---

## Self-review (hecho por el autor del plan)

- **Cobertura del spec (Fase 1):** lectura por header (Tasks 1,4,6,7,8) ✓ · renombrado snake_case con alias (Task 1 + checklist Task 10) ✓ · borrar O/P (checklist Task 10) ✓ · normalizar enums/fechas/booleanos (Tasks 2,4,9) ✓ · `creado_en`/`actualizado_en` (Tasks 3,5,6,7) ✓ · normalizar Usuarios (Task 6) ✓.
- **Fuera de Fase 1 (correcto que NO esté):** `TareaArchivos`, `edificio_cuit`/backfills, unicidad+cartel de Asignaciones, reporte único, tablas auxiliares → Fase 2.
- **Consistencia de firmas:** `rowToTarea(h, row, rowNumber)`, `tareaToRow(h, t)`, `parseTareasRows(rows)`, `buildHeaderMap(headerRow)`, `colLetter(n)`, `rowsToUsuarios(rows)`, `rowsToDirectivas(rows, now)`, `rowsToDptos(rows)` — usadas consistentemente entre tasks.
- **Riesgo de compat de media:** cubierto explícitamente (Task 4b + nota de escritura en Task 5): la media se sigue leyendo/escribiendo en sus columnas viejas hasta Fase 2.
