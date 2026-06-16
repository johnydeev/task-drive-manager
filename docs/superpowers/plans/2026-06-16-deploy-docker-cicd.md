# Deploy Docker + CI/CD + Hoja Tareas + Integración `_Consorcios` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec asociado:** [`docs/superpowers/specs/2026-06-16-deploy-docker-cicd.md`](../specs/2026-06-16-deploy-docker-cicd.md) — leer primero.

**Goal:** Levantar task-drive-manager en Docker self-hosted con HTTPS vía Cloudflare Tunnel, automatizar el ciclo build/push con GitHub Actions, integrar la app contra la hoja maestra externa `_Consorcios` como fuente única de edificios, y crear la hoja `Tareas` nueva paralela a la legacy `Ingreso de Pendiente`.

**Architecture:** El stack se mantiene en Next.js 16 standalone. Se agrega un cliente Sheets multi-spreadsheet para leer dos archivos distintos. La hoja `_Consorcios` se consume con cache SWR de 5 min. La app se empaqueta en una imagen Docker multi-stage (`node:20-bookworm-slim` como en ia-drive-doc-processor) y se expone vía Cloudflare Tunnel. GitHub Actions corre tests + typecheck + build en cada PR y buildea/pushea la imagen a GHCR en cada push a `main` o tag `v*`.

**Tech Stack:**
- **Runtime:** Next.js 16, Node 20, TypeScript 5
- **Storage:** Google Sheets (2 archivos) + Google Drive (1 SA)
- **Auth:** NextAuth v5 + Google OAuth
- **Container:** Docker multi-stage + `docker-compose`
- **HTTPS:** Cloudflare Tunnel
- **Registry:** GHCR (`ghcr.io/johnydeev/task-drive-manager`)
- **CI/CD:** GitHub Actions
- **Testing:** Vitest + @testing-library/react + jsdom (ya configurado)

---

## File Structure

### Archivos a crear

| Archivo | Responsabilidad |
|---|---|
| `Dockerfile` | Multi-stage build: deps, builder, runner |
| `.dockerignore` | Excluir `.next`, `node_modules`, `.git`, `.env*` |
| `docker-compose.yml` | Servicios `web` + `tunnel` |
| `app/api/health/route.ts` | Healthcheck endpoint para Docker |
| `lib/sheets-client.ts` | Cliente Sheets refactorizado, soporte multi-spreadsheet |
| `.github/workflows/ci.yml` | Tests + typecheck + build en cada PR |
| `.github/workflows/release.yml` | Build + push imagen Docker a GHCR |
| `scripts/seed-sheets.mjs` | CLI que crea/llena `Usuarios` y `Configuración` |
| `docs/DEPLOY.md` | Guía paso a paso de deploy local |
| `CHANGELOG.md` | Histórico de versiones (v1.0.0 = este deploy) |
| `tests/lib/sheets-client.test.ts` | Tests del cliente multi-spreadsheet |
| `tests/api/edificios.test.ts` | Tests del endpoint refactorizado |
| `tests/api/health.test.ts` | Test del healthcheck |

### Archivos a modificar

| Archivo | Cambio |
|---|---|
| `.env.example` | Sumar `GOOGLE_MASTER_SHEET_ID`, `CLOUDFLARE_TUNNEL_TOKEN`; renombrar a `.env.local.example` si querés (decisión opcional) |
| `lib/google-sheets.ts` | Refactor para leer `_Consorcios` de archivo externo; constante `INGRESO_RANGE` → `TAREAS_RANGE` apuntando a `Tareas` |
| `lib/google-auth.ts` | Soporte para identificar qué Sheet ID consultar |
| `next.config.ts` | Agregar `output: "standalone"` |
| `package.json` | Sumar script `seed`, versión a `1.0.0` |
| `README.md` | Sección de "Deploy" actualizada |
| `proxy.ts` | Sin cambios funcionales, pero revisar que no tenga referencias hardcoded a `Ingreso de Pendiente` |

---

## Tasks

### Task 1: Crear `.env.local.example` actualizado

**Implements:** FR-27, sección 8 del spec
**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Reescribir `.env.example` con la plantilla completa del spec sección 8**

Copiar contenido tal cual de la sección 8 del spec, agregando:
- `GOOGLE_MASTER_SHEET_ID` con valor default `1AVJ7tKv0hVU0uZF-9JyAPX3EpdgO81nzmzE-1nS6sdY`
- `CLOUDFLARE_TUNNEL_TOKEN` vacío
- Comentarios claros con propósito de cada variable y dónde obtener el valor

- [ ] **Step 2: Verificar que `.env.local` real (gitignored) tiene las mismas claves**

```powershell
Get-Content .env.local | Select-String "^[A-Z_]+=" | ForEach-Object { ($_ -split "=")[0] } | Sort-Object
Get-Content .env.example | Select-String "^[A-Z_]+=" | ForEach-Object { ($_ -split "=")[0] } | Sort-Object
```

Las dos listas deben coincidir (o el `.env.example` ser superset).

- [ ] **Step 3: Commit**

```powershell
git add .env.example
git commit -m "feat(env): plantilla completa con GOOGLE_MASTER_SHEET_ID y CLOUDFLARE_TUNNEL_TOKEN"
```

---

### Task 2: Endpoint `/api/health` (TDD)

**Implements:** FR-20, AC-6
**Files:**
- Create: `app/api/health/route.ts`
- Create: `tests/api/health.test.ts`

- [ ] **Step 1: Escribir test fallido**

