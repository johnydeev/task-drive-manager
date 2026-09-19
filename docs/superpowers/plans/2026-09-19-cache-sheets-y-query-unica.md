# Cuota de Sheets: cache server-side + query única — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el spec [`../specs/2026-09-19-cache-sheets-y-query-unica-design.md`](../specs/2026-09-19-cache-sheets-y-query-unica-design.md): cache en memoria con TTL 30 s + dedup + reintentos en `lib/sheets/core.ts`, escrituras a través de helpers que invalidan, y `useTareas()` como única fuente de tareas en el cliente con cache offline.

**Architecture:** Todo el tráfico a Google Sheets pasa por cuatro funciones de `core.ts` (`readRange`, `writeRange`, `deleteRows`, `getSheetGid`) envueltas en `conReintentos`. `readRange` cachea por rango y deduplica lecturas en vuelo; `writeRange`/`deleteRows` invalidan la hoja al confirmar. En el cliente, `useTareas()` (con Dexie v4) alimenta lista, dashboard, informes y el `initialData` del detalle; los filtros corren en memoria con `filterTareas`.

**Tech Stack:** Next 16, googleapis (Sheets v4), TanStack Query v5, Dexie 4, Vitest (fake timers, `vi.stubEnv`).

**Reglas del repo:** nunca `git commit` (Jony, GitLens): cada task termina en checkpoint. Tests colocados. Verificación final: `npm test` + `npx tsc --noEmit` + `npm run lint` + `npm run build`.

---

## Mapa de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `lib/sheets/core.ts` | reescribir | cache, dedup, `writeRange`, `deleteRows`, `invalidarHoja`, `conReintentos`, `getSheets` privado |
| `lib/sheets/core.test.ts` | crear | 16 casos |
| `vitest.setup.ts` | modificar | `SHEETS_CACHE_TTL_MS=0` |
| `lib/google-sheets.ts` | modificar | quitar `getSheets` del re-export |
| `lib/sheets/{tareas,tarea-archivos,usuarios,directivas,asignaciones,visitas,edificio-ficha,partes-comunes,config}.ts` | modificar | `values.update` → `writeRange`; `batchUpdate` → `deleteRows` |
| `lib/offline-db.ts` | modificar | v4 `cacheTareas`, `isFresh(ttl)`, `cacheTareas`/`readCachedTareas` |
| `lib/offline-db.test.ts` | crear | round-trip + vencimiento (con `fake-indexeddb`) |
| `hooks/queries.ts` | modificar | `useTareas` con cache offline |
| `hooks/edificios-queries.ts` | modificar | re-export de `useTareas` |
| `hooks/queries.test.tsx` | modificar | caso `useTareas` fallback |
| `app/(app)/tareas/page.tsx` | modificar | `useTareas` + `filterTareas` |
| `app/(app)/tareas/page.test.tsx` | crear | filtros en memoria |
| `components/dashboard/Dashboard.tsx` | modificar | `useTareas` |
| `components/informes/hooks/useInforme.ts` | modificar | `useTareas` + `useEdificios` + filtro |
| `components/informes/InformeEdificio.test.tsx` | modificar | caso reescrito + fixture con fecha del mes actual |
| `components/tareas/hooks/useTareaDetalle.ts` | modificar | `initialData` |
| `components/tareas/hooks/useTareaDetalle.test.tsx` | modificar | 2 casos |
| `components/providers/OfflineSyncProvider.tsx` | modificar | quitar `["tareas-all"]` |

---

### Task 1: `core.ts` — cache, dedup, helpers de escritura, reintentos

**Files:** Modify `lib/sheets/core.ts`; Create `lib/sheets/core.test.ts`; Modify `vitest.setup.ts`, `lib/google-sheets.ts`.

- [ ] **Step 1: Apagar el cache en tests por defecto.** Al inicio de `vitest.setup.ts`, después de los imports:

```ts
// El cache de lecturas de Sheets (lib/sheets/core.ts) queda apagado en tests: los tests de la
// capa de datos mockean googleapis y leen el mismo rango varias veces con datos distintos.
// core.test.ts lo enciende explícitamente con vi.stubEnv.
process.env.SHEETS_CACHE_TTL_MS = "0";
```

- [ ] **Step 2: Escribir `lib/sheets/core.test.ts`** (falla: no existen `writeRange`, `deleteRows`, etc.)

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { valuesGet, valuesUpdate, batchUpdate, spreadsheetsGet } = vi.hoisted(() => ({
  valuesGet: vi.fn(),
  valuesUpdate: vi.fn(),
  batchUpdate: vi.fn(),
  spreadsheetsGet: vi.fn(),
}));
vi.mock("googleapis", () => ({
  google: {
    sheets: () => ({
      spreadsheets: {
        values: { get: valuesGet, update: valuesUpdate },
        get: spreadsheetsGet,
        batchUpdate,
      },
    }),
  },
}));
vi.mock("@/lib/google-auth", () => ({ getGoogleAuth: () => ({}), getSheetId: () => "sheet-id" }));

import { readRange, writeRange, deleteRows, invalidarHoja, resetSheetsCache, hojaDeRango } from "./core";

const filas = (...v: string[]) => ({ data: { values: v.map((x) => [x]) } });
const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { code: String(status) });

