# PDF de reportes + adjuntos PDF — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec asociado:** [`docs/superpowers/specs/2026-06-14-pdf-reportes-y-adjuntos.md`](../specs/2026-06-14-pdf-reportes-y-adjuntos.md) — leer primero. Este plan implementa los requisitos FR-1 a FR-21 y NFR-1 a NFR-7 declarados ahí.

**Goal:** Permitir adjuntar PDFs (facturas, presupuestos, planos) a una tarea junto a imágenes/videos, y generar automáticamente un PDF de reporte cuando se marca la tarea como "Realizado", guardándolo en la misma carpeta de Drive de la tarea.

**Architecture:** Dos cambios complementarios sobre la infraestructura existente de Drive. (1) El uploader actual se extiende para aceptar `application/pdf` como tercer tipo, almacenado en una nueva columna `documentos` de la Sheet (JSON array de URLs igual que imágenes/videos). (2) Una nueva ruta `/api/tareas/[id]/reporte` usa `@react-pdf/renderer` (Node SSR) para construir el PDF a partir de los datos de la tarea, lo sube a Drive en la misma carpeta de la tarea, y guarda la URL en una nueva columna `reporteUrl`. La generación es disparable manualmente desde el detalle y automática al transicionar el estado a "Realizado".

**Tech Stack:**
- **Generación PDF:** `@react-pdf/renderer` (TypeScript, JSX declarativo, render Node-side)
- **Testing:** Vitest + @testing-library/react + jsdom (no había framework antes)
- **Validación:** zod (ya en uso)
- **Storage:** Google Drive (misma Service Account ya configurada)
- **Persistencia URLs:** Google Sheets columnas 12 (`documentos`) y 13 (`reporteUrl`) — antes reservadas

---

## Decisiones tomadas (defaults aplicados)

| Decisión | Elegido | Justificación |
|---|---|---|
| Generación automática al cerrar | **Sí (auto + manual)** | Más útil: el reporte queda guardado sin acción manual cuando se cierra la tarea, pero el usuario puede regenerarlo si edita |
| Logo en el PDF | **Texto sin logo en v1** | El archivo `public/logo-source.png` no está subido todavía. Cuando esté, agregamos en una iteración corta posterior |
| Stack de testing | **Vitest + RTL** | No había framework; Vitest es nativo a Vite/Next 16, más rápido que Jest, configuración mínima |
| Compresión PDF | **No** | Los PDFs ya son binarios optimizados |
| Límite tamaño PDF | **20 MB** default, configurable en hoja Configuración (`max_size_pdf_mb`) | Suficiente para presupuestos/facturas/planos típicos |

## Mapping de columnas de la Sheet "Ingreso de Pendiente"

Estado actual (preservar) | Nuevo
---|---
0 rowId · 1 objetivo · 2 fechaInicio · 3 fechaEstimada · 4 edificio · 5 parteComun · 6 dpto · 7 informe · 8 comentarioEnProceso · 9 comentarioRealizado · 10 imagenes · 11 videos · 16 proveedor · 17 estado · 18 presupuesto · 19 fechaRealizado · 20 prioridad · 21 supervisor | **12 documentos** (JSON array URLs) · **13 reporteUrl** (string URL)

Columnas 14-15 quedan reservadas para futuro uso.

---

## File Structure

### Archivos a crear

| Archivo | Responsabilidad |
|---|---|
| `vitest.config.ts` | Configuración de Vitest (jsdom env, alias `@/`, setup file) |
| `vitest.setup.ts` | Setup global (jest-dom matchers, mocks de `next/navigation`) |
| `components/pdf/TareaReportePdf.tsx` | Componente JSX del PDF (header, datos, informe, imágenes thumbnail, comentarios, footer) |
| `lib/pdf-generator.ts` | Wrapper Node-side que renderiza el componente a Buffer + sube a Drive |
| `app/api/tareas/[id]/reporte/route.ts` | Endpoint POST que genera + sube + actualiza Sheet |
| `tests/lib/pdf-generator.test.ts` | Tests del wrapper |
| `tests/lib/google-sheets.test.ts` | Tests de las nuevas funciones de columnas documentos/reporteUrl |
| `tests/components/FileUploader.test.tsx` | Tests del uploader extendido con PDF |
| `tests/api/upload-pdf.test.ts` | Tests del endpoint /api/upload con PDF |
| `tests/api/reporte.test.ts` | Tests del endpoint /api/tareas/[id]/reporte |

### Archivos a modificar

| Archivo | Cambio |
|---|---|
| `package.json` | Sumar `@react-pdf/renderer`, `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`, `@vitejs/plugin-react`; script `test` |
| `types/index.ts` | `Tarea` con `documentos: string[]` y `reporteUrl?: string`; `Configuracion` con `maxSizePdfMB: number` |
| `lib/schemas.ts` | `tareaNuevaSchema` y `tareaUpdateSchema` con `documentos`; `configuracionSchema` con `maxSizePdfMB` |
| `lib/google-sheets.ts` | `rowToTarea` lee col 12 y 13; `tareaToRow` escribe col 12 y 13; `getConfiguracion`/`updateConfiguracion` con `max_size_pdf_mb` |
| `lib/demo-data.ts` | Cada tarea tiene `documentos: []` y `reporteUrl?: string`; agregar 1-2 con docs de ejemplo |
| `lib/api-client.ts` | `api.upload` retorna `kind: "imagen" \| "video" \| "documento"`; `api.tareas.generarReporte(rowId)` |
| `app/api/upload/route.ts` | Aceptar `application/pdf`; validar contra `maxSizePdfMB`; retornar `kind: "documento"` |
| `app/api/tareas/[id]/route.ts` | En `PATCH`, si nuevo estado es "Realizado", disparar generación de reporte (fire-and-forget con catch silencioso) |
| `components/tareas/FileUploader.tsx` | Tercer botón "📄 Documento"; nuevo prop `documentos: string[]`; emite en `onChange({imagenes, videos, documentos})` |
| `components/tareas/TareaForm.tsx` | Pasar `documentos` al FileUploader; incluir en payload de POST/PUT |
| `components/tareas/TareaDetalle.tsx` | Sección "Documentos" listada como links con icono PDF; botón "📋 Descargar reporte" si existe `reporteUrl`, sino "Generar reporte" |

---

## Tasks

### Task 1: Setup de Vitest

**Implements:** NFR-3, NFR-6 · habilita TDD para tasks 2-15
**Files:**
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Modify: `package.json`
- Create: `tests/smoke.test.ts`

- [ ] **Step 1: Instalar dependencias dev**