```ts
// tests/api/health.test.ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  it("devuelve 200 con status ok", async () => {
    const req = new Request("http://localhost/api/health");
    const res = await GET(req as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok" });
  });

  it("no requiere autenticación", async () => {
    // No mockeamos auth — debe responder igual sin sesión
    const req = new Request("http://localhost/api/health");
    const res = await GET(req as never);
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Ejecutar test — debe fallar**

```powershell
npx vitest run tests/api/health.test.ts
```

Expected: FAIL (módulo no existe).

- [ ] **Step 3: Crear el endpoint**

```ts
// app/api/health/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ status: "ok" });
}
```

- [ ] **Step 4: Re-correr test**

```powershell
npx vitest run tests/api/health.test.ts
```

Expected: PASS (2/2).

- [ ] **Step 5: Verificar manualmente con dev server**

```powershell
npm run dev
# en otra terminal:
curl http://localhost:3002/api/health
```

Expected: `{"status":"ok"}` con status 200.

- [ ] **Step 6: Commit**

```powershell
git add app/api/health/route.ts tests/api/health.test.ts
git commit -m "feat(api): endpoint /api/health para Docker healthcheck"
```

---

### Task 3: Refactor cliente Sheets — soporte multi-spreadsheet

**Implements:** FR-1, FR-2, FR-5, FR-15
**Files:**
- Create: `lib/sheets-client.ts`
- Create: `tests/lib/sheets-client.test.ts`
- Modify: `lib/google-auth.ts`

- [ ] **Step 1: Escribir test fallido del cliente multi-spreadsheet**

```ts
// tests/lib/sheets-client.test.ts
import { describe, expect, it, vi } from "vitest";

vi.mock("googleapis", () => {
  const valuesGet = vi.fn();
  return {
    google: {
      sheets: () => ({ spreadsheets: { values: { get: valuesGet } } }),
      auth: { JWT: vi.fn() },
    },
    __valuesGet: valuesGet, // expuesto para asserts
  };
});

vi.mock("@/lib/google-auth", () => ({
  getGoogleAuth: () => ({}),
  getSheetId: () => "main-sheet-id",
  getMasterSheetId: () => "master-sheet-id",
}));

import { readRangeFromSpreadsheet } from "@/lib/sheets-client";

describe("readRangeFromSpreadsheet", () => {
  it("usa el sheetId pasado como parámetro", async () => {
    const mod = await import("googleapis") as unknown as { __valuesGet: ReturnType<typeof vi.fn> };
    mod.__valuesGet.mockResolvedValueOnce({ data: { values: [["ACEVEDO 1079", "11-11111111-2"]] } });
    const rows = await readRangeFromSpreadsheet("master-sheet-id", "_Consorcios!A2:E");
    expect(mod.__valuesGet).toHaveBeenCalledWith(expect.objectContaining({ spreadsheetId: "master-sheet-id" }));
    expect(rows).toEqual([["ACEVEDO 1079", "11-11111111-2"]]);
  });
});
```

- [ ] **Step 2: Ejecutar test — debe fallar**

```powershell
npx vitest run tests/lib/sheets-client.test.ts
```

Expected: FAIL (módulo no existe).

- [ ] **Step 3: Crear `lib/sheets-client.ts`**

```ts
// lib/sheets-client.ts
// Cliente Sheets genérico que acepta el spreadsheet ID como parámetro.
// Reemplaza la lógica directa de google.sheets() repartida en lib/google-sheets.ts.
import { google, sheets_v4 } from "googleapis";
import { getGoogleAuth } from "./google-auth";

let sheetsClient: sheets_v4.Sheets | null = null;

function getSheets(): sheets_v4.Sheets {
  if (!sheetsClient) {
    sheetsClient = google.sheets({ version: "v4", auth: getGoogleAuth() });
  }
  return sheetsClient;
}

export async function readRangeFromSpreadsheet(
  spreadsheetId: string,
  range: string
): Promise<string[][]> {
  const res = await getSheets().spreadsheets.values.get({ spreadsheetId, range });
  return (res.data.values ?? []) as string[][];
}
```

- [ ] **Step 4: Modificar `lib/google-auth.ts` para exponer `getMasterSheetId`**

```ts
// lib/google-auth.ts (sumar export)
export function getMasterSheetId(): string {
  const id = process.env.GOOGLE_MASTER_SHEET_ID?.trim();
  if (!id) throw new Error("GOOGLE_MASTER_SHEET_ID no configurado");
  return id;
}
```

- [ ] **Step 5: Re-correr test**

```powershell
npx vitest run tests/lib/sheets-client.test.ts
```

Expected: PASS (1/1).

- [ ] **Step 6: Commit**

```powershell
git add lib/sheets-client.ts lib/google-auth.ts tests/lib/sheets-client.test.ts
git commit -m "feat(sheets): cliente multi-spreadsheet con readRangeFromSpreadsheet"
```

---

### Task 4: Lectura de `_Consorcios` con cache SWR (TDD)

**Implements:** FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, AC-1, AC-2, AC-3
**Files:**
- Create: `lib/consorcios.ts`
- Create: `tests/lib/consorcios.test.ts`

- [ ] **Step 1: Escribir test fallido**

```ts
// tests/lib/consorcios.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/sheets-client", () => ({
  readRangeFromSpreadsheet: vi.fn(),
}));

vi.mock("@/lib/google-auth", () => ({
  getMasterSheetId: () => "master-id",
}));

import { getConsorciosActivos, _resetCache } from "@/lib/consorcios";
import { readRangeFromSpreadsheet } from "@/lib/sheets-client";

describe("getConsorciosActivos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetCache();
  });

  it("filtra consorcios con ACTIVO=FALSE", async () => {
    vi.mocked(readRangeFromSpreadsheet).mockResolvedValueOnce([
      ["ACEVEDO 1079", "11-11111111-2", "", "", "TRUE"],
      ["BAJA 999", "11-11111111-0", "", "", "FALSE"],
      ["ACEVEDO 450", "30-71904840-0", "", "", "TRUE"],
    ]);
    const result = await getConsorciosActivos();
    expect(result.map((c) => c.nombre)).toEqual(["ACEVEDO 1079", "ACEVEDO 450"]);
  });

  it("trata como activo si la columna ACTIVO está vacía", async () => {
    vi.mocked(readRangeFromSpreadsheet).mockResolvedValueOnce([
      ["ACEVEDO 1079", "11-11111111-2"],
    ]);
    const result = await getConsorciosActivos();
    expect(result).toHaveLength(1);
  });

  it("cachea la respuesta por 5 minutos", async () => {
    vi.mocked(readRangeFromSpreadsheet).mockResolvedValueOnce([
      ["ACEVEDO 1079", "11-11111111-2", "", "", "TRUE"],
    ]);
    await getConsorciosActivos();
    await getConsorciosActivos(); // segunda llamada
    expect(readRangeFromSpreadsheet).toHaveBeenCalledTimes(1);
  });

  it("devuelve cache stale si la red falla", async () => {
    vi.mocked(readRangeFromSpreadsheet).mockResolvedValueOnce([
      ["ACEVEDO 1079", "11-11111111-2", "", "", "TRUE"],
    ]);
    await getConsorciosActivos();
    _resetCache({ keepStale: true });
    vi.mocked(readRangeFromSpreadsheet).mockRejectedValueOnce(new Error("network down"));
    const result = await getConsorciosActivos();
    expect(result.map((c) => c.nombre)).toEqual(["ACEVEDO 1079"]);
  });
});
```

- [ ] **Step 2: Ejecutar — debe fallar**

```powershell
npx vitest run tests/lib/consorcios.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Crear `lib/consorcios.ts`**