beforeEach(() => {
  vi.stubEnv("SHEETS_CACHE_TTL_MS", "30000");
  resetSheetsCache();
  valuesGet.mockReset();
  valuesUpdate.mockReset().mockResolvedValue({});
  batchUpdate.mockReset().mockResolvedValue({});
  spreadsheetsGet.mockReset().mockResolvedValue({
    data: { sheets: [{ properties: { sheetId: 77, title: "Tareas" } }] },
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("hojaDeRango", () => {
  it("extrae el nombre sin comillas", () => {
    expect(hojaDeRango("Tareas!A:AD")).toBe("Tareas");
    expect(hojaDeRango("'Partes Comunes'!A:B")).toBe("Partes Comunes");
    expect(hojaDeRango("Partes Comunes!A2:B")).toBe("Partes Comunes");
  });
});

describe("readRange con cache", () => {
  it("la segunda lectura del mismo rango no llama a Google", async () => {
    valuesGet.mockResolvedValue(filas("a"));
    expect(await readRange("Tareas!A:B")).toEqual([["a"]]);
    expect(await readRange("Tareas!A:B")).toEqual([["a"]]);
    expect(valuesGet).toHaveBeenCalledTimes(1);
  });

  it("un rango distinto sí llama", async () => {
    valuesGet.mockResolvedValue(filas("a"));
    await readRange("Tareas!A:B");
    await readRange("Tareas!A:A");
    expect(valuesGet).toHaveBeenCalledTimes(2);
  });

  it("vencido el TTL vuelve a llamar", async () => {
    vi.useFakeTimers();
    valuesGet.mockResolvedValueOnce(filas("a")).mockResolvedValueOnce(filas("b"));
    await readRange("Tareas!A:B");
    vi.advanceTimersByTime(30_001);
    expect(await readRange("Tareas!A:B")).toEqual([["b"]]);
    expect(valuesGet).toHaveBeenCalledTimes(2);
  });

  it("dos lecturas concurrentes del mismo rango comparten una llamada", async () => {
    valuesGet.mockResolvedValue(filas("a"));
    const [x, y] = await Promise.all([readRange("Tareas!A:B"), readRange("Tareas!A:B")]);
    expect(x).toBe(y);
    expect(valuesGet).toHaveBeenCalledTimes(1);
  });

  it("con TTL 0 cada lectura llama a Google", async () => {
    vi.stubEnv("SHEETS_CACHE_TTL_MS", "0");
    valuesGet.mockResolvedValue(filas("a"));
    await readRange("Tareas!A:B");
    await readRange("Tareas!A:B");
    expect(valuesGet).toHaveBeenCalledTimes(2);
  });

  it("devuelve [] cuando Google no manda values", async () => {
    valuesGet.mockResolvedValue({ data: {} });
    expect(await readRange("Tareas!A:B")).toEqual([]);
  });
});

describe("writeRange", () => {
  it("llama a update con USER_ENTERED e invalida solo su hoja", async () => {
    valuesGet.mockResolvedValue(filas("a"));
    await readRange("Tareas!A:B");
    await readRange("Usuarios!A:G");
    await writeRange("Tareas!A5:B5", [["x", "y"]]);
    expect(valuesUpdate).toHaveBeenCalledWith({
      spreadsheetId: "sheet-id",
      range: "Tareas!A5:B5",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [["x", "y"]] },
    });
    await readRange("Tareas!A:B"); // miss
    await readRange("Usuarios!A:G"); // hit
    expect(valuesGet).toHaveBeenCalledTimes(3);
  });

  it("si la escritura falla, el cache queda intacto", async () => {
    valuesGet.mockResolvedValue(filas("a"));
    await readRange("Tareas!A:B");
    valuesUpdate.mockRejectedValue(httpError(400));
    await expect(writeRange("Tareas!A5:B5", [["x"]])).rejects.toThrow("HTTP 400");
    await readRange("Tareas!A:B");
    expect(valuesGet).toHaveBeenCalledTimes(1);
  });
});

describe("deleteRows", () => {
  it("arma un deleteDimension por fila, en orden descendente, e invalida la hoja", async () => {
    valuesGet.mockResolvedValue(filas("a"));
    await readRange("Tareas!A:B");
    await deleteRows("Tareas", [3, 10, 5]);
    const requests = batchUpdate.mock.calls[0][0].requestBody.requests;
    expect(requests.map((r: { deleteDimension: { range: { startIndex: number } } }) => r.deleteDimension.range.startIndex)).toEqual([9, 4, 2]);
    expect(requests[0].deleteDimension.range).toEqual({ sheetId: 77, dimension: "ROWS", startIndex: 9, endIndex: 10 });
    await readRange("Tareas!A:B");
    expect(valuesGet).toHaveBeenCalledTimes(2);
  });

  it("con lista vacía no llama a Google", async () => {
    await deleteRows("Tareas", []);
    expect(batchUpdate).not.toHaveBeenCalled();
    expect(spreadsheetsGet).not.toHaveBeenCalled();
  });
});

describe("invalidarHoja", () => {
  it("borra todas las keys de esa hoja y deja las demás", async () => {
    valuesGet.mockResolvedValue(filas("a"));
    await readRange("Tareas!A:B");
    await readRange("Tareas!A1:AD1");
    await readRange("Usuarios!A:G");
    invalidarHoja("Tareas");
    await readRange("Tareas!A:B");
    await readRange("Tareas!A1:AD1");
    await readRange("Usuarios!A:G");
    expect(valuesGet).toHaveBeenCalledTimes(5);
  });
});

describe("conReintentos (vía readRange)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("429 → reintenta con 500 ms y resuelve", async () => {
    valuesGet.mockRejectedValueOnce(httpError(429)).mockResolvedValueOnce(filas("ok"));
    const p = readRange("Tareas!A:B");
    await vi.advanceTimersByTimeAsync(500);
    expect(await p).toEqual([["ok"]]);
    expect(valuesGet).toHaveBeenCalledTimes(2);
  });

  it("503 también reintenta", async () => {
    valuesGet.mockRejectedValueOnce(httpError(503)).mockResolvedValueOnce(filas("ok"));
    const p = readRange("Tareas!A:B");
    await vi.advanceTimersByTimeAsync(500);
    expect(await p).toEqual([["ok"]]);
  });

  it("400 no reintenta", async () => {
    valuesGet.mockRejectedValue(httpError(400));
    await expect(readRange("Tareas!A:B")).rejects.toThrow("HTTP 400");
    expect(valuesGet).toHaveBeenCalledTimes(1);
  });

  it("4 fallos seguidos → lanza el último tras 500+1500+4000 ms", async () => {
    valuesGet.mockRejectedValue(httpError(429));
    const p = readRange("Tareas!A:B");
    const rechazo = expect(p).rejects.toThrow("HTTP 429");
    await vi.advanceTimersByTimeAsync(6000);
    await rechazo;
    expect(valuesGet).toHaveBeenCalledTimes(4);
  });

  it("reintenta también en escrituras", async () => {
    valuesUpdate.mockRejectedValueOnce(httpError(429)).mockResolvedValueOnce({});
    const p = writeRange("Tareas!A1:A1", [["x"]]);
    await vi.advanceTimersByTimeAsync(500);
    await p;
    expect(valuesUpdate).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 3: Correr** `npx vitest run lib/sheets/core.test.ts` → FAIL (exports inexistentes).

- [ ] **Step 4: Reescribir `lib/sheets/core.ts`**

```ts
import { google, sheets_v4 } from "googleapis";
import { getGoogleAuth, getSheetId } from "../google-auth";

// Nombres de hojas — coinciden exactamente con los tabs de la spreadsheet.
export const SHEETS = {
  edificios: "Edificios",
  dptos: "Dptos",
  tareas: "Tareas",
  usuarios: "Usuarios",
  // La pestaña real en la Sheet es "Configuracion" (sin tilde). Con tilde, Google
  // devuelve 400 "Unable to parse range" y la config nunca se lee ni se puede guardar.
  configuracion: "Configuracion",
  asignaciones: "Asignaciones",
  directivas: "Directivas",
  tareaArchivos: "TareaArchivos",
  partesComunes: "Partes Comunes",
  visitas: "Visitas",
  edificioFicha: "EdificioFicha",
} as const;

export const TAREAS_RANGE = `${SHEETS.tareas}!A:AD`;

let sheetsClient: sheets_v4.Sheets | null = null;

// Cliente de Sheets memoizado. Privado a propósito: toda lectura/escritura pasa por los
// helpers de abajo, que son los que mantienen el cache coherente.
function getSheets() {
  if (!sheetsClient) {
    sheetsClient = google.sheets({ version: "v4", auth: getGoogleAuth() });
  }
  return sheetsClient;
}

// =====================================================
// Reintentos
// =====================================================

// La cuota de la API es 60 lecturas/min por usuario y la service account es un solo
// usuario: ante 429 (cuota) o 503 (Google inestable) se espera y se reintenta. Google no
// ejecutó nada en esos casos, así que reintentar escrituras también es seguro.
const ESPERAS_MS = [500, 1500, 4000];

// gaxios expone el status como `code` (string) y como `response.status` (number).
function statusDe(err: unknown): number {
  const e = err as { code?: unknown; response?: { status?: unknown } } | null;
  return Number(e?.code) || Number(e?.response?.status) || 0;
}

async function conReintentos<T>(fn: () => Promise<T>): Promise<T> {
  for (let intento = 0; ; intento++) {
    try {
      return await fn();
    } catch (err) {
      const status = statusDe(err);
      const reintentable = status === 429 || status === 503;
      if (!reintentable || intento >= ESPERAS_MS.length) throw err;
      console.warn(`[sheets] ${status} — reintento ${intento + 1}/${ESPERAS_MS.length} en ${ESPERAS_MS[intento]} ms`);
      await new Promise((r) => setTimeout(r, ESPERAS_MS[intento]));
    }
  }
}

// =====================================================
// Cache de lecturas
// =====================================================

// Cache en memoria por rango, por proceso. Prod corre en un solo contenedor; si algún día
// hay varias instancias, cada una ve las escrituras de las otras con hasta TTL de atraso.
// El TTL solo importa para cambios que la app NO hace (ediciones a mano en la planilla):
// lo que escribe la app invalida la hoja al instante vía writeRange/deleteRows.
// SHEETS_CACHE_TTL_MS=0 apaga el cache (vitest.setup.ts lo hace para los tests).
interface Entrada {
  rows: string[][];
  expira: number;
}
const cache = new Map<string, Entrada>();
const enVuelo = new Map<string, Promise<string[][]>>();

function ttlMs(): number {
  const raw = process.env.SHEETS_CACHE_TTL_MS;
  return raw === undefined ? 30_000 : Number(raw);
}

// "Tareas!A:AD" → "Tareas"; "'Partes Comunes'!A:B" → "Partes Comunes".
export function hojaDeRango(range: string): string {
  const hoja = range.split("!")[0] ?? range;
  return hoja.replace(/^'(.*)'$/, "$1");
}

// Lee un rango. Con cache caliente no llama a Google; dos lecturas concurrentes del mismo
// rango comparten una sola llamada. Las filas se devuelven POR REFERENCIA: no mutar el
// array (todos los consumidores hacen slice/map/find).
export async function readRange(range: string): Promise<string[][]> {
  const ttl = ttlMs();
  if (ttl > 0) {
    const hit = cache.get(range);
    if (hit && hit.expira > Date.now()) return hit.rows;
    const pendiente = enVuelo.get(range);
    if (pendiente) return pendiente;
  }
  const p = conReintentos(() =>
    getSheets().spreadsheets.values.get({ spreadsheetId: getSheetId(), range })
  )
    .then((res) => {
      const rows = (res.data.values ?? []) as string[][];
      if (ttl > 0) cache.set(range, { rows, expira: Date.now() + ttl });
      return rows;
    })
    .finally(() => enVuelo.delete(range));
  if (ttl > 0) enVuelo.set(range, p);
  return p;
}

export function invalidarHoja(sheetTitle: string): void {
  for (const key of cache.keys()) {
    if (hojaDeRango(key) === sheetTitle) cache.delete(key);
  }
}

// Solo para tests.
export function resetSheetsCache(): void {
  cache.clear();
  enVuelo.clear();
}

// =====================================================
// Escrituras (invalidan la hoja al confirmar)
// =====================================================

export async function writeRange(range: string, values: (string | number)[][]): Promise<void> {
  await conReintentos(() =>
    getSheets().spreadsheets.values.update({
      spreadsheetId: getSheetId(),
      range,
      valueInputOption: "USER_ENTERED",
      requestBody: { values },
    })
  );
  invalidarHoja(hojaDeRango(range));
}

// Borra filas (1-based) de una hoja en un solo batchUpdate, de abajo hacia arriba para que
// los índices no se corran. Lista vacía → no llama a Google.
export async function deleteRows(sheetTitle: string, rowNumbers: number[]): Promise<void> {
  if (rowNumbers.length === 0) return;
  const gid = await getSheetGid(sheetTitle);
  const requests = [...rowNumbers]
    .sort((a, b) => b - a)
    .map((n) => ({
      deleteDimension: {
        range: { sheetId: gid, dimension: "ROWS" as const, startIndex: n - 1, endIndex: n },
      },
    }));
  await conReintentos(() =>
    getSheets().spreadsheets.batchUpdate({
      spreadsheetId: getSheetId(),
      requestBody: { requests },
    })
  );
  invalidarHoja(sheetTitle);
}

// gid (sheetId interno) por título de pestaña, cacheado. Necesario para borrar filas
// con batchUpdate/deleteDimension.
const gidCache: Record<string, number> = {};
export async function getSheetGid(title: string): Promise<number> {
  if (gidCache[title] != null) return gidCache[title];
  const meta = await conReintentos(() =>
    getSheets().spreadsheets.get({
      spreadsheetId: getSheetId(),
      fields: "sheets(properties(sheetId,title))",
    })
  );
  const sheet = meta.data.sheets?.find((s) => s.properties?.title === title);
  const gid = sheet?.properties?.sheetId;
  if (gid == null) throw new Error(`No se encontró la hoja "${title}"`);
  gidCache[title] = gid;
  return gid;
}
```

- [ ] **Step 5: Quitar `getSheets` del re-export.** En `lib/google-sheets.ts` línea 4:

```ts
export { SHEETS, TAREAS_RANGE, readRange } from "./sheets/core";
```

- [ ] **Step 6: Correr** `npx vitest run lib/sheets/core.test.ts` → PASS 16. (Los módulos de `lib/sheets/*` todavía importan `getSheets` → `tsc` falla hasta la Task 2; no correr la suite completa aún.)

- [ ] **Step 7: Checkpoint.**

---

### Task 2: Migrar los 9 módulos a `writeRange` / `deleteRows`

**Files:** Modify `lib/sheets/{tareas,tarea-archivos,usuarios,directivas,asignaciones,visitas,edificio-ficha,partes-comunes,config}.ts`.

Patrón para cada `values.update`:

```ts
// antes
await getSheets().spreadsheets.values.update({
  spreadsheetId: getSheetId(),
  range: `${SHEETS.x}!A${n}:F${n}`,
  valueInputOption: "USER_ENTERED",
  requestBody: { values: [row] },
});
// después
await writeRange(`${SHEETS.x}!A${n}:F${n}`, [row]);
```

Patrón para cada `batchUpdate` con un solo `deleteDimension` de la fila `rowNumber`:

```ts
// antes
const gid = await getSheetGid(SHEETS.x);
await getSheets().spreadsheets.batchUpdate({ … deleteDimension { startIndex: rowNumber - 1, endIndex: rowNumber } … });
// después
await deleteRows(SHEETS.x, [rowNumber]);
```

- [ ] **Step 1: `lib/sheets/tareas.ts`**
  - Import: `import { readRange, writeRange, deleteRows, SHEETS, TAREAS_RANGE } from "./core";` (sacar `getSheets`, `getSheetGid`; `colLetter` se sigue usando; `getSheetId` de `../google-auth` deja de usarse → sacar el import).
  - `appendTarea` (línea ~259): `await writeRange(\`${SHEETS.tareas}!A${nextRow}:${colLetter(values.length)}${nextRow}\`, [values]);`
  - `deleteTarea` (línea ~284–299): reemplazar desde `const gid = …` hasta el cierre del `batchUpdate` por `await deleteRows(SHEETS.tareas, [current.rowNumber]);`
  - `updateTarea` (línea ~332): `await writeRange(\`${SHEETS.tareas}!A${current.rowNumber}:${colLetter(values.length)}${current.rowNumber}\`, [values]);`

- [ ] **Step 2: `lib/sheets/tarea-archivos.ts`**
  - Import: `import { readRange, writeRange, deleteRows, SHEETS } from "./core";` y sacar `getSheetId` si queda sin uso.
  - `deleteArchivosByTarea`: reemplazar todo desde `const gid = …` hasta el `batchUpdate` por `await deleteRows(SHEETS.tareaArchivos, nums);` (el `if (nums.length === 0) return;` puede quedar o irse; `deleteRows` ya lo cubre).
  - Escritura (línea ~146): `await writeRange(\`${SHEETS.tareaArchivos}!A${nextRow}:F${lastRow}\`, rows);`

- [ ] **Step 3: `lib/sheets/usuarios.ts`** — 5 sitios: import `{ readRange, writeRange, SHEETS }`; cada `values.update` → `writeRange(range, values)` con el mismo `range` y `requestBody.values`. Sacar `getSheetId` si queda sin uso.

- [ ] **Step 4: `lib/sheets/directivas.ts`** — 2 `update` → `writeRange`; el `batchUpdate` de `deleteDirectiva` → `deleteRows(SHEETS.directivas, [rowNumber])`. Import `{ readRange, writeRange, deleteRows, SHEETS }`.

- [ ] **Step 5: `lib/sheets/asignaciones.ts`** — 1 `update` → `writeRange`; `removeAsignacion` → `deleteRows(SHEETS.asignaciones, [match.rowNumber])`.

- [ ] **Step 6: `lib/sheets/visitas.ts`** — 1 `update` → `writeRange`; `deleteVisita` → `deleteRows(SHEETS.visitas, [rowNumber])`.

- [ ] **Step 7: `lib/sheets/edificio-ficha.ts`** — 2 `update` → `writeRange`.

- [ ] **Step 8: `lib/sheets/partes-comunes.ts`** — 1 `update` → `writeRange`.

- [ ] **Step 9: `lib/sheets/config.ts`** — 1 `update` → `writeRange(\`${SHEETS.configuracion}!A2:B${entries.length + 1}\`, entries)`. Su cache propio de 5 min se mantiene.

- [ ] **Step 10: Verificar que no queda ningún `getSheets` fuera de core**

Run: `grep -rn "getSheets\|getSheetGid\|batchUpdate\|values.update" lib/sheets/*.ts | grep -v test | grep -v core.ts`
Expected: sin salida.

- [ ] **Step 11: Tipos + tests de la capa**

Run: `npx tsc --noEmit && npx vitest run lib/sheets tests/lib`
Expected: PASS. Los tests existentes mockean `googleapis.values.update`/`batchUpdate`, que los helpers siguen llamando con la misma forma. Si alguno afirma `getSheetGid` mockeado desde `./core`, adaptar el mock a `deleteRows`.

- [ ] **Step 12: Checkpoint.**

---

### Task 3: Dexie v4 + cache offline de tareas

**Files:** Modify `lib/offline-db.ts`; Create `lib/offline-db.test.ts`.

- [ ] **Step 1: Test** (`fake-indexeddb` no está instalado → el test usa el mock de Dexie a nivel tabla. Para no sumar dependencia, se testea la lógica de frescura y el round-trip vía la API de `AppDB` con `fake-indexeddb/auto` **solo si está disponible**; como no lo está, el test cubre `isFresh` exportada y los helpers con `getDb` mockeado):

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const { put, get } = vi.hoisted(() => ({ put: vi.fn(), get: vi.fn() }));
vi.mock("dexie", () => {
  class FakeDexie {
    cacheTareas = { put, get };
    constructor(_name: string) {}
    version() { return { stores: () => this }; }
  }
  return { default: FakeDexie, Table: class {} };
});

import { cacheTareas, readCachedTareas, isFresh, TTL_TAREAS_MS } from "./offline-db";

beforeEach(() => {
  put.mockReset().mockResolvedValue(undefined);
  get.mockReset();
});

describe("isFresh", () => {
  it("usa 30 min por defecto y acepta un TTL custom", () => {
    const hace20min = new Date(Date.now() - 20 * 60_000).toISOString();
    const hace2h = new Date(Date.now() - 2 * 3_600_000).toISOString();
    expect(isFresh(hace20min)).toBe(true);
    expect(isFresh(hace2h)).toBe(false);
    expect(isFresh(hace2h, TTL_TAREAS_MS)).toBe(true);
    expect(isFresh("no-es-fecha")).toBe(false);
  });
});

describe("cacheTareas / readCachedTareas", () => {
  const tareas = [{ rowId: "1" }] as never;

  it("guarda bajo la key 'all' con timestamp", async () => {
    await cacheTareas(tareas);
    expect(put).toHaveBeenCalledWith(expect.objectContaining({ key: "all", value: tareas }));
  });

  it("devuelve el valor si tiene menos de 24 h", async () => {
    get.mockResolvedValue({ key: "all", value: tareas, updatedAt: new Date(Date.now() - 23 * 3_600_000).toISOString() });
    expect(await readCachedTareas()).toBe(tareas);
  });

  it("devuelve null si pasaron más de 24 h o no hay entrada", async () => {
    get.mockResolvedValue({ key: "all", value: tareas, updatedAt: new Date(Date.now() - 25 * 3_600_000).toISOString() });
    expect(await readCachedTareas()).toBeNull();
    get.mockResolvedValue(undefined);
    expect(await readCachedTareas()).toBeNull();
  });
});
```

- [ ] **Step 2: Correr** `npx vitest run lib/offline-db.test.ts` → FAIL (exports).

- [ ] **Step 3: Implementar en `lib/offline-db.ts`**
  - Import de tipos: sumar `Tarea`.
  - Clase: `cacheTareas!: Table<CacheEntry<Tarea[]>, string>;` y después del `version(3)`:
    ```ts
    // v4: cache de la lista de tareas (lista/detalle/dashboard sin red).
    this.version(4).stores({
      cacheTareas: "key",
    });
    ```
  - `isFresh` pasa a exportada con TTL opcional:
    ```ts
    const TTL_MS = 30 * 60 * 1000; // 30 min — la red es la fuente, esto es para offline
    // Las tareas se guardan más tiempo: en el subsuelo sirve ver la lista de esta mañana.
    export const TTL_TAREAS_MS = 24 * 60 * 60 * 1000;

    export function isFresh(updatedAt: string, ttlMs: number = TTL_MS): boolean {
      const t = Date.parse(updatedAt);
      return Number.isFinite(t) && Date.now() - t < ttlMs;
    }
    ```
  - Helpers, junto a los de edificios:
    ```ts
    export async function cacheTareas(value: Tarea[]) {
      const db = getDb();
      await db.cacheTareas.put({ key: "all", value, updatedAt: new Date().toISOString() });
    }

    export async function readCachedTareas(): Promise<Tarea[] | null> {
      const db = getDb();
      const entry = await db.cacheTareas.get("all");
      if (!entry || !isFresh(entry.updatedAt, TTL_TAREAS_MS)) return null;
      return entry.value;
    }
    ```
  - `getDb()` lanza si no hay `window`; el test corre en jsdom → hay `window`. OK.

- [ ] **Step 4: Correr** `npx vitest run lib/offline-db.test.ts` → PASS 4.

- [ ] **Step 5: Checkpoint.**

---

### Task 4: `useTareas` con cache offline + re-export

**Files:** Modify `hooks/queries.ts`, `hooks/edificios-queries.ts`, `hooks/queries.test.tsx`.

- [ ] **Step 1: Test** — en `hooks/queries.test.tsx`: sumar `tareas: { list: vi.fn() }` al mock de `api`, `cacheTareas: vi.fn(), readCachedTareas: vi.fn()` al mock de `offline-db`, importar `useTareas` de `./queries` y `readCachedTareas` de offline-db, y agregar:

```ts
  it("useTareas cae al cache de Dexie cuando la red falla", async () => {
    vi.mocked(api.tareas.list).mockRejectedValue(new Error("offline"));
    vi.mocked(readCachedTareas).mockResolvedValue([{ rowId: "1" }] as never);
    const { result } = renderHook(() => useTareas(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ rowId: "1" }]);
  });
```

- [ ] **Step 2: Correr** → FAIL (`useTareas` no exportada de `./queries`).

- [ ] **Step 3: Implementar.** En `hooks/queries.ts`, sumar `cacheTareas, readCachedTareas` al import de offline-db y al final:

```ts
// Todas las tareas: ÚNICA fuente de tareas en el cliente (lista, dashboard, informes,
// initialData del detalle). Cada pantalla filtra en memoria con filterTareas.
// La key ARRANCA con "tareas" a propósito: así la alcanza el
// `invalidateQueries({ queryKey: ["tareas"] })` que corre tras cada transición.
export const useTareas = () =>
  useCachedQuery({
    queryKey: ["tareas", "all"],
    fetcher: () => api.tareas.list({}),
    cache: cacheTareas,
    readCache: readCachedTareas,
    staleTime: 30_000,
  });
```

En `hooks/edificios-queries.ts`, reemplazar la definición de `useTareas` (con su comentario) por:

```ts
// useTareas vive en ./queries (tiene cache offline); se re-exporta para los consumidores
// históricos de la vista Edificios.
export { useTareas } from "./queries";
```

- [ ] **Step 4: Correr** `npx vitest run hooks` → PASS (incluido el test de regresión de la key en `edificios-queries.test.tsx`).

- [ ] **Step 5: Checkpoint.**

---

### Task 5: Lista `/tareas` con filtros en memoria

**Files:** Modify `app/(app)/tareas/page.tsx`; Create `app/(app)/tareas/page.test.tsx`.

- [ ] **Step 1: Test**

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Tarea } from "@/types";

const { useSession } = vi.hoisted(() => ({ useSession: vi.fn() }));
vi.mock("next-auth/react", () => ({ useSession }));
vi.mock("@/lib/api-client", () => ({
  api: {
    tareas: { list: vi.fn(), remove: vi.fn() },
    edificios: { list: vi.fn() },
  },
}));
vi.mock("@/lib/offline-db", () => ({
  cacheTareas: vi.fn(),
  readCachedTareas: vi.fn(),
  cacheEdificios: vi.fn(),
  readCachedEdificios: vi.fn(),
}));

import { api } from "@/lib/api-client";
import TareasPage from "./page";

const tarea = (over: Partial<Tarea>): Tarea =>
  ({
    rowId: "1", objetivo: "x", fechaInicio: "2026-09-01", fechaEstimada: "", edificio: "E1",
    parteComun: false, dpto: "1A", informe: "", imagenes: [], videos: [], documentos: [],
    estado: "Sin asignar", prioridad: "Media", supervisor: "s@x.com", ...over,
  }) as Tarea;

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><TareasPage /></QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  useSession.mockReturnValue({ data: { user: { email: "yo@x.com", rol: "admin" } } });
  vi.mocked(api.edificios.list).mockResolvedValue([{ nombre: "E1" }, { nombre: "E2" }]);
  vi.mocked(api.tareas.list).mockResolvedValue([
    tarea({ rowId: "1", objetivo: "Pintar", estado: "Sin asignar", edificio: "E1" }),
    tarea({ rowId: "2", objetivo: "Plomería", estado: "Realizada", edificio: "E2", asignadoA: "yo@x.com" }),
    tarea({ rowId: "3", objetivo: "Luz", estado: "En Proceso", edificio: "E1", asignadoA: "otro@x.com" }),
  ]);
});

describe("TareasPage — filtros en memoria", () => {
  it("carga la lista una sola vez y filtra por estado sin volver a pedirla", async () => {
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText("3 resultados")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /filtros/i }));
    await user.selectOptions(screen.getByLabelText("Estado"), "En Proceso");

    expect(await screen.findByText("1 resultado")).toBeInTheDocument();
    expect(screen.getByText("Luz")).toBeInTheDocument();
    expect(screen.queryByText("Pintar")).not.toBeInTheDocument();
    expect(api.tareas.list).toHaveBeenCalledTimes(1);
  });

  it("«Mis tareas asignadas» deja solo las del usuario", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("3 resultados");
    await user.click(screen.getByRole("button", { name: "Mis tareas asignadas" }));
    await waitFor(() => expect(screen.getByText("1 resultado")).toBeInTheDocument());
    expect(screen.getByText("Plomería")).toBeInTheDocument();
    expect(api.tareas.list).toHaveBeenCalledTimes(1);
  });

  it("«Sin asignar» solo aparece para admin", async () => {
    useSession.mockReturnValue({ data: { user: { email: "yo@x.com", rol: "supervisor" } } });
    renderPage();
    await screen.findByText("3 resultados");
    expect(screen.queryByRole("button", { name: "Sin asignar" })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr** `npx vitest run "app/(app)/tareas/page.test.tsx"` → FAIL (la página llama `apiFetch("/api/tareas…")`, que no está en el mock).

- [ ] **Step 3: Implementar en `app/(app)/tareas/page.tsx`**
  - Imports: sacar `useQuery` (queda `useMutation`, `useQueryClient`), sacar `apiFetch`; sumar `import { useEdificios, useTareas } from "@/hooks/queries";` y `import { filterTareas } from "@/lib/tareas-filter";`. Sacar `Edificio` del import de tipos si queda sin uso.
  - Borrar `fetchTareas` y `fetchEdificios`.
  - Reemplazar el `useMemo` de `params` por:
    ```ts
    const filtros = useMemo(
      () => ({
        edificio: edificio || undefined,
        estado: estado === "Todos" ? undefined : estado,
        prioridad: prioridad === "Todas" ? undefined : prioridad,
        asignado: soloMias && myEmail ? myEmail : undefined,
        sinAsignar: soloSinAsignar || undefined,
      }),
      [edificio, estado, prioridad, soloMias, soloSinAsignar, myEmail]
    );
    ```
  - Reemplazar las dos `useQuery` por:
    ```ts
    // Única fuente de tareas (compartida con dashboard/informes/detalle); los filtros corren
    // en memoria, así cambiar un select no vuelve a pegarle a la API.
    const tareasQ = useTareas();
    const edificiosQ = useEdificios();
    const tareas = useMemo(() => filterTareas(tareasQ.data ?? [], filtros), [tareasQ.data, filtros]);
    ```
  - En el JSX: `tareasQ.data ? \`${tareasQ.data.length} …\`` → usar `tareas.length` (manteniendo el guard `tareasQ.data ?`); `tareasQ.data?.map` → `tareas.map`; `tareasQ.data?.length === 0` → `tareas.length === 0`.
  - Los `<label>` de los filtros ya envuelven al `<select>` con un `<span>` de texto → `getByLabelText("Estado")` funciona sin cambios.

- [ ] **Step 4: Correr** → PASS 3.

- [ ] **Step 5: Checkpoint.**

---

### Task 6: Dashboard, Informes, Detalle, OfflineSyncProvider

**Files:** Modify `components/dashboard/Dashboard.tsx`, `components/informes/hooks/useInforme.ts`, `components/informes/InformeEdificio.test.tsx`, `components/tareas/hooks/useTareaDetalle.ts`, `components/tareas/hooks/useTareaDetalle.test.tsx`, `components/providers/OfflineSyncProvider.tsx`.

- [ ] **Step 1: Dashboard.** Reemplazar

```ts
  const tareasQ = useQuery({
    queryKey: ["tareas", "all"],
    queryFn: () => api.tareas.list({}),
  });
  const edificiosQ = useQuery({ queryKey: ["edificios"], queryFn: api.edificios.list });
```

por

```ts
  const tareasQ = useTareas();
  const edificiosQ = useEdificios();
```

con `import { useEdificios, useTareas } from "@/hooks/queries";`; sacar `useQuery` y `api` de los imports si quedan sin uso (el comentario sobre la key se va con la `useQuery`).

- [ ] **Step 2: Informes — test primero.** En `InformeEdificio.test.tsx`:
  - Fixture: `fechaInicio` del mes actual, para que el filtro por defecto (mes en curso) la incluya:
    ```ts
    const hoy = new Date();
    const PRIMERO_DEL_MES = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-01`;
    ```
    y en `tarea()`: `fechaInicio: PRIMERO_DEL_MES,` (el `rowId` puede quedar).
  - Sumar al mock de `@/lib/api-client` lo que ya tenga más nada nuevo (ya tiene `tareas.list`, `edificios.list`, `configuracion.get`). Sumar un mock de offline-db:
    ```ts
    vi.mock("@/lib/offline-db", () => ({
      cacheTareas: vi.fn(), readCachedTareas: vi.fn(),
      cacheEdificios: vi.fn(), readCachedEdificios: vi.fn(),
    }));
    ```
  - Reescribir el primer caso:
    ```ts
      it("pide elegir un edificio antes de mostrar el informe", async () => {
        renderConQuery();
        expect(await screen.findByText(/eleg[ií] un edificio para ver su informe/i)).toBeInTheDocument();
        expect(screen.queryByRole("table")).not.toBeInTheDocument();
      });
    ```
    (si el componente no usa `<table>`, afirmar que no aparece el membrete: `screen.queryByText("ADMINISTRACION MORINIGO")`).

- [ ] **Step 3: Informes — implementar `useInforme.ts`.**
  - Imports: sacar `useQuery` (queda `useMutation`); `api` se sigue usando para `configuracion.get`; sumar `import { useEdificios, useTareas } from "@/hooks/queries";` y `import { filterTareas } from "@/lib/tareas-filter";`.
  - Reemplazar `edificiosQ` y `tareasQ` por:
    ```ts
    const edificiosQ = useEdificios();
    // Única fuente de tareas; el recorte por edificio y rango se hace en memoria.
    const tareasQ = useTareas();
    const tareasFiltradas = useMemo(
      () => (edificio ? filterTareas(tareasQ.data ?? [], { edificio, desde: desde || undefined, hasta: hasta || undefined }) : []),
      [tareasQ.data, edificio, desde, hasta]
    );
    const grupos = useMemo(() => agruparParaInforme(tareasFiltradas), [tareasFiltradas]);
    const total = tareasFiltradas.length;
    ```
  - `cargando: tareasQ.isLoading && !!edificio`, `error: tareasQ.isError && !!edificio` (sin edificio no hay nada que cargar ni error que mostrar).

- [ ] **Step 4: Detalle — test primero.** En `useTareaDetalle.test.tsx`, agregar (usa el `tarea` hoisted y el `QueryClient` que ya arma cada caso — mirar cómo construye `wrapper` el archivo y reutilizarlo):

```ts
  it("con la lista precargada, tareaQ.data está en el primer render sin llamar a api.tareas.get", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(["tareas", "all"], [tarea]);
    const { result } = renderHook(() => useTareaDetalle(tarea.rowId), { wrapper: wrapperCon(qc) });
    expect(result.current.tareaQ.data).toEqual(tarea);
    expect(api.tareas.get).not.toHaveBeenCalled();
  });

  it("sin lista precargada llama a api.tareas.get", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useTareaDetalle(tarea.rowId), { wrapper: wrapperCon(qc) });
    await waitFor(() => expect(result.current.tareaQ.isSuccess).toBe(true));
    expect(api.tareas.get).toHaveBeenCalledWith(tarea.rowId);
  });