```powershell
npm install --save-dev vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

Expected: package.json devDependencies actualizado, sin errores.

- [ ] **Step 2: Crear `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    include: ["tests/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
```

- [ ] **Step 3: Crear `vitest.setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Mock next/navigation porque jsdom no implementa router de Next.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  redirect: vi.fn(),
}));
```

- [ ] **Step 4: Agregar scripts en `package.json`**

Modificar la sección `scripts`:

```json
"scripts": {
  "dev": "next dev --webpack",
  "build": "next build --webpack",
  "start": "next start",
  "lint": "eslint",
  "icons": "node scripts/generate-icons.mjs",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 5: Crear test de humo `tests/smoke.test.ts`**

```ts
import { describe, expect, it } from "vitest";

describe("vitest setup", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: Ejecutar el test de humo**

```powershell
npm test
```

Expected: PASS (1/1)

- [ ] **Step 7: Commit**

```powershell
git add vitest.config.ts vitest.setup.ts tests/smoke.test.ts package.json package-lock.json
git commit -m "test: setup Vitest + RTL + jsdom"
```

---

### Task 2: Tipos extendidos (documentos + reporteUrl + maxSizePdfMB)

**Implements:** sección 6 del spec (modelo de datos)
**Files:**
- Modify: `types/index.ts`
- Test: N/A (solo tipos)

- [ ] **Step 1: Extender `Tarea` y derivados en `types/index.ts`**

Buscar la interface `Tarea` y agregar dos campos:

```ts
export interface Tarea {
  // ... (campos existentes hasta videos)
  videos: string[];   // URLs públicas de Drive
  documentos: string[]; // URLs públicas de Drive (PDF)
  reporteUrl?: string;  // URL del reporte PDF generado
  // ... (resto de campos: proveedor, estado, etc.)
}
```

Actualizar `TareaNuevaInput` (Omit) — agregar `documentos` como opcional:

```ts
export type TareaNuevaInput = Omit<
  Tarea,
  "rowId" | "rowNumber" | "comentarioEnProceso" | "comentarioRealizado" | "fechaRealizado" | "supervisor" | "reporteUrl"
> & {
  imagenes?: string[];
  videos?: string[];
  documentos?: string[];
};
```

`TareaPendiente extends TareaNuevaInput` ya lo hereda automáticamente.

- [ ] **Step 2: Extender `Configuracion`**

```ts
export interface Configuracion {
  maxImagenes: number;
  maxVideos: number;
  maxSizeImagenMB: number;
  maxSizeVideoMB: number;
  maxSizePdfMB: number;
}

export const CONFIGURACION_DEFAULT: Configuracion = {
  maxImagenes: 10,
  maxVideos: 3,
  maxSizeImagenMB: 10,
  maxSizeVideoMB: 100,
  maxSizePdfMB: 20,
};
```

- [ ] **Step 3: Verificar type-check**

```powershell
npx tsc --noEmit
```

Expected: van a aparecer errores en lib/google-sheets.ts y lib/demo-data.ts (propiedades faltantes). Eso está esperado — se arreglan en tasks 4 y 6.

- [ ] **Step 4: Commit**

```powershell
git add types/index.ts
git commit -m "feat(types): documentos, reporteUrl y maxSizePdfMB"
```

---

### Task 3: Schemas extendidos

**Implements:** FR-1, FR-3, FR-4 (validación de inputs)
**Files:**
- Modify: `lib/schemas.ts`
- Test: `tests/lib/schemas.test.ts`

- [ ] **Step 1: Escribir test fallido `tests/lib/schemas.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { tareaNuevaSchema, configuracionSchema } from "@/lib/schemas";

describe("tareaNuevaSchema", () => {
  const base = {
    objetivo: "x",
    fechaInicio: "2026-01-01",
    fechaEstimada: "2026-01-10",
    edificio: "Av. 123",
    parteComun: true,
    informe: "test",
    prioridad: "Media" as const,
  };

  it("acepta documentos como array de URLs", () => {
    const result = tareaNuevaSchema.parse({
      ...base,
      documentos: ["https://drive.google.com/file/d/abc/view"],
    });
    expect(result.documentos).toEqual(["https://drive.google.com/file/d/abc/view"]);
  });

  it("documentos default vacío cuando no se pasa", () => {
    const result = tareaNuevaSchema.parse(base);
    expect(result.documentos).toEqual([]);
  });

  it("rechaza documentos que no son URLs", () => {
    expect(() =>
      tareaNuevaSchema.parse({ ...base, documentos: ["no-es-url"] })
    ).toThrow();
  });
});

describe("configuracionSchema", () => {
  it("acepta maxSizePdfMB", () => {
    const result = configuracionSchema.parse({
      maxImagenes: 10,
      maxVideos: 3,
      maxSizeImagenMB: 10,
      maxSizeVideoMB: 100,
      maxSizePdfMB: 20,
    });
    expect(result.maxSizePdfMB).toBe(20);
  });

  it("rechaza maxSizePdfMB negativo", () => {
    expect(() =>
      configuracionSchema.parse({
        maxImagenes: 10,
        maxVideos: 3,
        maxSizeImagenMB: 10,
        maxSizeVideoMB: 100,
        maxSizePdfMB: -1,
      })
    ).toThrow();
  });
});
```

- [ ] **Step 2: Ejecutar el test**

```powershell
npm test tests/lib/schemas.test.ts
```

Expected: FAIL — "documentos" no es propiedad del schema, y "maxSizePdfMB" tampoco.

- [ ] **Step 3: Modificar `lib/schemas.ts`**

En `tareaNuevaSchema`, agregar después de `videos`:

```ts
videos: z.array(z.string().url()).optional().default([]),
documentos: z.array(z.string().url()).optional().default([]),
```

En `tareaUpdateSchema`, después de `videos`:

```ts
videos: z.array(z.string().url()).optional(),
documentos: z.array(z.string().url()).optional(),
```

En `configuracionSchema`, agregar:

```ts
export const configuracionSchema = z.object({
  maxImagenes: z.number().int().min(1),
  maxVideos: z.number().int().min(0),
  maxSizeImagenMB: z.number().positive(),
  maxSizeVideoMB: z.number().positive(),
  maxSizePdfMB: z.number().positive(),
});
```

- [ ] **Step 4: Ejecutar el test**

```powershell
npm test tests/lib/schemas.test.ts
```

Expected: PASS (5/5)

- [ ] **Step 5: Commit**

```powershell
git add lib/schemas.ts tests/lib/schemas.test.ts
git commit -m "feat(schemas): validar documentos y maxSizePdfMB"
```

---

### Task 4: Demo data extendido

**Implements:** FR-20, FR-21 (modo demo con datos de ejemplo)
**Files:**
- Modify: `lib/demo-data.ts`
- Test: `tests/lib/demo-data.test.ts`

- [ ] **Step 1: Escribir test fallido**

```ts
import { describe, expect, it, beforeEach } from "vitest";
import { getDemoTareas, resetDemoState, getDemoConfig } from "@/lib/demo-data";

describe("demo data", () => {
  beforeEach(() => resetDemoState());

  it("toda tarea tiene array de documentos", () => {
    const tareas = getDemoTareas();
    for (const t of tareas) {
      expect(Array.isArray(t.documentos)).toBe(true);
    }
  });

  it("al menos una tarea tiene un documento de ejemplo", () => {
    const tareas = getDemoTareas();
    const conDocs = tareas.filter((t) => t.documentos.length > 0);
    expect(conDocs.length).toBeGreaterThan(0);
  });

  it("config tiene maxSizePdfMB con valor default 20", () => {
    expect(getDemoConfig().maxSizePdfMB).toBe(20);
  });
});
```

- [ ] **Step 2: Ejecutar test**

```powershell
npm test tests/lib/demo-data.test.ts
```

Expected: FAIL — propiedad `documentos` no existe.

- [ ] **Step 3: Modificar `lib/demo-data.ts`**

A cada tarea del array `TAREAS` agregar `documentos: []`. A la tarea con `rowId: "2026-05-28T14:30:22.000Z"` (Pintura exterior) y `"2026-05-20T09:15:00.000Z"` (Caldera) agregar:

```ts
documentos: ["https://drive.google.com/file/d/demo-presupuesto-1/view"],
```

A la tarea con `rowId: "2026-05-20T09:15:00.000Z"` también agregar:

```ts
reporteUrl: "https://drive.google.com/file/d/demo-reporte-caldera/view",
```

Modificar `CONFIG` (en la misma data):

```ts
const CONFIG: Configuracion = {
  maxImagenes: 10,
  maxVideos: 3,
  maxSizeImagenMB: 10,
  maxSizeVideoMB: 100,
  maxSizePdfMB: 20,
};
```

Modificar la firma de `createDemoTarea` para aceptar y persistir `documentos`:

```ts
export function createDemoTarea(
  input: Omit<Tarea, "rowId" | "rowNumber" | "supervisor" | "reporteUrl">,
  supervisor: string
): Tarea {
  const nueva: Tarea = {
    ...input,
    documentos: input.documentos ?? [],
    rowId: new Date().toISOString(),
    rowNumber: state.tareas.length + 2,
    supervisor,
  };
  state.tareas.unshift(nueva);
  return nueva;
}
```

- [ ] **Step 4: Ejecutar test**

```powershell
npm test tests/lib/demo-data.test.ts
```

Expected: PASS (3/3)

- [ ] **Step 5: Commit**

```powershell
git add lib/demo-data.ts tests/lib/demo-data.test.ts
git commit -m "feat(demo): documentos y reporteUrl en datos de ejemplo"
```

---

### Task 5: google-sheets — leer/escribir columnas 12 y 13

**Implements:** FR-6, FR-11, sección 6 del spec (mapping de columnas)
**Files:**
- Modify: `lib/google-sheets.ts`
- Test: `tests/lib/google-sheets-mapping.test.ts`

- [ ] **Step 1: Escribir test fallido (testea las funciones puras de mapeo)**

Las funciones `rowToTarea` y `tareaToRow` no están exportadas. Las exporto solo para tests:

Modificar `lib/google-sheets.ts`, cambiar `function rowToTarea` y `function tareaToRow` a `export function`.

Crear `tests/lib/google-sheets-mapping.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { rowToTarea, tareaToRow } from "@/lib/google-sheets";
import type { Tarea } from "@/types";

describe("rowToTarea", () => {
  it("parsea documentos desde columna 12", () => {
    const row: string[] = new Array(22).fill("");
    row[0] = "2026-06-14T10:00:00.000Z";
    row[1] = "Objetivo";
    row[2] = "2026-06-14";
    row[3] = "2026-06-20";
    row[4] = "Edif";
    row[5] = "FALSE";
    row[6] = "1A";
    row[7] = "Informe";
    row[10] = "[]";
    row[11] = "[]";
    row[12] = '["https://drive.google.com/file/d/abc/view"]';
    row[13] = "https://drive.google.com/file/d/reporte/view";
    row[17] = "Pendiente";
    row[20] = "Media";

    const t = rowToTarea(row, 2);
    expect(t.documentos).toEqual(["https://drive.google.com/file/d/abc/view"]);
    expect(t.reporteUrl).toBe("https://drive.google.com/file/d/reporte/view");
  });

  it("documentos vacío si columna 12 está vacía", () => {
    const row: string[] = new Array(22).fill("");
    row[0] = "2026-06-14T10:00:00.000Z";
    row[10] = "[]";
    row[11] = "[]";
    row[17] = "Pendiente";
    row[20] = "Media";

    const t = rowToTarea(row, 2);
    expect(t.documentos).toEqual([]);
    expect(t.reporteUrl).toBeUndefined();
  });
});

describe("tareaToRow", () => {
  it("escribe documentos como JSON en columna 12", () => {
    const t: Tarea = {
      rowId: "2026-06-14T10:00:00.000Z",
      objetivo: "x",
      fechaInicio: "2026-06-14",
      fechaEstimada: "2026-06-20",
      edificio: "Edif",
      parteComun: false,
      dpto: "1A",
      informe: "y",
      imagenes: [],
      videos: [],
      documentos: ["https://drive.google.com/file/d/abc/view"],
      estado: "Pendiente",
      prioridad: "Media",
      supervisor: "a@b.com",
    };
    const row = tareaToRow(t);
    expect(row[12]).toBe(JSON.stringify(["https://drive.google.com/file/d/abc/view"]));
  });

  it("escribe reporteUrl en columna 13", () => {
    const t: Tarea = {
      rowId: "2026-06-14T10:00:00.000Z",
      objetivo: "x",
      fechaInicio: "2026-06-14",
      fechaEstimada: "2026-06-20",
      edificio: "Edif",
      parteComun: false,
      dpto: "1A",
      informe: "y",
      imagenes: [],
      videos: [],
      documentos: [],
      reporteUrl: "https://drive.google.com/file/d/reporte/view",
      estado: "Realizado",
      prioridad: "Media",
      supervisor: "a@b.com",
    };
    const row = tareaToRow(t);
    expect(row[13]).toBe("https://drive.google.com/file/d/reporte/view");
  });
});
```

- [ ] **Step 2: Ejecutar test**

```powershell
npm test tests/lib/google-sheets-mapping.test.ts
```

Expected: FAIL — documentos/reporteUrl no se mapean.

- [ ] **Step 3: Modificar `rowToTarea` y `tareaToRow` en `lib/google-sheets.ts`**

En `rowToTarea`, después de la línea `videos: safeJsonArr(row[11]),` agregar:

```ts
documentos: safeJsonArr(row[12]),
reporteUrl: row[13] || undefined,
```

En `tareaToRow`, después de `row[11] = JSON.stringify(t.videos ?? []);` agregar:

```ts
row[12] = JSON.stringify(t.documentos ?? []);
row[13] = t.reporteUrl ?? "";
// 14-15 reservadas
```

Eliminar el comentario viejo "12-15 reservadas".

- [ ] **Step 4: Ejecutar test**

```powershell
npm test tests/lib/google-sheets-mapping.test.ts
```

Expected: PASS (4/4)

- [ ] **Step 5: Actualizar `getConfiguracion` y `updateConfiguracion` para `max_size_pdf_mb`**

En `getConfiguracion`, dentro del bloque que construye `data`:

```ts
const data: Configuracion = {
  maxImagenes: Number(map.get("max_imagenes")) || CONFIGURACION_DEFAULT.maxImagenes,
  maxVideos: Number(map.get("max_videos")) || CONFIGURACION_DEFAULT.maxVideos,
  maxSizeImagenMB: Number(map.get("max_size_imagen_mb")) || CONFIGURACION_DEFAULT.maxSizeImagenMB,
  maxSizeVideoMB: Number(map.get("max_size_video_mb")) || CONFIGURACION_DEFAULT.maxSizeVideoMB,
  maxSizePdfMB: Number(map.get("max_size_pdf_mb")) || CONFIGURACION_DEFAULT.maxSizePdfMB,
};
```

En `updateConfiguracion`, agregar a `entries`:

```ts
const entries: [string, number][] = [
  ["max_imagenes", cfg.maxImagenes],
  ["max_videos", cfg.maxVideos],
  ["max_size_imagen_mb", cfg.maxSizeImagenMB],
  ["max_size_video_mb", cfg.maxSizeVideoMB],
  ["max_size_pdf_mb", cfg.maxSizePdfMB],
];
```

Y actualizar el rango (5 filas en lugar de 4):

```ts
range: `${SHEETS.configuracion}!A2:B${entries.length + 1}`,
```

- [ ] **Step 6: Verificar type-check**

```powershell
npx tsc --noEmit
```

Expected: 0 errores (los tipos extendidos ahora cuadran).

- [ ] **Step 7: Commit**

```powershell
git add lib/google-sheets.ts tests/lib/google-sheets-mapping.test.ts
git commit -m "feat(sheets): documentos col 12, reporteUrl col 13, maxSizePdfMB"
```

---

### Task 6: API /upload acepta PDFs

**Implements:** FR-1, FR-3, AC-3
**Files:**
- Modify: `app/api/upload/route.ts`
- Test: `tests/api/upload-pdf.test.ts`

- [ ] **Step 1: Escribir test fallido**

Los tests de API requieren mockear `google-sheets` y `google-drive` porque las dependencias hablan con Google. Mock parcial:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/upload/route";

vi.mock("@/lib/auth", () => ({
  requireSession: vi.fn().mockResolvedValue({ user: { email: "test@x.com", rol: "admin" } }),
}));

vi.mock("@/lib/google-drive", () => ({
  ensureTareaFolder: vi.fn().mockResolvedValue("folder-id"),
  uploadFile: vi.fn().mockResolvedValue({
    fileId: "fake-id",
    name: "doc.pdf",
    url: "https://drive.google.com/file/d/fake-id/view",
  }),
}));

vi.mock("@/lib/google-sheets", () => ({
  getConfiguracion: vi.fn().mockResolvedValue({
    maxImagenes: 10,
    maxVideos: 3,
    maxSizeImagenMB: 10,
    maxSizeVideoMB: 100,
    maxSizePdfMB: 20,
  }),
}));

function makeRequest(file: File): Request {
  const form = new FormData();
  form.append("file", file);
  form.append("edificio", "Av. 123");
  form.append("objetivo", "Test");
  return new Request("http://localhost/api/upload", { method: "POST", body: form });
}

describe("POST /api/upload con PDF", () => {
  beforeEach(() => vi.clearAllMocks());

  it("acepta application/pdf y retorna kind=documento", async () => {
    const file = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "doc.pdf", {
      type: "application/pdf",
    });
    const res = await POST(makeRequest(file) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.kind).toBe("documento");
    expect(body.url).toContain("drive.google.com");
  });

  it("rechaza PDF que excede maxSizePdfMB", async () => {
    const bigBytes = new Uint8Array(25 * 1024 * 1024); // 25MB > 20MB default
    const file = new File([bigBytes], "big.pdf", { type: "application/pdf" });
    const res = await POST(makeRequest(file) as never);
    expect(res.status).toBe(413);
  });
});
```

- [ ] **Step 2: Ejecutar test**

```powershell
npm test tests/api/upload-pdf.test.ts
```

Expected: FAIL — tipo PDF rechazado por "Tipo de archivo no permitido".

- [ ] **Step 3: Modificar `app/api/upload/route.ts`**

Agregar constante:

```ts
const PDF_MIMES = new Set(["application/pdf"]);
```

Reemplazar el bloque de detección de tipo:

```ts
const isImage = IMAGE_MIMES.has(file.type);
const isVideo = VIDEO_MIMES.has(file.type);
const isPdf = PDF_MIMES.has(file.type);
if (!isImage && !isVideo && !isPdf) {
  return jsonError(400, `Tipo de archivo no permitido: ${file.type}`);
}

const cfg = await getConfiguracion();
const sizeMB = file.size / (1024 * 1024);
if (isImage && sizeMB > cfg.maxSizeImagenMB) {
  return jsonError(413, `Imagen excede el máximo de ${cfg.maxSizeImagenMB}MB`);
}
if (isVideo && sizeMB > cfg.maxSizeVideoMB) {
  return jsonError(413, `Video excede el máximo de ${cfg.maxSizeVideoMB}MB`);
}
if (isPdf && sizeMB > cfg.maxSizePdfMB) {
  return jsonError(413, `PDF excede el máximo de ${cfg.maxSizePdfMB}MB`);
}
```

Reemplazar el `return`:

```ts
const kind = isImage ? "imagen" : isVideo ? "video" : "documento";
return NextResponse.json({ url: result.url, fileId: result.fileId, kind });
```

- [ ] **Step 4: Ejecutar test**

```powershell
npm test tests/api/upload-pdf.test.ts
```

Expected: PASS (2/2)

- [ ] **Step 5: Commit**

```powershell
git add app/api/upload/route.ts tests/api/upload-pdf.test.ts
git commit -m "feat(upload): aceptar PDFs como kind=documento"
```

---

### Task 7: api-client actualizado

**Implements:** habilita FR-1 (upload de docs desde cliente) y FR-15 (generación manual desde detalle)
**Files:**
- Modify: `lib/api-client.ts`

- [ ] **Step 1: Cambiar el tipo de retorno de `upload`**

En `lib/api-client.ts`, dentro del export `api`, cambiar:

```ts
upload: async (file: File, edificio: string, objetivo: string): Promise<{ url: string; kind: "imagen" | "video" | "documento" }> => {
  // ... (sin cambios al body)
}
```

- [ ] **Step 2: Agregar `tareas.generarReporte`**

Dentro del objeto `tareas`:

```ts
generarReporte: (rowId: string) =>
  request<{ reporteUrl: string }>(`/api/tareas/${encodeURIComponent(rowId)}/reporte`, {
    method: "POST",
  }),
```

- [ ] **Step 3: Verificar type-check**

```powershell
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```powershell
git add lib/api-client.ts
git commit -m "feat(api-client): kind=documento + generarReporte"
```

---

### Task 8: FileUploader con botón Documento

**Implements:** FR-1, FR-2, FR-4, FR-8, AC-1, AC-4
**Files:**
- Modify: `components/tareas/FileUploader.tsx`
- Test: `tests/components/FileUploader.test.tsx`

- [ ] **Step 1: Escribir test fallido**

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { FileUploader } from "@/components/tareas/FileUploader";
import { CONFIGURACION_DEFAULT } from "@/types";

vi.mock("@/lib/api-client", () => ({
  api: { upload: vi.fn() },
}));

describe("FileUploader", () => {
  const baseProps = {
    edificio: "Av. 123",
    objetivo: "Test",
    config: CONFIGURACION_DEFAULT,
    imagenes: [],
    videos: [],
    documentos: [],
    onChange: vi.fn(),
  };

  it("muestra el botón Documento con contador", () => {
    render(<FileUploader {...baseProps} />);
    expect(screen.getByText(/Documento/i)).toBeInTheDocument();
    expect(screen.getByText(/0\/20/)).toBeInTheDocument();
  });

  it("renderiza un documento existente como link", () => {
    render(
      <FileUploader
        {...baseProps}
        documentos={["https://drive.google.com/file/d/doc1/view"]}
      />
    );
    const link = screen.getByRole("link", { name: /documento/i });
    expect(link).toHaveAttribute("href", "https://drive.google.com/file/d/doc1/view");
  });
});
```

Nota: el "0/20" sale del `config.maxSizePdfMB` default — el contador del botón se ajustará para que vea sense. Si decidís limitar por cantidad y no por tamaño, ajustá el test.

Mejor: usar `config.maxImagenes` y `config.maxVideos` como pattern existente. Para documentos vamos a usar un nuevo `config.maxDocumentos` (default 5 — sumar al schema y types). 

**Decisión incorporada:** sumar `maxDocumentos: number` a `Configuracion` (default 5). Esto debió haberse hecho en Task 2. **Volver y agregar en Task 2 antes de proceder.**

⚠️ **Acción correctiva:** Si llegaste a esta task sin haber agregado `maxDocumentos` en Task 2, hacelo ahora:

```ts
// types/index.ts
export interface Configuracion {
  maxImagenes: number;
  maxVideos: number;
  maxDocumentos: number;
  maxSizeImagenMB: number;
  maxSizeVideoMB: number;
  maxSizePdfMB: number;
}

export const CONFIGURACION_DEFAULT: Configuracion = {
  maxImagenes: 10,
  maxVideos: 3,
  maxDocumentos: 5,
  maxSizeImagenMB: 10,
  maxSizeVideoMB: 100,
  maxSizePdfMB: 20,
};
```

Y en `lib/schemas.ts`:

```ts
export const configuracionSchema = z.object({
  maxImagenes: z.number().int().min(1),
  maxVideos: z.number().int().min(0),
  maxDocumentos: z.number().int().min(0),
  maxSizeImagenMB: z.number().positive(),
  maxSizeVideoMB: z.number().positive(),
  maxSizePdfMB: z.number().positive(),
});
```

Y en `lib/google-sheets.ts` (`getConfiguracion`, `updateConfiguracion`) y `lib/demo-data.ts` (`CONFIG`). Re-correr tests de tasks 2-5 para validar.

Reemplazar el test "0/20" por "0/5":

```tsx
expect(screen.getByText(/0\/5/)).toBeInTheDocument();
```

- [ ] **Step 2: Ejecutar test**

```powershell
npm test tests/components/FileUploader.test.tsx
```

Expected: FAIL — botón Documento no existe.

- [ ] **Step 3: Modificar `components/tareas/FileUploader.tsx`**

Cambiar props:

```tsx
interface Props {
  edificio: string;
  objetivo: string;
  config: Configuracion;
  imagenes: string[];
  videos: string[];
  documentos: string[];
  onChange: (next: { imagenes: string[]; videos: string[]; documentos: string[] }) => void;
  disabled?: boolean;
}
```

Agregar constante:

```ts
const PDF_MIMES = ["application/pdf"];
```

Agregar import del icono:

```ts
import { Camera, Film, FileText, Loader2, Trash2, Upload } from "lucide-react";
```

Agregar ref + estado:

```ts
const docInput = useRef<HTMLInputElement | null>(null);
```

```ts
const docFull = documentos.length >= config.maxDocumentos;
```

Extender `handleFiles` para soportar `kind: "documento"`:

```tsx
const handleFiles = async (files: FileList | null, kind: "imagen" | "video" | "documento") => {
  // ...
  const newImgs = [...imagenes];
  const newVids = [...videos];
  const newDocs = [...documentos];

  for (const raw of Array.from(files)) {
    const isImage = IMAGE_MIMES.includes(raw.type);
    const isVideo = VIDEO_MIMES.includes(raw.type);
    const isPdf = PDF_MIMES.includes(raw.type);

    if (kind === "imagen" && !isImage) { setError(`Tipo no permitido: ${raw.type}`); continue; }
    if (kind === "video" && !isVideo) { setError(`Tipo no permitido: ${raw.type}`); continue; }
    if (kind === "documento" && !isPdf) { setError(`Tipo no permitido: ${raw.type}`); continue; }

    if (kind === "imagen" && newImgs.length >= config.maxImagenes) break;
    if (kind === "video" && newVids.length >= config.maxVideos) break;
    if (kind === "documento" && newDocs.length >= config.maxDocumentos) break;

    let file = raw;
    if (isImage) {
      file = await imageCompression(raw, { /* ... */ });
    } else if (isVideo) {
      const sizeMB = raw.size / (1024 * 1024);
      if (sizeMB > config.maxSizeVideoMB) { setError(`Video excede ${config.maxSizeVideoMB}MB`); continue; }
    } else if (isPdf) {
      const sizeMB = raw.size / (1024 * 1024);
      if (sizeMB > config.maxSizePdfMB) { setError(`PDF excede ${config.maxSizePdfMB}MB`); continue; }
    }

    const result = await api.upload(file, edificio, objetivo);
    if (result.kind === "imagen") newImgs.push(result.url);
    else if (result.kind === "video") newVids.push(result.url);
    else newDocs.push(result.url);
  }

  onChange({ imagenes: newImgs, videos: newVids, documentos: newDocs });
  // ...
};
```

Agregar input file:

```tsx
<input
  ref={docInput}
  type="file"
  accept="application/pdf"
  multiple
  hidden
  onChange={(e) => handleFiles(e.target.files, "documento")}
/>
```

Agregar tercer botón en el grid (cambiar grid-cols-2 a grid-cols-3):

```tsx
<div className="grid grid-cols-3 gap-2">
  {/* botón Imagen existente */}
  {/* botón Video existente */}
  <button
    type="button"
    disabled={disabled || busy || docFull || !canUpload}
    onClick={() => docInput.current?.click()}
    className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm font-medium text-slate-700 disabled:opacity-50"
  >
    {busy ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
    Documento ({documentos.length}/{config.maxDocumentos})
  </button>
</div>
```

Agregar función removeDocumento + sección de documentos al final del JSX:

```tsx
const removeDocumento = (url: string) =>
  onChange({ imagenes, videos, documentos: documentos.filter((u) => u !== url) });
```

```tsx
{documentos.length > 0 && (
  <ul className="space-y-1">
    {documentos.map((url) => (
      <li key={url} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
        <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 truncate text-slate-700 underline">
          <FileText size={14} />
          Documento adjunto
        </a>
        <button
          type="button"
          onClick={() => removeDocumento(url)}
          className="text-red-600"
          aria-label="Eliminar documento"
        >
          <Trash2 size={14} />
        </button>
      </li>
    ))}
  </ul>
)}
```

Limpiar inputs en finally:

```ts
if (docInput.current) docInput.current.value = "";
```

- [ ] **Step 4: Ejecutar test**

```powershell
npm test tests/components/FileUploader.test.tsx
```

Expected: PASS (2/2)

- [ ] **Step 5: Actualizar callsites de FileUploader (TareaForm)**

En `components/tareas/TareaForm.tsx`, agregar estado:

```ts
const [documentos, setDocumentos] = useState<string[]>(initial?.documentos ?? []);
```

Pasarlo al uploader:

```tsx
<FileUploader
  edificio={edificio}
  objetivo={objetivo}
  config={config}
  imagenes={imagenes}
  videos={videos}
  documentos={documentos}
  disabled={!online}
  onChange={({ imagenes: imgs, videos: vids, documentos: docs }) => {
    setImagenes(imgs);
    setVideos(vids);
    setDocumentos(docs);
  }}
/>
```

Incluir en el payload de `onSubmit`:

```ts
const payload = {
  // ...
  imagenes,
  videos,
  documentos,
};
```

- [ ] **Step 6: Verificar type-check + build**

```powershell
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 7: Commit**

```powershell
git add components/tareas/FileUploader.tsx components/tareas/TareaForm.tsx tests/components/FileUploader.test.tsx
git commit -m "feat(uploader): botón Documento para adjuntar PDFs"
```

---

### Task 9: TareaDetalle muestra documentos

**Implements:** FR-7, AC-2
**Files:**
- Modify: `components/tareas/TareaDetalle.tsx`
- Test: `tests/components/TareaDetalle.test.tsx`

- [ ] **Step 1: Escribir test fallido**

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TareaDetalle } from "@/components/tareas/TareaDetalle";
import type { Tarea } from "@/types";

const tarea: Tarea = {
  rowId: "2026-06-14T10:00:00.000Z",
  objetivo: "Test",
  fechaInicio: "2026-06-14",
  fechaEstimada: "2026-06-20",
  edificio: "Av. 123",
  parteComun: false,
  dpto: "1A",
  informe: "Informe de prueba",
  imagenes: [],
  videos: [],
  documentos: ["https://drive.google.com/file/d/doc1/view"],
  estado: "Pendiente",
  prioridad: "Media",
  supervisor: "a@b.com",
};

vi.mock("@/lib/api-client", () => ({
  api: {
    tareas: {
      get: vi.fn().mockResolvedValue(tarea),
      patchEstado: vi.fn(),
      generarReporte: vi.fn(),
    },
  },
}));

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe("TareaDetalle", () => {
  it("muestra la sección de documentos cuando hay PDFs adjuntos", async () => {
    render(wrap(<TareaDetalle rowId={tarea.rowId} />));
    const link = await screen.findByRole("link", { name: /documento/i });
    expect(link).toHaveAttribute("href", tarea.documentos[0]);
  });
});
```

- [ ] **Step 2: Ejecutar**

```powershell
npm test tests/components/TareaDetalle.test.tsx
```

Expected: FAIL — sección "Documentos" no existe.

- [ ] **Step 3: Modificar `components/tareas/TareaDetalle.tsx`**

Agregar import:

```tsx
import { FileText } from "lucide-react";
```

Después de la sección de Videos, agregar la sección de Documentos:

```tsx
{t.documentos.length > 0 && (
  <Section title={`Documentos (${t.documentos.length})`}>
    <ul className="space-y-1">
      {t.documentos.map((url) => (
        <li key={url}>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 underline"
          >
            <FileText size={14} /> Documento adjunto
          </a>
        </li>
      ))}
    </ul>
  </Section>
)}
```

- [ ] **Step 4: Ejecutar**

```powershell
npm test tests/components/TareaDetalle.test.tsx
```

Expected: PASS (1/1)

- [ ] **Step 5: Commit**

```powershell
git add components/tareas/TareaDetalle.tsx tests/components/TareaDetalle.test.tsx
git commit -m "feat(detalle): sección documentos en TareaDetalle"
```

---

### Task 10: Instalar @react-pdf/renderer + componente PDF

**Implements:** FR-9 (estructura del PDF), AC-8
**Files:**
- Modify: `package.json`
- Create: `components/pdf/TareaReportePdf.tsx`
- Test: N/A en este paso (la generación se testea en Task 12)

- [ ] **Step 1: Instalar**

```powershell
npm install @react-pdf/renderer
```

- [ ] **Step 2: Crear `components/pdf/TareaReportePdf.tsx`**

```tsx
import { Document, Page, Text, View, StyleSheet, Image, Link } from "@react-pdf/renderer";
import type { Tarea } from "@/types";

const colors = {
  text: "#0f172a",
  muted: "#64748b",
  border: "#e2e8f0",
  accent: "#7c92aa",
};

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 11, color: colors.text, fontFamily: "Helvetica" },
  header: { borderBottom: `2pt solid ${colors.accent}`, paddingBottom: 8, marginBottom: 16 },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold" },
  subtitle: { fontSize: 10, color: colors.muted, marginTop: 2 },
  section: { marginBottom: 12 },
  sectionTitle: { fontSize: 12, fontFamily: "Helvetica-Bold", marginBottom: 4, color: colors.accent },
  row: { flexDirection: "row", marginBottom: 2 },
  label: { width: 110, color: colors.muted },
  value: { flex: 1 },
  text: { lineHeight: 1.4 },
  imageGrid: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  thumb: { width: 120, height: 120, marginRight: 4, marginBottom: 4 },
  footer: { position: "absolute", bottom: 30, left: 40, right: 40, fontSize: 8, color: colors.muted, textAlign: "center" },
});

function thumbFromDriveUrl(url: string): string {
  const m = url.match(/\/file\/d\/([^/]+)/);
  return m ? `https://drive.google.com/thumbnail?id=${m[1]}&sz=w400` : url;
}