```ts
import { readRangeFromSpreadsheet } from "./sheets-client";
import { getMasterSheetId } from "./google-auth";
import { isDemoMode } from "./demo-mode";
import { getDemoEdificios } from "./demo-data";

export interface Consorcio {
  nombre: string;       // columna A — NOMBRE CANÓNICO
  cuit: string | null;  // columna B — CUIT
}

interface CacheEntry {
  data: Consorcio[];
  expires: number;
  stale: Consorcio[]; // último valor exitoso para fallback
}

const TTL_MS = 5 * 60 * 1000;
let cache: CacheEntry | null = null;

export function _resetCache(opts?: { keepStale?: boolean }) {
  if (opts?.keepStale && cache) {
    cache = { ...cache, expires: 0 };
  } else {
    cache = null;
  }
}

function isActive(row: string[]): boolean {
  const col = row[4]; // columna E
  if (col === undefined || col === "") return true; // default activo
  return col.toString().toUpperCase() !== "FALSE";
}

export async function getConsorciosActivos(): Promise<Consorcio[]> {
  if (isDemoMode()) {
    return getDemoEdificios().map((e) => ({ nombre: e.nombre, cuit: null }));
  }

  // Cache HIT y fresh
  if (cache && cache.expires > Date.now()) {
    return cache.data;
  }

  try {
    const rows = await readRangeFromSpreadsheet(getMasterSheetId(), "_Consorcios!A2:E");
    const data: Consorcio[] = rows
      .filter((r) => r[0] && isActive(r))
      .map((r) => ({ nombre: r[0]!.trim(), cuit: r[1]?.trim() || null }));

    cache = { data, expires: Date.now() + TTL_MS, stale: data };
    return data;
  } catch (err) {
    // SWR: si hay stale, devolverlo. Si no, propagar.
    if (cache?.stale && cache.stale.length > 0) {
      console.warn("[consorcios] usando stale cache, red caída:", err);
      return cache.stale;
    }
    throw err;
  }
}
```

- [ ] **Step 4: Re-correr test**

```powershell
npx vitest run tests/lib/consorcios.test.ts
```

Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```powershell
git add lib/consorcios.ts tests/lib/consorcios.test.ts
git commit -m "feat(consorcios): lectura desde _Consorcios con cache SWR"
```

---

### Task 5: Refactor del endpoint `/api/edificios` (TDD)

**Implements:** FR-1, FR-2, AC-1
**Files:**
- Modify: `app/api/edificios/route.ts`
- Create: `tests/api/edificios.test.ts`

- [ ] **Step 1: Escribir test del endpoint**

```ts
// tests/api/edificios.test.ts
// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({
  requireSession: vi.fn().mockResolvedValue({ user: { email: "t@x.com", rol: "supervisor" } }),
}));

vi.mock("@/lib/consorcios", () => ({
  getConsorciosActivos: vi.fn(),
}));

describe("GET /api/edificios", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retorna lista de edificios", async () => {
    const { getConsorciosActivos } = await import("@/lib/consorcios");
    vi.mocked(getConsorciosActivos).mockResolvedValueOnce([
      { nombre: "ACEVEDO 1079", cuit: "11-11111111-2" },
    ]);
    const { GET } = await import("@/app/api/edificios/route");
    const res = await GET(new Request("http://localhost/api/edificios") as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([{ nombre: "ACEVEDO 1079", cuit: "11-11111111-2" }]);
  });

  it("retorna 503 si no hay cache y la red falla", async () => {
    const { getConsorciosActivos } = await import("@/lib/consorcios");
    vi.mocked(getConsorciosActivos).mockRejectedValueOnce(new Error("network"));
    const { GET } = await import("@/app/api/edificios/route");
    const res = await GET(new Request("http://localhost/api/edificios") as never);
    expect(res.status).toBe(503);
  });
});
```

- [ ] **Step 2: Ejecutar — debe fallar** (el endpoint actual lee la hoja `Edificios` legacy, no `_Consorcios`)

```powershell
npx vitest run tests/api/edificios.test.ts
```

- [ ] **Step 3: Reescribir el endpoint**

```ts
// app/api/edificios/route.ts
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getConsorciosActivos } from "@/lib/consorcios";
import { handleApiError, jsonError } from "@/lib/api-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireSession();
    const consorcios = await getConsorciosActivos();
    // Compatible con el shape antiguo: { nombre } + nuevo campo opcional { cuit }
    return NextResponse.json(consorcios);
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes("network")) {
      return jsonError(503, "Servicio de consorcios temporalmente no disponible");
    }
    return handleApiError(err);
  }
}
```

- [ ] **Step 4: Actualizar el tipo `Edificio`** en `types/index.ts` para sumar `cuit`

```ts
export interface Edificio {
  nombre: string;
  cuit?: string | null;
}
```

- [ ] **Step 5: Re-correr test**

```powershell
npx vitest run tests/api/edificios.test.ts
```

Expected: PASS (2/2).

- [ ] **Step 6: Verificar que `lib/google-sheets.ts`:`getEdificios()` ya no se usa**

```powershell
Grep "getEdificios" -r --include="*.ts" --include="*.tsx" .
```

Solo debe quedar la definición en `lib/google-sheets.ts`. Si hay imports en otros archivos, reemplazarlos por `getConsorciosActivos`.

- [ ] **Step 7: Eliminar `getEdificios` de `lib/google-sheets.ts`** (la función queda muerta)

Borrarla. Si Linter se queja, también borrar la importación de `Edificio` si ya no se usa.

- [ ] **Step 8: Commit**

```powershell
git add app/api/edificios/route.ts types/index.ts lib/google-sheets.ts tests/api/edificios.test.ts
git commit -m "refactor(edificios): leer desde _Consorcios externa con cache SWR"
```