```

donde `wrapperCon(qc)` es un helper local `({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>` (si el archivo ya tiene uno equivalente, usar ese). Nota: `setQueryData` marca `dataUpdatedAt = ahora`, dentro del `staleTime` de 30 s → no refetchea → `get` no se llama.

- [ ] **Step 5: Detalle — implementar.** En `useTareaDetalle.ts`:

```ts
  const tareaQ = useQuery({
    queryKey: ["tarea", rowId],
    queryFn: () => api.tareas.get(rowId),
    // Render inmediato desde la lista ya cargada (si está); initialDataUpdatedAt hace que
    // TanStack respete el staleTime y refetchee en segundo plano si el dato es viejo.
    initialData: () => qc.getQueryData<Tarea[]>(["tareas", "all"])?.find((t) => t.rowId === rowId),
    initialDataUpdatedAt: () => qc.getQueryState(["tareas", "all"])?.dataUpdatedAt,
    staleTime: 30_000,
  });
```

(`qc` ya está declarado arriba con `useQueryClient()`.)

- [ ] **Step 6: `OfflineSyncProvider`.** Borrar las dos líneas `qc.invalidateQueries({ queryKey: ["tareas-all"] });`.

- [ ] **Step 7: Correr** `npx vitest run components hooks "app/(app)"` → PASS.

- [ ] **Step 8: Checkpoint.**

---

### Task 7: Verificación final

- [ ] `npm test` → PASS (602 + ~28 nuevos).
- [ ] `npx tsc --noEmit` → sin salida.
- [ ] `npm run lint` → 0 errores (6 warnings preexistentes).
- [ ] `npm run build` → OK.
- [ ] `grep -rn "tareas-all" --include=*.ts --include=*.tsx app components hooks lib` → sin salida.
- [ ] Reporte: verde, listo para commitear. Criterios 1–7 del spec cubiertos por tests; el 8 por estos comandos.