export function TareaReportePdf({ tarea, generatedAt }: { tarea: Tarea; generatedAt: string }) {
  const fmtCurrency = (n?: number) => (n != null ? `$${n.toLocaleString("es-AR")}` : "—");
  const fmtDate = (s?: string) => (s ? s.slice(0, 10) : "—");

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Reporte de Tarea</Text>
          <Text style={styles.subtitle}>Administración Morinigo · {tarea.edificio}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Datos</Text>
          <View style={styles.row}><Text style={styles.label}>Objetivo:</Text><Text style={styles.value}>{tarea.objetivo}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Dpto:</Text><Text style={styles.value}>{tarea.parteComun ? "Parte Común" : tarea.dpto}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Estado:</Text><Text style={styles.value}>{tarea.estado}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Prioridad:</Text><Text style={styles.value}>{tarea.prioridad}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Fecha inicio:</Text><Text style={styles.value}>{fmtDate(tarea.fechaInicio)}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Fecha estimada:</Text><Text style={styles.value}>{fmtDate(tarea.fechaEstimada)}</Text></View>
          {tarea.fechaRealizado && (
            <View style={styles.row}><Text style={styles.label}>Realizado:</Text><Text style={styles.value}>{fmtDate(tarea.fechaRealizado)}</Text></View>
          )}
          {tarea.proveedor && (
            <View style={styles.row}><Text style={styles.label}>Proveedor:</Text><Text style={styles.value}>{tarea.proveedor}</Text></View>
          )}
          <View style={styles.row}><Text style={styles.label}>Presupuesto:</Text><Text style={styles.value}>{fmtCurrency(tarea.presupuesto)}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Supervisor:</Text><Text style={styles.value}>{tarea.supervisor}</Text></View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Informe</Text>
          <Text style={styles.text}>{tarea.informe || "—"}</Text>
        </View>

        {(tarea.comentarioEnProceso || tarea.comentarioRealizado) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Comentarios</Text>
            {tarea.comentarioEnProceso && (
              <View>
                <Text style={styles.label}>En proceso:</Text>
                <Text style={styles.text}>{tarea.comentarioEnProceso}</Text>
              </View>
            )}
            {tarea.comentarioRealizado && (
              <View style={{ marginTop: 6 }}>
                <Text style={styles.label}>Realizado:</Text>
                <Text style={styles.text}>{tarea.comentarioRealizado}</Text>
              </View>
            )}
          </View>
        )}

        {tarea.imagenes.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Imágenes ({tarea.imagenes.length})</Text>
            <View style={styles.imageGrid}>
              {tarea.imagenes.slice(0, 9).map((url) => (
                <Image key={url} src={thumbFromDriveUrl(url)} style={styles.thumb} />
              ))}
            </View>
          </View>
        )}

        {tarea.videos.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Videos ({tarea.videos.length})</Text>
            {tarea.videos.map((url) => (
              <Link key={url} src={url}><Text style={{ color: colors.accent }}>{url}</Text></Link>
            ))}
          </View>
        )}

        {tarea.documentos.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Documentos adjuntos ({tarea.documentos.length})</Text>
            {tarea.documentos.map((url) => (
              <Link key={url} src={url}><Text style={{ color: colors.accent }}>{url}</Text></Link>
            ))}
          </View>
        )}

        <Text style={styles.footer} fixed>
          Generado el {generatedAt} · Administración Morinigo
        </Text>
      </Page>
    </Document>
  );
}
```

- [ ] **Step 3: Verificar type-check**

```powershell
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```powershell
git add components/pdf/TareaReportePdf.tsx package.json package-lock.json
git commit -m "feat(pdf): componente TareaReportePdf con react-pdf"
```