---

### Task 6: Apuntar la app a la hoja `Tareas` (no `Ingreso de Pendiente`)

**Implements:** FR-9, FR-10, FR-11, AC-5
**Files:**
- Modify: `lib/google-sheets.ts`
- Create: `tests/lib/google-sheets-target.test.ts`

- [ ] **Step 1: Escribir test que verifica que el range apunta a `Tareas`**

```ts
// tests/lib/google-sheets-target.test.ts
import { describe, expect, it } from "vitest";
import { TAREAS_RANGE, SHEETS } from "@/lib/google-sheets";

describe("constantes de Sheet names", () => {
  it("usa Tareas como tab, no Ingreso de Pendiente", () => {
    expect(SHEETS.tareas).toBe("Tareas");
  });

  it("TAREAS_RANGE apunta a Tareas!A:Z", () => {
    expect(TAREAS_RANGE).toMatch(/^Tareas!/);
  });
});
```

- [ ] **Step 2: Ejecutar — debe fallar**

```powershell
npx vitest run tests/lib/google-sheets-target.test.ts
```

Expected: FAIL (las constantes actuales se llaman distinto).

- [ ] **Step 3: Renombrar en `lib/google-sheets.ts`**

Cambiar:
```ts
const SHEETS = {
  edificios: "Edificios",
  dptos: "Dptos",
  ingreso: "Ingreso de Pendiente",  // ← cambiar a "Tareas"
  // ...
};
```

Por:
```ts
export const SHEETS = {
  edificios: "Edificios",  // deprecated, no usado
  dptos: "Dptos",
  tareas: "Tareas",  // ← nuevo tab para app nueva
  usuarios: "Usuarios",
  configuracion: "Configuración",
  respuestas: "Respuestas de Trabajadores",
} as const;
```

Y:
```ts
const INGRESO_RANGE = `${SHEETS.ingreso}!A:Z`;
```

Por:
```ts
export const TAREAS_RANGE = `${SHEETS.tareas}!A:Z`;
```

Reemplazar todas las referencias a `INGRESO_RANGE` por `TAREAS_RANGE` y `SHEETS.ingreso` por `SHEETS.tareas` en el archivo.

- [ ] **Step 4: Re-correr test**

```powershell
npx vitest run tests/lib/google-sheets-target.test.ts
```

Expected: PASS (2/2).

- [ ] **Step 5: Correr suite completa para asegurar no se rompió nada**

```powershell
npm test
```

Expected: todos los tests pasan.

- [ ] **Step 6: Commit**

```powershell
git add lib/google-sheets.ts tests/lib/google-sheets-target.test.ts
git commit -m "refactor(sheets): apuntar app a tab Tareas en lugar de Ingreso de Pendiente"
```

---

### Task 7: Bloqueo de tarea con edificio no canónico

**Implements:** FR-7, FR-8, AC-4
**Files:**
- Modify: `app/api/tareas/route.ts`
- Create: `tests/api/tareas-edificio-validation.test.ts`

- [ ] **Step 1: Escribir test**

```ts
// tests/api/tareas-edificio-validation.test.ts
// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({
  requireSession: vi.fn().mockResolvedValue({ user: { email: "s@x.com", rol: "supervisor" } }),
}));

vi.mock("@/lib/consorcios", () => ({
  getConsorciosActivos: vi.fn().mockResolvedValue([
    { nombre: "ACEVEDO 1079", cuit: null },
  ]),
}));

vi.mock("@/lib/google-sheets", () => ({
  appendTarea: vi.fn().mockResolvedValue({ rowId: "fake-id" }),
}));

describe("POST /api/tareas con validación de edificio", () => {
  beforeEach(() => vi.clearAllMocks());

  const baseInput = {
    objetivo: "Test",
    fechaInicio: "2026-06-16",
    fechaEstimada: "2026-06-20",
    parteComun: true,
    informe: "x",
    prioridad: "Media" as const,
  };

  it("rechaza con 400 si el edificio no está en _Consorcios", async () => {
    const { POST } = await import("@/app/api/tareas/route");
    const req = new Request("http://localhost/api/tareas", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...baseInput, edificio: "EDIFICIO_NO_EXISTE" }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/edificio.*no.*v[áa]lido|no.*existe|no.*canonizado/i);
  });

  it("acepta si el edificio está en _Consorcios", async () => {
    const { POST } = await import("@/app/api/tareas/route");
    const req = new Request("http://localhost/api/tareas", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...baseInput, edificio: "ACEVEDO 1079" }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(201);
  });
});
```

- [ ] **Step 2: Ejecutar — debe fallar**

```powershell
npx vitest run tests/api/tareas-edificio-validation.test.ts
```

- [ ] **Step 3: Modificar `app/api/tareas/route.ts`**

Agregar import:
```ts
import { getConsorciosActivos } from "@/lib/consorcios";
```

En el handler `POST`, después de validar con Zod y antes de llamar a `appendTarea`:

```ts
// Validar que el edificio existe en la SOT externa (_Consorcios)
const consorcios = await getConsorciosActivos();
const edificioValido = consorcios.some((c) => c.nombre === parsed.edificio);
if (!edificioValido) {
  return jsonError(400, `Edificio "${parsed.edificio}" no es válido o no está activo`);
}
```

- [ ] **Step 4: Re-correr test**

```powershell
npx vitest run tests/api/tareas-edificio-validation.test.ts
```

Expected: PASS (2/2).

- [ ] **Step 5: Commit**

```powershell
git add app/api/tareas/route.ts tests/api/tareas-edificio-validation.test.ts
git commit -m "feat(tareas): bloquear creación si edificio no está en _Consorcios"
```

---

### Task 8: `next.config.ts` con `output: standalone`

**Implements:** FR-18
**Files:**
- Modify: `next.config.ts`

- [ ] **Step 1: Modificar `next.config.ts`**

```ts
import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  cacheOnNavigation: true,
  reloadOnOnline: false,
});

const nextConfig: NextConfig = {
  output: "standalone", // ← NUEVO: requerido por Docker
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "drive.google.com", pathname: "/**" },
    ],
  },
};

export default withSerwist(nextConfig);
```

- [ ] **Step 2: Verificar que el build sigue funcionando**

```powershell
$env:SERWIST_SUPPRESS_TURBOPACK_WARNING="1"; npm run build
```

Expected: build verde. La carpeta `.next/standalone/` debe existir tras el build.

- [ ] **Step 3: Verificar que `.next/standalone` tiene `server.js`**

```powershell
Test-Path .next\standalone\server.js
```

Expected: True.

- [ ] **Step 4: Commit**

```powershell
git add next.config.ts
git commit -m "feat(next): output standalone para Docker"
```

---

### Task 9: `.dockerignore`

**Files:**
- Create: `.dockerignore`

- [ ] **Step 1: Crear `.dockerignore`**

```
node_modules
.next
.git
.env
.env.local
.env.local.example
.dockerignore
Dockerfile
docker-compose.yml
docs
tests
*.test.ts
*.test.tsx
README.md
CHANGELOG.md
.github
.vscode
.idea
coverage
*.log
.DS_Store
Thumbs.db
```

- [ ] **Step 2: Commit**

```powershell
git add .dockerignore
git commit -m "build: .dockerignore para excluir devfiles del build context"
```

---

### Task 10: Dockerfile multi-stage

**Implements:** FR-17, FR-18, FR-19, FR-22, NFR-3, NFR-11
**Files:**
- Create: `Dockerfile`

- [ ] **Step 1: Crear `Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1.7
# Base: Debian slim para compatibilidad con módulos nativos (sharp, canvas, etc.)
FROM node:20-bookworm-slim AS base
WORKDIR /app

# --- Stage: deps ---
FROM base AS deps
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --include=dev

# --- Stage: builder ---
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Suprimir warning de serwist con turbopack — usamos webpack a propósito.
ENV SERWIST_SUPPRESS_TURBOPACK_WARNING=1
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# --- Stage: runner ---
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Usuario no-root.
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
```

- [ ] **Step 2: Build local**

```powershell
docker build -t task-drive-manager:dev .
```

Expected: build verde. Imagen creada.

- [ ] **Step 3: Verificar tamaño**

```powershell
docker images task-drive-manager:dev
```

Expected: < 500MB (NFR-3).

- [ ] **Step 4: Verificar que arranca**

```powershell
docker run --rm -p 4000:3000 --env-file .env.local task-drive-manager:dev
```

En otra terminal:
```powershell
curl http://localhost:4000/api/health
```

Expected: 200 con `{"status":"ok"}`.

Detener con Ctrl+C.

- [ ] **Step 5: Verificar que corre como usuario nextjs**

```powershell
docker run --rm task-drive-manager:dev whoami
```

Expected: `nextjs`.

- [ ] **Step 6: Commit**

```powershell
git add Dockerfile
git commit -m "build: Dockerfile multi-stage (node:20 + standalone + non-root)"
```

---

### Task 11: `docker-compose.yml`

**Implements:** FR-21, FR-22, NFR-4, NFR-9
**Files:**
- Create: `docker-compose.yml`

- [ ] **Step 1: Crear `docker-compose.yml`**

```yaml
name: task-drive-manager

services:
  web:
    image: ghcr.io/johnydeev/task-drive-manager:${IMAGE_TAG:-latest}
    restart: unless-stopped
    env_file: .env
    environment:
      NODE_ENV: production
      HOSTNAME: "0.0.0.0"
      LANG: C.UTF-8
      LC_ALL: C.UTF-8
    ports:
      - "4000:3000"
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 30s
    deploy:
      resources:
        limits:
          memory: 1024M
          cpus: "1.0"
        reservations:
          memory: 256M
          cpus: "0.25"
    logging:
      driver: "json-file"
      options:
        max-size: "50m"
        max-file: "10"

  # Cloudflare Tunnel para exponer la app vía HTTPS sin abrir puertos en el router.
  tunnel:
    image: cloudflare/cloudflared:2025.2.0
    restart: unless-stopped
    command: tunnel --no-autoupdate run --url http://web:3000
    environment:
      TUNNEL_TOKEN: ${CLOUDFLARE_TUNNEL_TOKEN}
    depends_on:
      web:
        condition: service_healthy
    deploy:
      resources:
        limits:
          memory: 128M
          cpus: "0.25"
```

- [ ] **Step 2: Validar sintaxis**

```powershell
docker compose config
```

Expected: imprime el config parseado sin errores.

- [ ] **Step 3: Commit**

```powershell
git add docker-compose.yml
git commit -m "build: docker-compose con web + cloudflare tunnel"
```

---

### Task 12: Script de seed para hojas Usuarios y Configuración

**Implements:** D6, sección 7.3 y 7.4 del spec
**Files:**
- Create: `scripts/seed-sheets.mjs`
- Modify: `package.json` (script `seed`)

- [ ] **Step 1: Crear el script**

```js
// scripts/seed-sheets.mjs
// CLI que llena las hojas Usuarios y Configuración con valores iniciales.
// Uso: npm run seed
//
// Requiere las mismas env vars que la app:
//   - GOOGLE_SHEET_ID
//   - GOOGLE_SERVICE_ACCOUNT_EMAIL
//   - GOOGLE_PRIVATE_KEY

import { google } from "googleapis";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SA_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const SA_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!SHEET_ID || !SA_EMAIL || !SA_KEY) {
  console.error("❌ Faltan variables de entorno en .env.local");
  process.exit(1);
}

const auth = new google.auth.JWT({
  email: SA_EMAIL,
  key: SA_KEY,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

const USUARIOS_SEED = [
  ["email", "nombre", "rol", "activo", "creado_en"],
  ["contacto@morinigoadm.com", "Administración Morinigo", "admin", "TRUE", new Date().toISOString()],
  ["castrojonathand@gmail.com", "Jonathan Castro", "admin", "TRUE", new Date().toISOString()],
];

const CONFIG_SEED = [
  ["clave", "valor", "descripcion"],
  ["max_imagenes", "10", "Máximo de imágenes por tarea"],
  ["max_videos", "3", "Máximo de videos por tarea"],
  ["max_documentos", "5", "Máximo de PDFs adjuntos"],
  ["max_size_imagen_mb", "10", "Peso máx por imagen (MB)"],
  ["max_size_video_mb", "100", "Peso máx por video (MB)"],
  ["max_size_pdf_mb", "20", "Peso máx por PDF (MB)"],
];

async function seedTab(tabName, values) {
  console.log(`🌱 Seeding tab "${tabName}"...`);
  // Idempotente: si la hoja ya tiene datos, abortar.
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${tabName}!A1:Z`,
  });
  if (existing.data.values && existing.data.values.length > 1) {
    console.log(`  ⚠️ Tab "${tabName}" ya tiene datos, saltando.`);
    return;
  }
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${tabName}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });
  console.log(`  ✓ ${values.length - 1} filas cargadas en "${tabName}"`);
}