---

### Task 11: pdf-generator (Buffer + upload a Drive)

**Implements:** FR-9, FR-10, NFR-1
**Files:**
- Create: `lib/pdf-generator.ts`
- Test: `tests/lib/pdf-generator.test.ts`

- [ ] **Step 1: Escribir test fallido**

```ts
import { describe, expect, it, vi } from "vitest";
import type { Tarea } from "@/types";

vi.mock("@/lib/google-drive", () => ({
  ensureTareaFolder: vi.fn().mockResolvedValue("folder-id"),
  uploadFile: vi.fn().mockResolvedValue({
    fileId: "reporte-id",
    name: "reporte.pdf",
    url: "https://drive.google.com/file/d/reporte-id/view",
  }),
}));

const tareaBase: Tarea = {
  rowId: "2026-06-14T10:00:00.000Z",
  objetivo: "Pintura",
  fechaInicio: "2026-06-14",
  fechaEstimada: "2026-06-20",
  edificio: "Av. 123",
  parteComun: true,
  dpto: "Parte Común",
  informe: "Informe",
  imagenes: [],
  videos: [],
  documentos: [],
  estado: "Realizado",
  prioridad: "Media",
  supervisor: "test@x.com",
};

describe("generateAndUploadReporte", () => {
  it("retorna una URL de Drive", async () => {
    const { generateAndUploadReporte } = await import("@/lib/pdf-generator");
    const result = await generateAndUploadReporte(tareaBase);
    expect(result.url).toMatch(/drive\.google\.com\/file\/d\/.+\/view/);
  });

  it("usa ensureTareaFolder con edificio y objetivo de la tarea", async () => {
    const { generateAndUploadReporte } = await import("@/lib/pdf-generator");
    const { ensureTareaFolder } = await import("@/lib/google-drive");
    await generateAndUploadReporte(tareaBase);
    expect(ensureTareaFolder).toHaveBeenCalledWith({
      edificio: tareaBase.edificio,
      objetivo: tareaBase.objetivo,
    });
  });
});
```