async function main() {
  console.log(`📊 Spreadsheet: ${SHEET_ID}`);
  await seedTab("Usuarios", USUARIOS_SEED);
  await seedTab("Configuración", CONFIG_SEED);
  console.log("\n✅ Seed completo.");
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Agregar script en `package.json`**

En la sección `scripts`:
```json
"seed": "node --env-file=.env.local scripts/seed-sheets.mjs"
```

(o el comando equivalente con dotenv si tu Node no soporta `--env-file`)

- [ ] **Step 3: Instalar dotenv si no está**

```powershell
npm install --save-dev dotenv
```

- [ ] **Step 4: Test del script (dry-run conceptual)**

Sin ejecutarlo realmente (no queremos llenar la Sheet ahora durante el plan), verificar que el archivo carga sintácticamente:

```powershell
node --check scripts/seed-sheets.mjs
```

Expected: sin errores.

- [ ] **Step 5: Commit**

```powershell
git add scripts/seed-sheets.mjs package.json package-lock.json
git commit -m "feat(seed): script idempotente para llenar Usuarios y Configuración"
```

---

### Task 13: Workflow CI (`.github/workflows/ci.yml`)

**Implements:** FR-23, AC-9
**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Crear el workflow**

```yaml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Lint
        run: npm run lint
        continue-on-error: false

      - name: Type check
        run: npx tsc --noEmit

      - name: Tests
        run: npm test

      - name: Build (smoke test)
        env:
          SERWIST_SUPPRESS_TURBOPACK_WARNING: "1"
          # Variables de entorno mínimas para build (no se conectan a APIs reales).
          GOOGLE_SHEET_ID: "fake-build-sheet"
          GOOGLE_MASTER_SHEET_ID: "fake-master"
          GOOGLE_SERVICE_ACCOUNT_EMAIL: "build@example.com"
          GOOGLE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\nfakekey\n-----END PRIVATE KEY-----\n"
          GOOGLE_DRIVE_ROOT_FOLDER_ID: "fake-drive"
          NEXTAUTH_URL: "http://localhost:4000"
          NEXTAUTH_SECRET: "ci-only-secret-not-real-just-for-build"
          GOOGLE_CLIENT_ID: "fake-client-id"
          GOOGLE_CLIENT_SECRET: "fake-client-secret"
        run: npm run build
```

- [ ] **Step 2: Commit**

```powershell
git add .github/workflows/ci.yml
git commit -m "ci: workflow CI con lint + tsc + test + build"
```

---

### Task 14: Workflow Release (`.github/workflows/release.yml`)

**Implements:** FR-24, FR-26, AC-10
**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Crear el workflow**

```yaml
name: Release

on:
  push:
    branches: [main]
    tags: ['v*']

permissions:
  contents: read
  packages: write

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: docker/setup-buildx-action@v3

      - name: Login to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/johnydeev/task-drive-manager
          tags: |
            type=ref,event=branch
            type=ref,event=tag
            type=sha,prefix=sha-
            type=raw,value=latest,enable={{is_default_branch}}

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

- [ ] **Step 2: Commit**

```powershell
git add .github/workflows/release.yml
git commit -m "ci: workflow release con build + push a GHCR"
```

---

### Task 15: README — sección Deploy

**Implements:** AC-11, FR-25
**Files:**
- Create: `docs/DEPLOY.md`
- Modify: `README.md`

- [ ] **Step 1: Crear `docs/DEPLOY.md` (siguiendo patrón ia-drive-doc-processor)**

Contenido completo:

````markdown
# Deploy — task-drive-manager

## Requisitos

- Docker Desktop 4.x+
- Cuenta Cloudflare con un tunnel configurado (gratis)
- Cuenta Google Cloud con Sheets API + Drive API habilitadas
- Una Service Account con private key (descargada como JSON)
- Acceso de Editor del SA al archivo principal Sheets
- Acceso de Lector del SA al archivo `_Consorcios`
- Acceso de Editor del SA a la carpeta de Drive donde la app guarda archivos
- Repo `johnydeev/task-drive-manager` (privado o público) en GitHub

## Setup inicial (primera vez)

### 1. Crear Service Account en GCP

```bash
# En GCP Console > IAM > Service Accounts > Create
# Nombre sugerido: task-drive-manager-app
# Después: Manage Keys > Add Key > Create new key > JSON
```

Guardá el JSON descargado en un lugar seguro. **No lo commitees.**

### 2. Compartir Sheets y Drive con la SA

- Abrir el archivo Sheets principal en Google Drive → Compartir → agregar el email del SA con permiso **Editor**
- Abrir el archivo `_Consorcios` → Compartir → agregar el email del SA con permiso **Lector**
- Abrir la carpeta de Drive donde la app sube archivos → Compartir → agregar el email del SA con permiso **Editor**

### 3. Crear Cloudflare Tunnel

```bash
# En Cloudflare > Zero Trust > Networks > Tunnels > Create a Tunnel
# Nombre: task-drive-manager
# Hostname: task-drive-manager.com (o tu subdominio)
# Service: http://web:3000
```

Copiá el token del tunnel.

### 4. Crear `.env`

Copiar el ejemplo:

```powershell
Copy-Item .env.example .env
```

Llenar con los valores reales:
- `GOOGLE_SHEET_ID` = ID del archivo principal
- `GOOGLE_MASTER_SHEET_ID` = `1AVJ7tKv0hVU0uZF-9JyAPX3EpdgO81nzmzE-1nS6sdY` (default)
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` = del JSON descargado
- `GOOGLE_PRIVATE_KEY` = del JSON descargado, **envuelto en comillas dobles**, con `\n` literales
- `GOOGLE_DRIVE_ROOT_FOLDER_ID` = ID de la carpeta de Drive de la app
- `NEXTAUTH_URL` = `https://task-drive-manager.com` (o tu dominio)
- `NEXTAUTH_SECRET` = generar con `openssl rand -base64 32`
- `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` = de GCP Console > OAuth Client ID
- `CLOUDFLARE_TUNNEL_TOKEN` = el del paso 3

### 5. Seed inicial de hojas

```powershell
npm install
npm run seed
```

Esto llena `Usuarios` y `Configuración` en la Sheet principal.

### 6. Configurar OAuth callback URL

En GCP Console > Credentials > tu OAuth Client ID, agregar en "Authorized redirect URIs":

```
https://task-drive-manager.com/api/auth/callback/google
http://localhost:4000/api/auth/callback/google
```

### 7. Pull de la imagen y arrancar

```powershell
docker compose pull
docker compose up -d
```

Verificar:

```powershell
docker compose ps
docker compose logs -f web
```

La app debe responder en `localhost:4000` y en `https://task-drive-manager.com`.

## Actualizar a una nueva versión

```powershell
docker compose pull
docker compose up -d
```

## Logs y debugging

```powershell
# Ver logs en vivo
docker compose logs -f web

# Logs del tunnel
docker compose logs -f tunnel

# Entrar al container
docker compose exec web sh

# Healthcheck manual
curl http://localhost:4000/api/health
```

## Backup

La fuente de verdad son las dos Google Sheets. **Hacer un backup periódico** (Archivo > Descargar > xlsx) de:
- El archivo principal de Tareas
- El archivo de `_Consorcios`

Los archivos de Drive ya están en la nube y no requieren backup manual.

## Rollback

Si una versión nueva rompe algo:

```powershell
# Ver tags disponibles
docker images ghcr.io/johnydeev/task-drive-manager

# Hacer rollback a un tag anterior
$env:IMAGE_TAG="sha-abc1234"; docker compose up -d
```
````

- [ ] **Step 2: Actualizar README con link a DEPLOY.md**

Sumar al final del README:

```markdown
## Deploy a producción

Ver [docs/DEPLOY.md](docs/DEPLOY.md) para instrucciones paso a paso.
```

- [ ] **Step 3: Commit**

```powershell
git add docs/DEPLOY.md README.md
git commit -m "docs: guía de deploy con Docker + Cloudflare Tunnel"
```

---

### Task 16: CHANGELOG.md inicial

**Files:**
- Create: `CHANGELOG.md`

- [ ] **Step 1: Crear CHANGELOG.md**

```markdown
# Changelog

Todos los cambios notables a este proyecto se documentan en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/),
y este proyecto adhiere a [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-06-16

### Added
- Lectura de edificios desde archivo Sheets externo `_Consorcios` (SOT de ia-drive-doc-processor)
- Cache SWR de 5 min para `_Consorcios`
- Filtrado de consorcios inactivos (columna `ACTIVO=FALSE`)
- Validación estricta de edificio canónico en POST /api/tareas
- Endpoint `/api/health` para Docker healthcheck
- Dockerfile multi-stage con Next.js standalone
- `docker-compose.yml` con web + Cloudflare Tunnel
- GitHub Actions CI: lint + typecheck + tests + build
- GitHub Actions Release: build + push a GHCR
- Script de seed idempotente para hojas Usuarios y Configuración
- Documentación de deploy paso a paso en `docs/DEPLOY.md`

### Changed
- App escribe en hoja `Tareas` nueva, no en `Ingreso de Pendiente` legacy
- Cliente Sheets refactorizado a multi-spreadsheet
- `next.config.ts` con `output: "standalone"`

### Deprecated
- Hoja `Edificios` del archivo principal (queda como histórico, la app la ignora)
- Función `getEdificios()` en `lib/google-sheets.ts` (reemplazada por `getConsorciosActivos` en `lib/consorcios.ts`)

## [0.1.0] - 2026-06-14

### Added
- Feature PDFs adjuntos + reportes generados (ver `docs/superpowers/plans/2026-06-14-pdf-reportes-y-adjuntos.md`)
- Suite de tests con Vitest (33 tests)

## [0.0.1] - 2026-06-01

### Added
- Implementación inicial: tareas, dashboard, usuarios, configuración, PWA, offline mode
```

- [ ] **Step 2: Commit**

```powershell
git add CHANGELOG.md
git commit -m "docs: CHANGELOG inicial con v1.0.0"
```

---

### Task 17: Smoke test integral local

**Implements:** AC-6, AC-7, AC-8, sección 15 del spec
**Files:**
- (verificación manual, sin código)

- [ ] **Step 1: Build local de la imagen**

```powershell
docker build -t task-drive-manager:local .
```

Expected: build verde, sin errores.

- [ ] **Step 2: Verificar tamaño**

```powershell
docker images task-drive-manager:local --format "{{.Size}}"
```

Expected: < 500MB.

- [ ] **Step 3: Verificar usuario non-root**

```powershell
docker run --rm task-drive-manager:local whoami
```

Expected: `nextjs`.

- [ ] **Step 4: Levantar con compose (sin tunnel)**

Editar `docker-compose.yml` temporalmente para comentar el servicio `tunnel` (no querés exponer a internet en este test). O setear `CLOUDFLARE_TUNNEL_TOKEN=` vacío.

```powershell
docker compose up -d web
docker compose logs -f web
```

Expected: log muestra `Ready in <X>ms`.

- [ ] **Step 5: Healthcheck**

```powershell
curl http://localhost:4000/api/health
```

Expected: `{"status":"ok"}` con status 200.

- [ ] **Step 6: Verificar healthcheck Docker**

```powershell
docker compose ps
```

Expected: el servicio `web` muestra estado `healthy` después de ~30-60 segundos.

- [ ] **Step 7: Test funcional — crear una tarea**

Abrir `http://localhost:4000/login` en el navegador. Loguear con la cuenta admin que cargaste en Usuarios.

Crear una tarea de prueba:
- Edificio: alguno de los que viste en `_Consorcios`
- Objetivo: "Smoke test deploy"
- Adjuntar 1 PDF

Verificar:
- La tarea aparece en `/tareas`
- En la hoja `Tareas` de Google Sheets, una fila nueva con los datos
- En Drive, la carpeta `/Tareas/{Edificio}/2026-06/.../` con el PDF

Marcar como Realizado. Verificar que `reporteUrl` se llena.

- [ ] **Step 8: Detener**

```powershell
docker compose down
```

- [ ] **Step 9: Documentar en CHANGELOG el smoke test exitoso (sin commit aún)**

Anotar en el documento de notas personal: "Smoke test deploy 1.0.0 ejecutado 2026-06-16 — OK".

---

### Task 18: Configurar Cloudflare Tunnel y deploy real

**Implements:** P5, AC-11
**Files:**
- (configuración externa + ajustes a `.env`)

- [ ] **Step 1: En Cloudflare dashboard, crear el tunnel**

Seguir los pasos del paso 3 de `docs/DEPLOY.md`. Copiar el token.

- [ ] **Step 2: Configurar el hostname en Cloudflare**

- Hostname: tu dominio (ej. `task-drive-manager.com`) o subdominio
- Service: `http://web:3000`

- [ ] **Step 3: Pegar el token en `.env.local`**

```env
CLOUDFLARE_TUNNEL_TOKEN=eyJhbGciOi...
```

- [ ] **Step 4: Levantar compose completo (con tunnel)**

```powershell
docker compose up -d
docker compose logs -f tunnel
```

Expected: log muestra `Registered tunnel connection`.

- [ ] **Step 5: Verificar HTTPS**

Abrir `https://task-drive-manager.com` en el navegador.

Expected: la app carga con HTTPS, certificado válido de Cloudflare.

- [ ] **Step 6: Actualizar OAuth redirect URI**

En GCP Console > Credentials > tu OAuth Client ID, agregar:
```
https://task-drive-manager.com/api/auth/callback/google
```

- [ ] **Step 7: Actualizar NEXTAUTH_URL**

En `.env.local`:
```env
NEXTAUTH_URL=https://task-drive-manager.com
```

Reiniciar:
```powershell
docker compose restart web
```

- [ ] **Step 8: Test final**

Desde un celular (no conectado a tu WiFi local):
- Abrir `https://task-drive-manager.com`
- Loguear con Google
- Verificar que el banner "Instalar app" aparece
- Instalar la PWA
- Crear una tarea desde la app instalada

Expected: todo funciona.

---

### Task 19: Push del primer tag de release

**Implements:** FR-24, AC-10
**Files:**
- (operación git + GitHub Actions)

- [ ] **Step 1: Mergear branch a main**

```powershell
git checkout main
git merge --no-ff feat/deploy-docker-cicd -m "feat: deploy Docker + CI/CD + integración _Consorcios"
git push origin main
```

- [ ] **Step 2: Verificar que CI corre**

Ir a GitHub > Actions tab. El workflow `CI` debe correr y pasar verde.

- [ ] **Step 3: Crear tag v1.0.0**

```powershell
git tag -a v1.0.0 -m "v1.0.0 - Deploy en producción con Docker + Cloudflare"
git push origin v1.0.0
```

- [ ] **Step 4: Verificar que Release workflow buildea la imagen**

Ir a GitHub > Actions tab. El workflow `Release` debe correr.

- [ ] **Step 5: Verificar la imagen en GHCR**

Ir a `https://github.com/johnydeev/task-drive-manager/pkgs/container/task-drive-manager`.

Expected: aparece la imagen con tags `latest`, `v1.0.0`, `sha-<commit>`.

- [ ] **Step 6: Pull de la imagen oficial en local**

```powershell
docker compose pull
docker compose up -d
```

Expected: levanta con la imagen recién buildeada por CI, no la local.

---

### Task 20: Cleanup + documentación final

**Files:**
- Modify: `README.md` (estado actualizado)
- Verificar que `docs/superpowers/specs/` y `docs/superpowers/plans/` están commiteados

- [ ] **Step 1: Actualizar `README.md` con estado de implementación**

Sumar al final de la sección "Estado de implementación":

```markdown
✅ Hoja `Tareas` nueva paralela a `Ingreso de Pendiente` legacy
✅ Integración con archivo externo `_Consorcios` (read-only, cache SWR)
✅ Filtrado de consorcios inactivos (columna `ACTIVO`)
✅ Validación estricta de edificio canónico
✅ Endpoint `/api/health` para Docker
✅ Dockerfile multi-stage con Next.js standalone
✅ `docker-compose.yml` con Cloudflare Tunnel
✅ CI/CD con GitHub Actions (build + push a GHCR)
✅ Smoke test en producción verificado
```

- [ ] **Step 2: Verificar suite final**

```powershell
npm test
npx tsc --noEmit
npm run build
```

Expected: todo verde.

- [ ] **Step 3: Commit final**

```powershell
git add README.md
git commit -m "docs: actualizar estado con deploy completo"
git push origin main
```

---

## Self-Review (post-write)

### Spec coverage
- [x] FR-1 a FR-29: Tasks 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14
- [x] NFR-1 a NFR-11: Tasks 8, 10, 11, 13, 17
- [x] AC-1 a AC-15: Tasks 2, 4, 5, 6, 7, 10, 13, 14, 17, 18

### Riesgos identificados (con mitigación en el plan)
1. **Validación de edificio en POST tareas** podría romper la creación si `_Consorcios` está caída → Task 7 + cache SWR en Task 4 mitiga
2. **Build de Docker grande con webpack** → aceptado en NFR; cache de capas baja el rebuild a ~1 min
3. **OAuth callback URLs deben configurarse manualmente** → Task 18 paso 6
4. **Migración de tareas legacy** → fuera de scope, Anexo A del spec

### Pendiente fuera de scope
- Migración de las 1134 tareas legacy de `Ingreso de Pendiente` → Anexo A del spec
- Migración de archivos legacy de Drive → idem
- Logo PWA real → cuando el usuario suba `public/logo-source.png`, correr `npm run icons`
- Monitoring/alerting externo (Sentry, etc.) → futuro

---

## Estimación

- Tasks 1-7 (refactor + integración _Consorcios): ~3h
- Tasks 8-11 (Docker): ~2h
- Tasks 12-14 (seed + CI/CD): ~2h
- Tasks 15-17 (docs + smoke test): ~1.5h
- Tasks 18-19 (deploy real + tag): ~1h
- Task 20 (cleanup): ~0.5h

**Total estimado: ~10 horas** (incluyendo TDD strict).

Puede ser más rápido si las cuentas de GCP / Cloudflare ya están listas y la SA solo necesita ser compartida con los archivos.