- [ ] **Step 2: Ejecutar**

```powershell
npm test tests/lib/pdf-generator.test.ts
```

Expected: FAIL — módulo no existe.

- [ ] **Step 3: Crear `lib/pdf-generator.ts`**

```ts
import { renderToBuffer } from "@react-pdf/renderer";
import { TareaReportePdf } from "@/components/pdf/TareaReportePdf";
import { ensureTareaFolder, uploadFile } from "./google-drive";
import type { Tarea } from "@/types";

export async function generateAndUploadReporte(tarea: Tarea): Promise<{ url: string; fileId: string }> {
  const generatedAt = new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
  const buffer = await renderToBuffer(<TareaReportePdf tarea={tarea} generatedAt={generatedAt} />);

  const folderId = await ensureTareaFolder({
    edificio: tarea.edificio,
    objetivo: tarea.objetivo,
  });

  const safeName = tarea.objetivo.replace(/[^a-z0-9]/gi, "_").toLowerCase().slice(0, 40);
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const fileName = `reporte_${safeName}_${ts}.pdf`;

  const result = await uploadFile({
    buffer,
    name: fileName,
    mimeType: "application/pdf",
    folderId,
  });

  return { url: result.url, fileId: result.fileId };
}
```

Notar que usa JSX en `.ts` — necesita renombrar a `.tsx`. Renombrar el archivo a `lib/pdf-generator.tsx`.

- [ ] **Step 4: Ejecutar**

```powershell
npm test tests/lib/pdf-generator.test.ts
```

Expected: PASS (2/2)

- [ ] **Step 5: Commit**

```powershell
git add lib/pdf-generator.tsx tests/lib/pdf-generator.test.ts
git commit -m "feat(pdf): generador + upload a Drive"
```

---

### Task 12: Endpoint /api/tareas/[id]/reporte

**Implements:** FR-15, FR-17, FR-18, FR-19, AC-7, AC-9
**Files:**
- Create: `app/api/tareas/[id]/reporte/route.ts`
- Test: `tests/api/reporte.test.ts`

- [ ] **Step 1: Escribir test fallido**

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({
  requireSession: vi.fn().mockResolvedValue({ user: { email: "test@x.com", rol: "admin" } }),
}));

const fakeTarea = {
  rowId: "2026-06-14T10:00:00.000Z",
  objetivo: "Test",
  fechaInicio: "2026-06-14",
  fechaEstimada: "2026-06-20",
  edificio: "Av. 123",
  parteComun: true,
  dpto: "Parte Común",
  informe: "x",
  imagenes: [],
  videos: [],
  documentos: [],
  estado: "Realizado",
  prioridad: "Media",
  supervisor: "test@x.com",
};

vi.mock("@/lib/google-sheets", () => ({
  getTareaByRowId: vi.fn().mockResolvedValue(fakeTarea),
  updateTarea: vi.fn().mockResolvedValue(fakeTarea),
}));

vi.mock("@/lib/pdf-generator", () => ({
  generateAndUploadReporte: vi.fn().mockResolvedValue({
    url: "https://drive.google.com/file/d/reporte/view",
    fileId: "reporte",
  }),
}));

describe("POST /api/tareas/[id]/reporte", () => {
  beforeEach(() => vi.clearAllMocks());

  it("genera el reporte y devuelve la URL", async () => {
    const { POST } = await import("@/app/api/tareas/[id]/reporte/route");
    const req = new Request("http://localhost/api/tareas/foo/reporte", { method: "POST" });
    const res = await POST(req as never, { params: Promise.resolve({ id: "2026-06-14T10:00:00.000Z" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reporteUrl).toBe("https://drive.google.com/file/d/reporte/view");
  });

  it("actualiza la Sheet con la URL del reporte", async () => {
    const { POST } = await import("@/app/api/tareas/[id]/reporte/route");
    const { updateTarea } = await import("@/lib/google-sheets");
    const req = new Request("http://localhost/api/tareas/foo/reporte", { method: "POST" });
    await POST(req as never, { params: Promise.resolve({ id: "2026-06-14T10:00:00.000Z" }) });
    expect(updateTarea).toHaveBeenCalledWith(
      expect.objectContaining({ reporteUrl: "https://drive.google.com/file/d/reporte/view" })
    );
  });
});
```

- [ ] **Step 2: Ejecutar**

```powershell
npm test tests/api/reporte.test.ts
```

Expected: FAIL — endpoint no existe.

- [ ] **Step 3: Crear `app/api/tareas/[id]/reporte/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getTareaByRowId, updateTarea } from "@/lib/google-sheets";
import { generateAndUploadReporte } from "@/lib/pdf-generator";
import { handleApiError, jsonError } from "@/lib/api-utils";

export const runtime = "nodejs";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const rowId = decodeURIComponent(id);

    const tarea = await getTareaByRowId(rowId);
    if (!tarea) return jsonError(404, "Tarea no encontrada");
    if (session.user.rol !== "admin" && tarea.supervisor !== session.user.email) {
      return jsonError(403, "Sin permisos sobre esta tarea");
    }

    const { url } = await generateAndUploadReporte(tarea);
    await updateTarea({ rowId: tarea.rowId, reporteUrl: url });

    return NextResponse.json({ reporteUrl: url });
  } catch (err) {
    return handleApiError(err);
  }
}
```

- [ ] **Step 4: Ejecutar**

```powershell
npm test tests/api/reporte.test.ts
```

Expected: PASS (2/2)

- [ ] **Step 5: Commit**

```powershell
git add app/api/tareas/[id]/reporte/route.ts tests/api/reporte.test.ts
git commit -m "feat(api): POST /api/tareas/[id]/reporte"
```

---

### Task 13: Auto-generación al cerrar (PATCH estado=Realizado)

**Implements:** FR-12, FR-13, FR-14, NFR-2, AC-5, AC-6
**Files:**
- Modify: `app/api/tareas/[id]/route.ts`
- Test: `tests/api/tareas-patch-estado.test.ts`

- [ ] **Step 1: Escribir test fallido**

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({
  requireSession: vi.fn().mockResolvedValue({ user: { email: "test@x.com", rol: "admin" } }),
}));

let estadoActual = "Pendiente";
vi.mock("@/lib/google-sheets", () => ({
  getTareaByRowId: vi.fn(() =>
    Promise.resolve({
      rowId: "2026-06-14T10:00:00.000Z",
      objetivo: "Test",
      fechaInicio: "2026-06-14",
      fechaEstimada: "2026-06-20",
      edificio: "Av. 123",
      parteComun: true,
      dpto: "Parte Común",
      informe: "x",
      imagenes: [],
      videos: [],
      documentos: [],
      estado: estadoActual,
      prioridad: "Media",
      supervisor: "test@x.com",
    })
  ),
  updateTarea: vi.fn((p) => Promise.resolve({ ...p, rowId: "2026-06-14T10:00:00.000Z" })),
}));

vi.mock("@/lib/pdf-generator", () => ({
  generateAndUploadReporte: vi.fn().mockResolvedValue({
    url: "https://drive.google.com/file/d/auto-reporte/view",
    fileId: "auto-reporte",
  }),
}));

describe("PATCH estado=Realizado dispara generación de reporte", () => {
  beforeEach(() => vi.clearAllMocks());

  it("genera reporte cuando se marca como Realizado", async () => {
    const { PATCH } = await import("@/app/api/tareas/[id]/route");
    const { generateAndUploadReporte } = await import("@/lib/pdf-generator");
    const req = new Request("http://localhost/api/tareas/foo", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ estado: "Realizado" }),
    });
    const res = await PATCH(req as never, { params: Promise.resolve({ id: "foo" }) });
    expect(res.status).toBe(200);
    // Wait micro-task for fire-and-forget side effect.
    await new Promise((r) => setTimeout(r, 50));
    expect(generateAndUploadReporte).toHaveBeenCalledTimes(1);
  });

  it("NO genera reporte si estado distinto a Realizado", async () => {
    const { PATCH } = await import("@/app/api/tareas/[id]/route");
    const { generateAndUploadReporte } = await import("@/lib/pdf-generator");
    const req = new Request("http://localhost/api/tareas/foo", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ estado: "En Proceso" }),
    });
    await PATCH(req as never, { params: Promise.resolve({ id: "foo" }) });
    await new Promise((r) => setTimeout(r, 50));
    expect(generateAndUploadReporte).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Ejecutar**

```powershell
npm test tests/api/tareas-patch-estado.test.ts
```

Expected: FAIL — auto-generación no implementada.

- [ ] **Step 3: Modificar `app/api/tareas/[id]/route.ts`**

Importar el generador:

```ts
import { generateAndUploadReporte } from "@/lib/pdf-generator";
```

Dentro de `PATCH`, después de la línea `const updated = await updateTarea({ ... });` agregar:

```ts
if (parsed.estado === "Realizado") {
  // Fire-and-forget: no bloqueamos la respuesta al cliente.
  // Si falla, se loguea pero no rompe el cambio de estado.
  generateAndUploadReporte(updated)
    .then((r) => updateTarea({ rowId: updated.rowId, reporteUrl: r.url }))
    .catch((err) => console.error("[reporte-auto] error:", err));
}
```

- [ ] **Step 4: Ejecutar**

```powershell
npm test tests/api/tareas-patch-estado.test.ts
```

Expected: PASS (2/2)

- [ ] **Step 5: Commit**

```powershell
git add app/api/tareas/[id]/route.ts tests/api/tareas-patch-estado.test.ts
git commit -m "feat(api): auto-generar reporte al cerrar tarea"
```

---

### Task 14: UI — botón "Generar/Descargar reporte" en detalle

**Implements:** FR-15, FR-16, AC-7
**Files:**
- Modify: `components/tareas/TareaDetalle.tsx`

- [ ] **Step 1: Agregar mutation + botón**

Importar `useMutation`:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
```

Importar icono:

```tsx
import { FileDown, FileText, Loader2 } from "lucide-react";
```

Dentro de `TareaDetalle`, después de `patchEstado`:

```ts
const generarReporte = useMutation({
  mutationFn: () => api.tareas.generarReporte(rowId),
  onSuccess: ({ reporteUrl }) => {
    qc.setQueryData(["tarea", rowId], (prev: Tarea | undefined) =>
      prev ? { ...prev, reporteUrl } : prev
    );
    window.open(reporteUrl, "_blank");
  },
});
```

Agregar sección antes de "Datos":

```tsx
<div className="rounded-2xl border border-slate-200 bg-white p-4">
  <p className="text-sm font-medium text-slate-700">Reporte PDF</p>
  <div className="mt-2 flex gap-2">
    {t.reporteUrl ? (
      <>
        <a
          href={t.reporteUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <FileDown size={14} /> Descargar reporte
        </a>
        <button
          onClick={() => generarReporte.mutate()}
          disabled={generarReporte.isPending}
          className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          {generarReporte.isPending ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
          Regenerar
        </button>
      </>
    ) : (
      <button
        onClick={() => generarReporte.mutate()}
        disabled={generarReporte.isPending}
        className="flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
      >
        {generarReporte.isPending ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
        Generar reporte
      </button>
    )}
  </div>
  {generarReporte.isError && (
    <p className="mt-1 text-xs text-red-600">No se pudo generar el reporte.</p>
  )}
</div>
```

- [ ] **Step 2: Verificar type-check + build**

```powershell
npx tsc --noEmit
npm run build
```

Expected: 0 errores en ambos.

- [ ] **Step 3: Test manual en modo demo**

Con `DEMO_MODE=1` y `npm run dev`:
1. Entrar a una tarea
2. Click en "Generar reporte" → debería abrir nueva pestaña con URL fake
3. Cambiar el estado a "Realizado" → en demo no hay auto-generación real pero el botón se mantiene funcional

- [ ] **Step 4: Commit**

```powershell
git add components/tareas/TareaDetalle.tsx
git commit -m "feat(detalle): botones generar/descargar reporte PDF"
```

---

### Task 15: Demo: mock de generación de reporte

**Implements:** FR-20, AC-10
**Files:**
- Modify: `lib/pdf-generator.tsx`

- [ ] **Step 1: Agregar bypass en demo mode**

```tsx
import { isDemoMode } from "./demo-mode";

export async function generateAndUploadReporte(tarea: Tarea): Promise<{ url: string; fileId: string }> {
  if (isDemoMode()) {
    // En demo no generamos PDF real. Devolvemos URL fake para que la UI flujo igual.
    const fakeId = `demo-reporte-${Date.now()}`;
    return {
      url: `https://drive.google.com/file/d/${fakeId}/view`,
      fileId: fakeId,
    };
  }
  // ... resto del código real
}
```

- [ ] **Step 2: Verificar manualmente**

Con `DEMO_MODE=1`:
1. Abrir una tarea
2. Click "Generar reporte" → debería responder en ms con URL fake
3. La tarea ahora muestra "Descargar reporte"

- [ ] **Step 3: Commit**

```powershell
git add lib/pdf-generator.tsx
git commit -m "feat(pdf): bypass demo mode (URL fake sin generar)"
```

---

### Task 16: Documentación + cierre

**Implements:** sección 12 del spec (Definición de "hecho"), AC-11, AC-12, AC-13
**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-06-14-pdf-reportes-y-adjuntos.md` (este archivo)

- [ ] **Step 1: Actualizar README**

En la sección de "Estado de implementación", agregar líneas:

```markdown
✅ Adjuntar PDFs (facturas, presupuestos, planos) — columna `documentos` en Sheet
✅ Generación de PDF de reporte por tarea (`@react-pdf/renderer`)
✅ Auto-generación al cerrar tarea (estado=Realizado dispara reporte)
✅ Botón manual "Generar/Descargar reporte" en detalle de tarea
✅ Suite de tests con Vitest (lib/, schemas, components, API)
```

- [ ] **Step 2: Type-check + build + tests final**

```powershell
npx tsc --noEmit
npm test
npm run build
```

Expected: todo verde.

- [ ] **Step 3: Commit**

```powershell
git add README.md
git commit -m "docs: actualizar estado con PDFs + reportes"
```

---

## Self-Review (post-write)

### Spec coverage
- [x] Adjuntar PDFs: tasks 6, 8, 9 — uploader, API, detalle
- [x] Generación PDF de reporte: tasks 10, 11, 12
- [x] Auto-generación al cerrar: task 13
- [x] UI manual de generación: task 14
- [x] Demo mode bypass: task 15
- [x] Tests: cada task tiene su test antes del código
- [x] Documentación: task 16

### Riesgos identificados
1. **`@react-pdf/renderer` en webpack vs Turbopack**: ya forzamos `--webpack` en scripts, debería ser transparente.
2. **`renderToBuffer` requiere Node runtime**: el endpoint ya tiene `runtime = "nodejs"`.
3. **Auto-generación bloquea PATCH si no es fire-and-forget**: el patrón `.then(...).catch(...)` sin await asegura que la respuesta del cambio de estado no espera al PDF.
4. **`maxDocumentos` faltaba en Task 2**: la acción correctiva está documentada en Task 8.
5. **Imágenes en el PDF**: `@react-pdf/renderer` hace fetch de las URLs server-side. Si Drive bloquea hotlinking de thumbnails, las imágenes pueden no aparecer en el PDF. **Mitigación:** las URLs de `drive.google.com/thumbnail?id=X&sz=w400` son públicas si el archivo lo es (que sí, porque aplicamos `permissions: anyone`). Si esto falla en producción, agregar fallback: omitir imágenes del PDF y solo listar URLs.

### Pendiente fuera de scope (no es parte de este plan)
- Logo de Morinigo en el PDF: cuando el usuario suba `public/logo-source.png`, agregar `<Image src="/icon-512.png" />` en el header.
- Notificación al cliente cuando el reporte se genera (email): fuera de scope.
- Versionado de reportes (regenerar conserva el anterior): por ahora, regenerar reemplaza la URL anterior en la Sheet pero NO borra el archivo viejo en Drive. Eso es deliberado — el historial de PDFs vive en Drive aunque la app solo apunte al último.

---

## Estimación

- Tasks 1-4 (setup + tipos + demo): 45 min
- Tasks 5-7 (Sheet + upload + cliente): 45 min
- Tasks 8-9 (uploader UI + detalle): 60 min
- Tasks 10-12 (PDF + endpoint): 75 min
- Tasks 13-14 (auto-gen + UI): 30 min
- Task 15-16 (demo + docs): 20 min

**Total estimado: ~4.5 horas** (con tests TDD).
