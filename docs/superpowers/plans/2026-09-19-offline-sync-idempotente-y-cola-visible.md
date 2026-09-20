# Offline: sync idempotente, Background Sync arreglado y cola visible — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el spec [`../specs/2026-09-19-offline-sync-idempotente-y-cola-visible-design.md`](../specs/2026-09-19-offline-sync-idempotente-y-cola-visible-design.md): `POST /api/tareas` idempotente por `rowId` + lock de append por hoja, errores tipados, cola sin tope con rechazos marcados, SW arreglado, y sección «Pendientes de subir» + «Sincronizar ahora».

**Architecture:** Server: la ruta busca por `rowId` antes de crear y serializa creaciones del mismo id con un `Map` de promesas; `core.ts` gana `conLockDeHoja` para serializar los «fila libre por columna A» de `Tareas`/`TareaArchivos`. Cliente: `ApiClientError` con `status`; `lib/sync-clasificacion.ts` decide red vs rechazo y lo comparten `offline-sync.ts` y `app/sw.ts`; la cola en Dexie gana `errorMsg`; la UI lee `usePendingTareas()` (live) y dispara `syncPendingTareas()`, avisando con el evento `tareas-synced` (que `OfflineSyncProvider` ya escucha) para invalidar TanStack sin depender de un `QueryClient`.

**Tech Stack:** Next 16, TanStack Query v5, Dexie 4 + IndexedDB nativo (SW), serwist, Vitest.

**Reglas del repo:** nunca `git commit` (checkpoints). Tests colocados salvo rutas (`tests/api/`). Verificación final: `npm test` + `npx tsc --noEmit` + `npm run lint` + `npm run build`.

---

## Mapa de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `lib/sheets/core.ts` + `core.test.ts` | modificar | `conLockDeHoja` |
| `lib/sheets/tareas.ts`, `lib/sheets/tarea-archivos.ts` | modificar | lock en `appendTarea` / `setArchivosForTarea` |
| `tests/lib/google-sheets-crud.test.ts` | modificar | dos `appendTarea` concurrentes |
| `app/api/tareas/route.ts` | modificar | idempotencia por `rowId` + lock |
| `tests/api/tareas-idempotente.test.ts` | crear | 5 casos |
| `tests/api/tareas-edificio-validation.test.ts` | modificar | factory suma `getTareaByRowId` |
| `lib/api-client.ts` + `api-client.test.ts` | modificar | `ApiClientError` |
| `lib/sync-clasificacion.ts` + test | crear | `clasificarStatus`, `clasificarFalloSync` |
| `types/index.ts` | modificar | `TareaPendiente.errorMsg` |
| `lib/offline-db.ts` + test | modificar | `listPendientes` excluye rechazadas; `marcarRechazada`, `reintentarPendiente`, `descartarPendiente` |
| `lib/offline-sync.ts` + `offline-sync.test.ts` (nuevo) | modificar | sin tope, rechazo, `rowId` |
| `app/sw.ts` | modificar | open sin versión, transacciones cortas, `rowId`/`documentos`, clasificación |
| `components/tareas/PendientesDeSubir.tsx` + test | crear | sección en `/tareas` |
| `app/(app)/tareas/page.tsx` + `page.test.tsx` | modificar | montar la sección; mock de `usePendingTareas` |
| `components/layout/OfflineIndicator.tsx` + test | modificar | «Sincronizar ahora» |

---

### Task 1: `conLockDeHoja` + lock en `appendTarea` / `setArchivosForTarea`

**Files:** Modify `lib/sheets/core.ts`, `lib/sheets/core.test.ts`, `lib/sheets/tareas.ts`, `lib/sheets/tarea-archivos.ts`, `tests/lib/google-sheets-crud.test.ts`.

- [ ] **Step 1: Tests de `conLockDeHoja`** — al final de `lib/sheets/core.test.ts` (sumar `conLockDeHoja` al import):

```ts
describe("conLockDeHoja", () => {
  const diferido = <T,>() => {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  };

  it("dos llamadas de la misma hoja corren en orden", async () => {
    const orden: string[] = [];
    const a = diferido<void>();
    const p1 = conLockDeHoja("Tareas", async () => { orden.push("a-start"); await a.promise; orden.push("a-end"); });
    const p2 = conLockDeHoja("Tareas", async () => { orden.push("b-start"); });
    await Promise.resolve();
    expect(orden).toEqual(["a-start"]);
    a.resolve();
    await Promise.all([p1, p2]);
    expect(orden).toEqual(["a-start", "a-end", "b-start"]);
  });

  it("hojas distintas corren en paralelo", async () => {
    const orden: string[] = [];
    const a = diferido<void>();
    const p1 = conLockDeHoja("Tareas", async () => { orden.push("a-start"); await a.promise; });
    const p2 = conLockDeHoja("Usuarios", async () => { orden.push("b-start"); });
    await p2;
    expect(orden).toEqual(["a-start", "b-start"]);
    a.resolve();
    await p1;
  });

  it("si la primera rechaza, la segunda corre igual", async () => {
    const p1 = conLockDeHoja("Tareas", async () => { throw new Error("boom"); });
    const p2 = conLockDeHoja("Tareas", async () => "ok");
    await expect(p1).rejects.toThrow("boom");
    expect(await p2).toBe("ok");
  });
});
```

- [ ] **Step 2: Implementar en `core.ts`** (nueva sección antes de «Escrituras»):

```ts
// =====================================================
// Lock de append por hoja
// =====================================================

// Serializa las escrituras "fila libre por columna A" de una misma hoja dentro del proceso:
// dos altas concurrentes leerían el mismo A:A (el dedup de readRange lo garantiza) y
// escribirían en la misma fila. Cadena de promesas por hoja; un fallo no corta la cadena.
const locksPorHoja = new Map<string, Promise<unknown>>();

export function conLockDeHoja<T>(sheetTitle: string, fn: () => Promise<T>): Promise<T> {
  const previo = locksPorHoja.get(sheetTitle) ?? Promise.resolve();
  const propio = previo.catch(() => undefined).then(fn);
  locksPorHoja.set(sheetTitle, propio);
  propio
    .catch(() => undefined)
    .finally(() => {
      if (locksPorHoja.get(sheetTitle) === propio) locksPorHoja.delete(sheetTitle);
    });
  return propio;
}
```

- [ ] **Step 3: Aplicar en `lib/sheets/tareas.ts`** (`appendTarea`, sumar `conLockDeHoja` al import de `./core`). Reemplazar:

```ts
  const h = await getTareasHeaderMap();
  const colA = await readRange(`${SHEETS.tareas}!A:A`);
  const nextRow = colA.length + 1;
  const values = tareaToRow(h, tarea);
  await writeRange(`${SHEETS.tareas}!A${nextRow}:${colLetter(values.length)}${nextRow}`, [values]);
  tarea.rowNumber = nextRow;
```

por:

```ts
  // Bajo lock: otra alta concurrente en Tareas espera a que esta termine (y su writeRange
  // invalide A:A) antes de calcular su propia fila libre.
  tarea.rowNumber = await conLockDeHoja(SHEETS.tareas, async () => {
    const h = await getTareasHeaderMap();
    const colA = await readRange(`${SHEETS.tareas}!A:A`);
    const nextRow = colA.length + 1;
    const values = tareaToRow(h, tarea);
    await writeRange(`${SHEETS.tareas}!A${nextRow}:${colLetter(values.length)}${nextRow}`, [values]);
    return nextRow;
  });
```

- [ ] **Step 4: Aplicar en `lib/sheets/tarea-archivos.ts`** (`setArchivosForTarea`, sumar `conLockDeHoja` al import). Reemplazar las tres líneas `const colA…` / `nextRow` / `lastRow` / `writeRange` por:

```ts
  await conLockDeHoja(SHEETS.tareaArchivos, async () => {
    const colA = await readRange(`${SHEETS.tareaArchivos}!A:A`);
    const nextRow = colA.length + 1;
    const lastRow = nextRow + rows.length - 1;
    await writeRange(`${SHEETS.tareaArchivos}!A${nextRow}:F${lastRow}`, rows);
  });
```

- [ ] **Step 5: Test de integración** en `tests/lib/google-sheets-crud.test.ts`, dentro de `describe("appendTarea (real)")`:

```ts
  it("dos altas concurrentes caen en filas distintas (lock por hoja)", async () => {
    vi.stubEnv("SHEETS_CACHE_TTL_MS", "30000");
    resetSheetsCache();
    try {
      // A:A crece una fila por cada escritura, como en la Sheet real.
      let filasA = [["h"], ["x"]];
      valuesGet.mockImplementation(({ range }: { range: string }) =>
        Promise.resolve({ data: { values: range === "Tareas!A:A" ? filasA : [HEADER_22] } })
      );
      valuesUpdate.mockImplementation(async () => {
        filasA = [...filasA, ["nueva"]];
        return {};
      });
      const base = {
        objetivo: "obj", fechaInicio: "2026-07-16", fechaEstimada: "", edificio: "Edif A",
        parteComun: false, dpto: "1A", informe: "x", estado: "Sin asignar" as const,
        prioridad: "Media" as const, imagenes: [], videos: [], documentos: [],
      };
      const [t1, t2] = await Promise.all([
        appendTarea({ ...base, rowId: "2026-07-16T10:00:00.000Z" }, "sup@x.com"),
        appendTarea({ ...base, rowId: "2026-07-16T10:00:01.000Z" }, "sup@x.com"),
      ]);
      expect([t1.rowNumber, t2.rowNumber].sort()).toEqual([3, 4]);
    } finally {
      vi.unstubAllEnvs();
      resetSheetsCache();
    }
  });
```

- [ ] **Step 6: Correr** `npx vitest run lib/sheets tests/lib` → PASS. **Checkpoint.**

---

### Task 2: `POST /api/tareas` idempotente

**Files:** Modify `app/api/tareas/route.ts`, `tests/api/tareas-edificio-validation.test.ts`; Create `tests/api/tareas-idempotente.test.ts`.

- [ ] **Step 1: Test**

```ts
// tests/api/tareas-idempotente.test.ts
// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/tareas/route";

vi.mock("@/lib/auth", () => ({
  requireSession: vi.fn().mockResolvedValue({ user: { email: "s@x.com", rol: "supervisor" } }),
}));
vi.mock("@/lib/consorcios", () => ({
  getConsorciosActivos: vi.fn().mockResolvedValue([{ nombre: "Edif A", cuit: "1", nombresAlternativos: [] }]),
}));
const { appendTarea, getTareaByRowId } = vi.hoisted(() => ({
  appendTarea: vi.fn(),
  getTareaByRowId: vi.fn(),
}));
vi.mock("@/lib/google-sheets", () => ({ appendTarea, getTareaByRowId, getTareas: vi.fn() }));

const body = (extra: Record<string, unknown> = {}) => ({
  objetivo: "Pintar", fechaInicio: "2026-09-19", edificio: "Edif A", parteComun: false,
  dpto: "1A", informe: "x", prioridad: "Media", ...extra,
});
const post = (b: unknown) =>
  POST(new NextRequest("http://localhost/api/tareas", { method: "POST", body: JSON.stringify(b) }), undefined);

beforeEach(() => {
  appendTarea.mockReset().mockImplementation(async (input) => ({ ...input, rowId: input.rowId ?? "nuevo" }));
  getTareaByRowId.mockReset().mockResolvedValue(null);
});

describe("POST /api/tareas — idempotencia por rowId", () => {
  it("rowId existente → 200 con la tarea existente y sin crear", async () => {
    getTareaByRowId.mockResolvedValue({ rowId: "R1", objetivo: "ya estaba" });
    const res = await post(body({ rowId: "R1" }));
    expect(res.status).toBe(200);
    expect((await res.json()).objetivo).toBe("ya estaba");
    expect(appendTarea).not.toHaveBeenCalled();
  });

  it("rowId nuevo → 201 y appendTarea recibe ese rowId", async () => {
    const res = await post(body({ rowId: "R2" }));
    expect(res.status).toBe(201);
    expect(appendTarea).toHaveBeenCalledWith(expect.objectContaining({ rowId: "R2" }), "s@x.com");
  });

  it("sin rowId → 201 como siempre, sin buscar", async () => {
    const res = await post(body());
    expect(res.status).toBe(201);
    expect(getTareaByRowId).not.toHaveBeenCalled();
  });

  it("dos POST concurrentes con el mismo rowId → una sola creación, misma tarea", async () => {
    let resolver!: (v: unknown) => void;
    appendTarea.mockImplementation(() => new Promise((r) => { resolver = r; }));
    const p1 = post(body({ rowId: "R3" }));
    await new Promise((r) => setTimeout(r, 0));
    const p2 = post(body({ rowId: "R3" }));
    await new Promise((r) => setTimeout(r, 0));
    resolver({ rowId: "R3", objetivo: "creada" });
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(appendTarea).toHaveBeenCalledTimes(1);
    expect([r1.status, r2.status].sort()).toEqual([200, 201]);
    expect((await r1.json()).objetivo).toBe("creada");
    expect((await r2.json()).objetivo).toBe("creada");
  });

  it("edificio inválido con rowId → 400 y el lock queda libre", async () => {
    const res = await post(body({ rowId: "R4", edificio: "No existe" }));
    expect(res.status).toBe(400);
    expect(appendTarea).not.toHaveBeenCalled();
    const res2 = await post(body({ rowId: "R4" }));
    expect(res2.status).toBe(201);
  });
});
```

- [ ] **Step 2: Implementar la ruta.** Reemplazar el handler `POST` completo:

```ts
// Un mismo rowId puede llegar dos veces (sync in-page y Background Sync del SW sobre la
// misma cola, doble tap, reintento tras timeout). La primera crea; las demás reciben la
// misma tarea. El lock cubre la ventana entre "no existe" y "ya escribí".
const creandoPorRowId = new Map<string, Promise<Tarea>>();

export const POST = withAuth(async (req, session) => {
  const parsed = tareaNuevaSchema.parse(await req.json());
  const rowId = parsed.rowId?.trim();

  if (rowId) {
    const existente = await getTareaByRowId(rowId);
    if (existente) return NextResponse.json(existente, { status: 200 });
    const enCurso = creandoPorRowId.get(rowId);
    if (enCurso) return NextResponse.json(await enCurso, { status: 200 });
  }

  const crear = async (): Promise<Tarea> => {
    const consorcios = await getConsorciosActivos();
    if (!consorcios.some((c) => c.nombre === parsed.edificio)) {
      throw jsonError(400, `Edificio "${parsed.edificio}" no es válido o no está activo`);
    }
    return appendTarea(
      {
        ...parsed,
        // fechaEstimada es opcional: se guarda "" si no se cargó.
        fechaEstimada: parsed.fechaEstimada ?? "",
        // dpto es obligatorio (validado por tareaNuevaSchema): parte común específica
        // si parteComun=true, o el dpto elegido si es false.
        dpto: parsed.dpto?.trim() ?? "",
        // CUIT estable resuelto por nombre contra _Consorcios (ya cargados arriba).
        edificioCuit: resolveCuit(parsed.edificio, consorcios) ?? undefined,
      },
      session.user.email
    );
  };

  if (!rowId) return NextResponse.json(await crear(), { status: 201 });

  const p = crear().finally(() => creandoPorRowId.delete(rowId));
  creandoPorRowId.set(rowId, p);
  return NextResponse.json(await p, { status: 201 });
});
```

Imports: sumar `getTareaByRowId` al import de `@/lib/google-sheets` y `import type { Tarea } from "@/types";` (ya importa `EstadoTarea, Prioridad` de ahí: sumar `Tarea`).

- [ ] **Step 3:** en `tests/api/tareas-edificio-validation.test.ts`, la factory de `@/lib/google-sheets` suma `getTareaByRowId: vi.fn().mockResolvedValue(null),`.

- [ ] **Step 4: Correr** `npx vitest run tests/api` → PASS. **Checkpoint.**

---

### Task 3: `ApiClientError` + `sync-clasificacion`

**Files:** Modify `lib/api-client.ts`, `lib/api-client.test.ts`; Create `lib/sync-clasificacion.ts`, `lib/sync-clasificacion.test.ts`.

- [ ] **Step 1: Tests**

En `lib/api-client.test.ts`, importar `ApiClientError` y agregar en `describe("request (vía api.*)")`:

```ts
  it("un 4xx lanza ApiClientError con status y el mismo mensaje", async () => {
    fetchMock.mockResolvedValue(respuesta(409, { error: "El archivo está en uso" }));
    const err = await api.tareas.list().catch((e) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(409);
    expect(err.message).toBe("El archivo está en uso");
  });
```

`lib/sync-clasificacion.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { clasificarStatus, clasificarFalloSync } from "./sync-clasificacion";
import { ApiClientError } from "./api-client";

describe("clasificarStatus", () => {
  it.each([undefined, 0, 500, 502, 503, 429, 401])("%s → red", (s) => {
    expect(clasificarStatus(s as number | undefined)).toBe("red");
  });
  it.each([400, 403, 404, 409, 413, 422])("%s → rechazo", (s) => {
    expect(clasificarStatus(s)).toBe("rechazo");
  });
});

describe("clasificarFalloSync", () => {
  it("ApiClientError 400 → rechazo", () => {
    expect(clasificarFalloSync(new ApiClientError("x", 400))).toBe("rechazo");
  });
  it("ApiClientError 503 → red", () => {
    expect(clasificarFalloSync(new ApiClientError("x", 503))).toBe("red");
  });
  it("Error de red sin status → red", () => {
    expect(clasificarFalloSync(new Error("Failed to fetch"))).toBe("red");
  });
});
```

- [ ] **Step 2: Implementar.** En `lib/api-client.ts`, después de `redirigirALogin`:

```ts
// Error de la API con el status HTTP a mano. `message` es el mismo texto que antes, así que
// todo `err.message` existente sigue igual; el status lo usa el sync offline para decidir si
// reintenta (red/5xx/429) o marca la tarea como rechazada (4xx).
export class ApiClientError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
  }
}
```

y reemplazar los dos `throw new Error(await mensajeDeError(res));` por
`throw new ApiClientError(await mensajeDeError(res), res.status);`.

`lib/sync-clasificacion.ts`:

```ts
// Decide si un fallo al subir una tarea de la cola es transitorio (se reintenta solo) o un
// rechazo del server (queda marcado hasta que el usuario reintente o descarte).
// Módulo puro: lo importan offline-sync.ts (browser) y app/sw.ts (Service Worker).
export type FalloSync = "red" | "rechazo";

// 401: es la sesión, no la tarea. 429: cuota, transitorio. 5xx y sin status: red.
export function clasificarStatus(status: number | undefined): FalloSync {
  if (status === undefined) return "red";
  if (status === 401 || status === 429) return "red";
  if (status >= 400 && status < 500) return "rechazo";
  return "red";
}

export function clasificarFalloSync(err: unknown): FalloSync {
  const status = (err as { status?: unknown } | null)?.status;
  return clasificarStatus(typeof status === "number" ? status : undefined);
}
```

- [ ] **Step 3: Correr** `npx vitest run lib/api-client.test.ts lib/sync-clasificacion.test.ts` → PASS. **Checkpoint.**

---

### Task 4: Cola — `errorMsg`, helpers de Dexie, `offline-sync` sin tope

**Files:** Modify `types/index.ts`, `lib/offline-db.ts`, `lib/offline-db.test.ts`, `lib/offline-sync.ts`; Create `lib/offline-sync.test.ts`.

- [ ] **Step 1: Tipo.** En `types/index.ts`, `TareaPendiente`:

```ts
export interface TareaPendiente extends TareaNuevaInput {
  localId: string;
  pendingSync: boolean;
  createdAt: string; // ISO datetime
  retries: number; // informativo: intentos de red fallidos. Sin tope.
  sheetRowId?: string; // se setea al sincronizar
  errorMsg?: string; // rechazo del server: queda fuera del sync automático hasta Reintentar
}
```

- [ ] **Step 2: Tests de offline-db** — en `lib/offline-db.test.ts`, el `FakeDexie` gana `tareasPendientes` y se suman casos:

```ts
const { put, get, pendPut, pendGet, pendUpdate, pendDelete, pendFilter } = vi.hoisted(() => ({
  put: vi.fn(), get: vi.fn(),
  pendPut: vi.fn(), pendGet: vi.fn(), pendUpdate: vi.fn(), pendDelete: vi.fn(), pendFilter: vi.fn(),
}));
vi.mock("dexie", () => {
  class FakeDexie {
    cacheTareas = { put, get };
    tareasPendientes = { put: pendPut, get: pendGet, update: pendUpdate, delete: pendDelete, filter: pendFilter };
    version() { return { stores: () => this }; }
  }
  return { default: FakeDexie, Table: class {} };
});

import { …, listPendientes, marcarRechazada, reintentarPendiente, descartarPendiente } from "./offline-db";
import type { TareaPendiente } from "@/types";

describe("cola de pendientes", () => {
  const pend = (over: Partial<TareaPendiente>): TareaPendiente =>
    ({ localId: "L1", pendingSync: true, createdAt: "", retries: 0, objetivo: "x", ...over }) as TareaPendiente;

  beforeEach(() => {
    pendUpdate.mockReset().mockResolvedValue(1);
    pendDelete.mockReset().mockResolvedValue(undefined);
    pendFilter.mockReset();
  });

  it("listPendientes excluye las rechazadas (errorMsg) y las ya subidas", async () => {
    const filas = [pend({ localId: "a" }), pend({ localId: "b", errorMsg: "no" }), pend({ localId: "c", pendingSync: false })];
    pendFilter.mockImplementation((fn: (t: TareaPendiente) => boolean) => ({ toArray: async () => filas.filter(fn) }));
    expect((await listPendientes()).map((t) => t.localId)).toEqual(["a"]);
  });

  it("marcarRechazada guarda el mensaje", async () => {
    await marcarRechazada("L1", "Edificio inválido");
    expect(pendUpdate).toHaveBeenCalledWith("L1", { errorMsg: "Edificio inválido" });
  });

  it("reintentarPendiente borra el mensaje", async () => {
    await reintentarPendiente("L1");
    expect(pendUpdate).toHaveBeenCalledWith("L1", { errorMsg: undefined });
  });

  it("descartarPendiente elimina la fila", async () => {
    await descartarPendiente("L1");
    expect(pendDelete).toHaveBeenCalledWith("L1");
  });
});
```

- [ ] **Step 3: Implementar en `lib/offline-db.ts`:**

```ts
// Solo las auto-sincronizables: las rechazadas por el server (errorMsg) esperan a que el
// usuario las reintente o descarte. La UI (usePendingTareas) muestra todas las pendingSync.
export async function listPendientes(): Promise<TareaPendiente[]> {
  const db = getDb();
  return db.tareasPendientes.filter((t) => t.pendingSync === true && !t.errorMsg).toArray();
}

export async function marcarRechazada(localId: string, errorMsg: string) {
  const db = getDb();
  await db.tareasPendientes.update(localId, { errorMsg });
}

export async function reintentarPendiente(localId: string) {
  const db = getDb();
  await db.tareasPendientes.update(localId, { errorMsg: undefined });
}

export async function descartarPendiente(localId: string) {
  const db = getDb();
  await db.tareasPendientes.delete(localId);
}
```

- [ ] **Step 4: Test de `offline-sync`** — `lib/offline-sync.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const { create, listPendientes, markSynced, incrementRetries, marcarRechazada } = vi.hoisted(() => ({
  create: vi.fn(), listPendientes: vi.fn(), markSynced: vi.fn(), incrementRetries: vi.fn(), marcarRechazada: vi.fn(),
}));
vi.mock("./api-client", async (orig) => {
  const real = await orig<typeof import("./api-client")>();
  return { ...real, api: { tareas: { create } } };
});
vi.mock("./offline-db", () => ({ getDb: vi.fn(), listPendientes, markSynced, incrementRetries, marcarRechazada }));

import { syncPendingTareas } from "./offline-sync";
import { ApiClientError } from "./api-client";
import type { TareaPendiente } from "@/types";

const pend = (over: Partial<TareaPendiente> = {}): TareaPendiente =>
  ({
    localId: "L1", rowId: "R1", pendingSync: true, createdAt: "", retries: 0,
    objetivo: "x", fechaInicio: "2026-09-19", fechaEstimada: "", edificio: "E", parteComun: false,
    dpto: "1A", informe: "", prioridad: "Media", imagenes: [], videos: [], documentos: [], ...over,
  }) as TareaPendiente;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("navigator", { onLine: true });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("syncPendingTareas", () => {
  it("manda el rowId y marca synced con el rowId devuelto", async () => {
    listPendientes.mockResolvedValue([pend()]);
    create.mockResolvedValue({ rowId: "R1" });
    const r = await syncPendingTareas();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ rowId: "R1", objetivo: "x" }));
    expect(markSynced).toHaveBeenCalledWith("L1", "R1");
    expect(r).toEqual({ ok: 1, failed: 0, rechazadas: 0 });
  });

  it("rechazo (4xx) → marcarRechazada con el mensaje, sin incrementRetries", async () => {
    listPendientes.mockResolvedValue([pend()]);
    create.mockRejectedValue(new ApiClientError('Edificio "E" no es válido', 400));
    const r = await syncPendingTareas();
    expect(marcarRechazada).toHaveBeenCalledWith("L1", 'Edificio "E" no es válido');
    expect(incrementRetries).not.toHaveBeenCalled();
    expect(r.rechazadas).toBe(1);
  });

  it("fallo de red → incrementRetries, sin marcar", async () => {
    listPendientes.mockResolvedValue([pend()]);
    create.mockRejectedValue(new Error("Failed to fetch"));
    const r = await syncPendingTareas();
    expect(incrementRetries).toHaveBeenCalledWith("L1");
    expect(marcarRechazada).not.toHaveBeenCalled();
    expect(r.failed).toBe(1);
  });

  it("429 cuenta como red", async () => {
    listPendientes.mockResolvedValue([pend()]);
    create.mockRejectedValue(new ApiClientError("cuota", 429));
    await syncPendingTareas();
    expect(incrementRetries).toHaveBeenCalled();
    expect(marcarRechazada).not.toHaveBeenCalled();
  });

  it("una pendiente con muchos retries se intenta igual (sin tope)", async () => {
    listPendientes.mockResolvedValue([pend({ retries: 50 })]);
    create.mockResolvedValue({ rowId: "R1" });
    const r = await syncPendingTareas();
    expect(create).toHaveBeenCalledTimes(1);
    expect(r.ok).toBe(1);
  });

  it("sin red no hace nada", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    listPendientes.mockResolvedValue([pend()]);
    const r = await syncPendingTareas();
    expect(create).not.toHaveBeenCalled();
    expect(r).toEqual({ ok: 0, failed: 0, rechazadas: 0 });
  });
});
```

- [ ] **Step 5: Implementar `lib/offline-sync.ts`** (reemplazar el archivo hasta `cleanupSyncedTareas`, que no cambia):

```ts
// Procesa la cola de tareas pendientes contra /api/tareas.
// Estrategia: loop secuencial. Fallo de red → se reintenta en el próximo disparo, sin tope.
// Rechazo del server (4xx) → queda marcada (errorMsg) hasta que el usuario reintente o descarte.
// Corre en el cliente; el Service Worker (app/sw.ts) tiene su propia versión con la misma regla.

import { api } from "./api-client";
import { incrementRetries, listPendientes, markSynced, marcarRechazada, getDb } from "./offline-db";
import { clasificarFalloSync } from "./sync-clasificacion";
import type { TareaPendiente } from "@/types";

export interface SyncResult {
  ok: number;
  failed: number; // red: se reintentan solas
  rechazadas: number; // 4xx: esperan al usuario
}

let syncing = false;

export async function syncPendingTareas(): Promise<SyncResult> {
  const vacio: SyncResult = { ok: 0, failed: 0, rechazadas: 0 };
  if (typeof window === "undefined") return vacio;
  if (!navigator.onLine) return vacio;
  if (syncing) return vacio;

  syncing = true;
  const result: SyncResult = { ok: 0, failed: 0, rechazadas: 0 };

  try {
    const pendientes = await listPendientes();
    for (const p of pendientes) {
      try {
        // rowId: el server es idempotente por id (un reintento o el SW en paralelo no duplican).
        const created = await api.tareas.create({
          rowId: p.rowId,
          objetivo: p.objetivo,
          fechaInicio: p.fechaInicio,
          fechaEstimada: p.fechaEstimada,
          edificio: p.edificio,
          parteComun: p.parteComun,
          dpto: p.dpto,
          informe: p.informe,
          imagenes: p.imagenes ?? [],
          videos: p.videos ?? [],
          documentos: p.documentos ?? [],
          proveedor: p.proveedor,
          estado: p.estado,
          presupuesto: p.presupuesto,
          prioridad: p.prioridad,
        });
        await markSynced(p.localId, created.rowId);
        result.ok++;
      } catch (err) {
        if (clasificarFalloSync(err) === "rechazo") {
          console.warn("[offline-sync] rechazada por el server", p.localId, err);
          await marcarRechazada(p.localId, err instanceof Error ? err.message : "Rechazada por el servidor");
          result.rechazadas++;
        } else {
          console.warn("[offline-sync] no se pudo subir (red)", p.localId, err);
          await incrementRetries(p.localId);
          result.failed++;
        }
      }
    }
  } finally {
    syncing = false;
  }

  return result;
}
```

(`getDb` y `TareaPendiente` los sigue usando `cleanupSyncedTareas`.) En `vitest.setup.ts` no hace falta nada: `window` existe en jsdom.

- [ ] **Step 6: Correr** `npx vitest run lib/offline-db.test.ts lib/offline-sync.test.ts && npx tsc --noEmit` → PASS. **Checkpoint.**

---

### Task 5: `app/sw.ts`

**Files:** Modify `app/sw.ts` (bloque `syncPendingFromSW` + `PendienteRow` + helpers).

- [ ] **Step 1:** Import arriba del archivo (junto a los de serwist): `import { clasificarStatus } from "@/lib/sync-clasificacion";`

- [ ] **Step 2:** Reemplazar `syncPendingFromSW`, `PendienteRow` y `openDb` por:

```ts
// Implementación de sync dentro del SW. No puede importar offline-sync.ts (asume `window`
// y Dexie); replica la lógica con IndexedDB nativo y la misma regla red/rechazo
// (lib/sync-clasificacion). Ninguna transacción abarca un `await fetch`: IndexedDB cierra
// la transacción apenas no quedan requests pendientes, y un put posterior tira
// TransactionInactiveError.
async function syncPendingFromSW(): Promise<void> {
  const db = await openDb("task-drive-manager");
  // Si el SW despertó antes de que la app creara la base, no hay store ni cola.
  if (!db.objectStoreNames.contains("tareasPendientes")) {
    db.close();
    return;
  }

  const todas = await leerPendientes(db);
  const pendientes = todas.filter((r) => r.pendingSync === true && !r.errorMsg);

  for (const p of pendientes) {
    let cambio: Partial<PendienteRow>;
    try {
      const res = await fetch("/api/tareas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rowId: p.rowId,
          objetivo: p.objetivo,
          fechaInicio: p.fechaInicio,
          fechaEstimada: p.fechaEstimada,
          edificio: p.edificio,
          parteComun: p.parteComun,
          dpto: p.dpto,
          informe: p.informe,
          imagenes: p.imagenes ?? [],
          videos: p.videos ?? [],
          documentos: p.documentos ?? [],
          proveedor: p.proveedor,
          estado: p.estado,
          presupuesto: p.presupuesto,
          prioridad: p.prioridad,
        }),
      });
      if (res.ok) {
        const created = (await res.json()) as { rowId: string };
        cambio = { pendingSync: false, sheetRowId: created.rowId };
      } else if (clasificarStatus(res.status) === "rechazo") {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        cambio = { errorMsg: body?.error ?? `Rechazada por el servidor (${res.status})` };
      } else {
        cambio = { retries: (p.retries ?? 0) + 1 };
      }
    } catch {
      cambio = { retries: (p.retries ?? 0) + 1 };
    }
    await guardarPendiente(db, { ...p, ...cambio });
  }

  db.close();

  // Notificar a las pestañas abiertas para que invaliden TanStack Query.
  const clientsList = await self.clients.matchAll({ type: "window" });
  for (const c of clientsList) c.postMessage({ type: "TAREAS_SYNCED" });
}

interface PendienteRow {
  localId: string;
  rowId?: string;
  pendingSync: boolean;
  retries?: number;
  sheetRowId?: string;
  errorMsg?: string;
  objetivo: string;
  fechaInicio: string;
  fechaEstimada: string;
  edificio: string;
  parteComun: boolean;
  dpto: string;
  informe: string;
  imagenes?: string[];
  videos?: string[];
  documentos?: string[];
  proveedor?: string;
  estado: string;
  presupuesto?: number;
  prioridad: string;
}

// Helpers IndexedDB nativos. Sin versión: abre la vigente (la que creó Dexie desde la app).
function openDb(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function leerPendientes(db: IDBDatabase): Promise<PendienteRow[]> {
  const tx = db.transaction("tareasPendientes", "readonly");
  const rows = await reqToPromise<unknown[]>(tx.objectStore("tareasPendientes").getAll());
  await txDone(tx);
  return rows as PendienteRow[];
}

async function guardarPendiente(db: IDBDatabase, row: PendienteRow): Promise<void> {
  const tx = db.transaction("tareasPendientes", "readwrite");
  await reqToPromise(tx.objectStore("tareasPendientes").put(row));
  await txDone(tx);
}
```

`reqToPromise` y `txDone` quedan como están.

- [ ] **Step 3:** `npx tsc --noEmit` → sin errores (el SW se tipa con el mismo `tsconfig`). El build (Task 8) confirma que serwist resuelve `@/lib/sync-clasificacion`: `grep -c "rechazo" public/sw.js` debe dar ≥ 1. Si el alias no resuelve, cambiar el import a `../lib/sync-clasificacion`. **Checkpoint.**

---

### Task 6: `PendientesDeSubir` + montaje en `/tareas`

**Files:** Create `components/tareas/PendientesDeSubir.tsx`, `components/tareas/PendientesDeSubir.test.tsx`; Modify `app/(app)/tareas/page.tsx`, `app/(app)/tareas/page.test.tsx`.

- [ ] **Step 1: Test del componente**

```tsx
// components/tareas/PendientesDeSubir.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TareaPendiente } from "@/types";

const { usePendingTareas, useOnlineStatus, syncPendingTareas, reintentarPendiente, descartarPendiente } = vi.hoisted(() => ({
  usePendingTareas: vi.fn(), useOnlineStatus: vi.fn(),
  syncPendingTareas: vi.fn(), reintentarPendiente: vi.fn(), descartarPendiente: vi.fn(),
}));
vi.mock("@/hooks/usePendingTareas", () => ({ usePendingTareas }));
vi.mock("@/hooks/useOnlineStatus", () => ({ useOnlineStatus }));
vi.mock("@/lib/offline-sync", () => ({ syncPendingTareas }));
vi.mock("@/lib/offline-db", () => ({ reintentarPendiente, descartarPendiente }));

import { PendientesDeSubir } from "./PendientesDeSubir";

const pend = (over: Partial<TareaPendiente> = {}): TareaPendiente =>
  ({
    localId: "L1", rowId: "R1", pendingSync: true, createdAt: "2026-09-19T10:00:00.000-03:00", retries: 0,
    objetivo: "Pintar pasillo", fechaInicio: "2026-09-19", fechaEstimada: "", edificio: "Garay 350",
    parteComun: false, dpto: "3B", informe: "", prioridad: "Media", imagenes: [], videos: [], documentos: [], ...over,
  }) as TareaPendiente;

beforeEach(() => {
  vi.clearAllMocks();
  useOnlineStatus.mockReturnValue(true);
  syncPendingTareas.mockResolvedValue({ ok: 1, failed: 0, rechazadas: 0 });
  reintentarPendiente.mockResolvedValue(undefined);
  descartarPendiente.mockResolvedValue(undefined);
});

describe("PendientesDeSubir", () => {
  it("sin pendientes no renderiza nada", () => {
    usePendingTareas.mockReturnValue([]);
    const { container } = render(<PendientesDeSubir />);
    expect(container).toBeEmptyDOMElement();
  });

  it("pendiente sin error: badge ámbar, sin botones", () => {
    usePendingTareas.mockReturnValue([pend()]);
    render(<PendientesDeSubir />);
    expect(screen.getByText("Pendientes de subir (1)")).toBeInTheDocument();
    expect(screen.getByText("Pintar pasillo")).toBeInTheDocument();
    expect(screen.getByText(/Garay 350 · 3B/)).toBeInTheDocument();
    expect(screen.getByText("Pendiente de subir")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reintentar/i })).not.toBeInTheDocument();
  });

  it("rechazada: badge rojo, mensaje y botones", () => {
    usePendingTareas.mockReturnValue([pend({ errorMsg: 'Edificio "Garay 350" no es válido' })]);
    render(<PendientesDeSubir />);
    expect(screen.getByText("No se pudo subir")).toBeInTheDocument();
    expect(screen.getByText('Edificio "Garay 350" no es válido')).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reintentar/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /descartar/i })).toBeInTheDocument();
  });

  it("Reintentar limpia el error, dispara el sync y avisa con tareas-synced", async () => {
    usePendingTareas.mockReturnValue([pend({ errorMsg: "no" })]);
    const user = userEvent.setup();
    const evento = vi.fn();
    window.addEventListener("tareas-synced", evento);
    render(<PendientesDeSubir />);
    await user.click(screen.getByRole("button", { name: /reintentar/i }));
    await waitFor(() => expect(syncPendingTareas).toHaveBeenCalled());
    expect(reintentarPendiente).toHaveBeenCalledWith("L1");
    await waitFor(() => expect(evento).toHaveBeenCalled());
    window.removeEventListener("tareas-synced", evento);
  });

  it("Descartar pide confirmación y borra", async () => {
    usePendingTareas.mockReturnValue([pend({ errorMsg: "no" })]);
    const user = userEvent.setup();
    render(<PendientesDeSubir />);
    await user.click(screen.getByRole("button", { name: /^descartar$/i }));
    expect(screen.getByText(/descartar tarea pendiente/i)).toBeInTheDocument();
    expect(descartarPendiente).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /^descartar$/i, hidden: false }).closest("[role=dialog]") ? screen.getAllByRole("button", { name: /^descartar$/i }).at(-1)! : screen.getAllByRole("button", { name: /^descartar$/i }).at(-1)!);
    await waitFor(() => expect(descartarPendiente).toHaveBeenCalledWith("L1"));
  });

  it("sin red, Reintentar queda deshabilitado", () => {
    useOnlineStatus.mockReturnValue(false);
    usePendingTareas.mockReturnValue([pend({ errorMsg: "no" })]);
    render(<PendientesDeSubir />);
    expect(screen.getByRole("button", { name: /reintentar/i })).toBeDisabled();
  });
});
```

(En el caso de Descartar, el segundo click va al botón de confirmación del `ConfirmDialog`, que tiene el mismo texto «Descartar»: se toma el último de `getAllByRole`. Simplificar a esa forma directa al implementar.)

- [ ] **Step 2: Implementar `components/tareas/PendientesDeSubir.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Loader2, CloudOff, RefreshCw, Trash2 } from "lucide-react";
import { usePendingTareas } from "@/hooks/usePendingTareas";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { syncPendingTareas } from "@/lib/offline-sync";
import { descartarPendiente, reintentarPendiente } from "@/lib/offline-db";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { formatDateTime } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { TareaPendiente } from "@/types";

// Tareas creadas sin conexión que todavía no llegaron a la Sheet. Va arriba de la lista de
// /tareas, fuera de los filtros: es "lo que acabo de cargar". Una rechazada por el server
// (errorMsg) muestra el motivo y espera al usuario: Reintentar o Descartar.
export function PendientesDeSubir() {
  const pendientes = usePendingTareas() ?? [];
  const online = useOnlineStatus();
  const [reintentando, setReintentando] = useState<string | null>(null);
  const [aDescartar, setADescartar] = useState<TareaPendiente | null>(null);
  const [descartando, setDescartando] = useState(false);

  if (pendientes.length === 0) return null;

  const reintentar = async (localId: string) => {
    setReintentando(localId);
    try {
      await reintentarPendiente(localId);
      const r = await syncPendingTareas();
      // OfflineSyncProvider escucha este evento e invalida ["tareas"]; así no dependemos
      // de un QueryClient acá.
      if (r.ok > 0) window.dispatchEvent(new CustomEvent("tareas-synced"));
    } finally {
      setReintentando(null);
    }
  };

  const descartar = async () => {
    if (!aDescartar) return;
    setDescartando(true);
    try {
      await descartarPendiente(aDescartar.localId);
      setADescartar(null);
    } finally {
      setDescartando(false);
    }
  };

  return (
    <section className="mt-4" aria-label="Pendientes de subir">
      <h3 className="flex items-center gap-2 text-sm font-medium text-slate-700">
        <CloudOff size={16} className="text-amber-600" />
        Pendientes de subir ({pendientes.length})
      </h3>
      <ul className="mt-2 space-y-2">
        {pendientes.map((p) => {
          const rechazada = !!p.errorMsg;
          return (
            <li
              key={p.localId}
              className={cn(
                "rounded-xl border bg-white p-4",
                rechazada ? "border-red-200" : "border-amber-200"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h4 className="truncate font-medium text-slate-900">{p.objetivo || "(sin objetivo)"}</h4>
                  <p className="mt-0.5 truncate text-sm text-slate-600">
                    {p.edificio} · {p.dpto || "Sin especificar"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Creada {formatDateTime(p.createdAt)}</p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full border px-2 py-0.5 text-xs",
                    rechazada
                      ? "border-red-200 bg-red-100 text-red-800"
                      : "border-amber-200 bg-amber-100 text-amber-800"
                  )}
                >
                  {rechazada ? "No se pudo subir" : "Pendiente de subir"}
                </span>
              </div>
              {rechazada && (
                <div className="mt-3 space-y-2">
                  <p className="text-sm text-red-700">{p.errorMsg}</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={!online || reintentando === p.localId}
                      onClick={() => reintentar(p.localId)}
                      className="flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50 disabled:hover:bg-slate-900"
                    >
                      {reintentando === p.localId ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <RefreshCw size={14} />
                      )}
                      Reintentar
                    </button>
                    <button
                      type="button"
                      onClick={() => setADescartar(p)}
                      className="flex items-center gap-1 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                    >
                      <Trash2 size={14} /> Descartar
                    </button>
                  </div>
                  {!online && <p className="text-xs text-slate-500">Sin conexión: se puede reintentar al volver la red.</p>}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        open={!!aDescartar}
        title="Descartar tarea pendiente"
        message={`Se va a borrar "${aDescartar?.objetivo || "esta tarea"}" de este teléfono. No está guardada en ningún otro lado. ¿Confirmás?`}
        confirmLabel="Descartar"
        variant="danger"
        loading={descartando}
        onConfirm={descartar}
        onCancel={() => setADescartar(null)}
      />
    </section>
  );
}
```

Ajustar el import doble de `@/lib/utils` a uno solo (`import { cn, formatDateTime } from "@/lib/utils";`). Verificar en `components/ui/ConfirmDialog.tsx` el nombre exacto de las props (`confirmLabel`, `variant`, `loading`, `onConfirm`, `onCancel`, `title`, `message`, `open`) — son las que usa `AccionesTarea`.

- [ ] **Step 3: Montar en la página.** En `app/(app)/tareas/page.tsx`: `import { PendientesDeSubir } from "@/components/tareas/PendientesDeSubir";` y renderizar `<PendientesDeSubir />` justo después del `div` de chips (`Mis tareas asignadas` / `Sin asignar`) y antes del bloque `{showFilters && (…)}`.

- [ ] **Step 4: Test de la página.** En `app/(app)/tareas/page.test.tsx`:
  - mock: `const { usePendingTareas } = vi.hoisted(() => ({ usePendingTareas: vi.fn() })); vi.mock("@/hooks/usePendingTareas", () => ({ usePendingTareas }));` y en `beforeEach`: `usePendingTareas.mockReturnValue([]);`.
  - mocks para lo que importa `PendientesDeSubir`: `vi.mock("@/hooks/useOnlineStatus", () => ({ useOnlineStatus: () => true }));`, `vi.mock("@/lib/offline-sync", () => ({ syncPendingTareas: vi.fn() }));`, y sumar `reintentarPendiente: vi.fn(), descartarPendiente: vi.fn()` al mock de `@/lib/offline-db`.
  - caso nuevo:
    ```tsx
      it("la sección de pendientes va arriba y no la afectan los filtros", async () => {
        usePendingTareas.mockReturnValue([{
          localId: "L1", pendingSync: true, createdAt: "2026-09-19T10:00:00.000-03:00", retries: 0,
          objetivo: "Cargada sin señal", fechaInicio: "2026-09-19", fechaEstimada: "", edificio: "E2",
          parteComun: false, dpto: "1A", informe: "", prioridad: "Media",
        }]);
        const user = userEvent.setup();
        renderPage();
        await screen.findByText("3 resultados");
        expect(screen.getByText("Cargada sin señal")).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: /filtros/i }));
        await user.selectOptions(screen.getByLabelText("Estado"), "En Proceso");
        await screen.findByText("1 resultado");
        expect(screen.getByText("Cargada sin señal")).toBeInTheDocument();
      });
    ```

- [ ] **Step 5: Correr** `npx vitest run components/tareas/PendientesDeSubir.test.tsx "app/(app)/tareas"` → PASS. **Checkpoint.**

---

### Task 7: «Sincronizar ahora» en `OfflineIndicator`

**Files:** Modify `components/layout/OfflineIndicator.tsx`, `components/layout/OfflineIndicator.test.tsx`.

- [ ] **Step 1: Tests** — en el test, sumar `vi.mock("@/lib/offline-sync", () => ({ syncPendingTareas: vi.fn() }));`, importar `syncPendingTareas`, y:

```ts
  it("con pendientes y online, el modal ofrece Sincronizar ahora", async () => {
    mockOnline(true);
    mockPending(2);
    vi.mocked(syncPendingTareas).mockResolvedValue({ ok: 2, failed: 0, rechazadas: 0 });
    render(<OfflineIndicator />);
    fireEvent.click(screen.getByRole("button", { name: /pendiente/i }));
    const btn = screen.getByRole("button", { name: /sincronizar ahora/i });
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    await waitFor(() => expect(syncPendingTareas).toHaveBeenCalled());
  });

  it("sin red, Sincronizar ahora está deshabilitado", () => {
    mockOnline(false);
    mockPending(2);
    render(<OfflineIndicator />);
    expect(screen.getByRole("button", { name: /sincronizar ahora/i })).toBeDisabled();
  });

  it("sin pendientes, el modal no ofrece sincronizar", () => {
    mockOnline(true);
    mockPending(0);
    render(<OfflineIndicator />);
    fireEvent.click(screen.getByRole("button", { name: /al día/i }));
    expect(screen.queryByRole("button", { name: /sincronizar ahora/i })).not.toBeInTheDocument();
  });
```

(`waitFor` se importa de `@testing-library/react`. En el caso offline el modal ya se abre solo.)

- [ ] **Step 2: Implementar.** En `OfflineIndicator.tsx`: imports `import { Loader2, RefreshCw } from "lucide-react";` y `import { syncPendingTareas } from "@/lib/offline-sync";`; estado `const [sincronizando, setSincronizando] = useState(false);`; handler:

```ts
  const sincronizarAhora = async () => {
    setSincronizando(true);
    try {
      const r = await syncPendingTareas();
      if (r.ok > 0) window.dispatchEvent(new CustomEvent("tareas-synced"));
    } finally {
      setSincronizando(false);
    }
  };
```

y en el modal, entre la `<ul>` y el botón «Entendido»:

```tsx
            {pending > 0 && (
              <div className="mt-4">
                <button
                  type="button"
                  disabled={!online || sincronizando}
                  onClick={sincronizarAhora}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50"
                >
                  {sincronizando ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  Sincronizar ahora ({pending})
                </button>
                {!online && <p className="mt-1 text-center text-xs text-slate-500">Sin conexión</p>}
              </div>
            )}
```

- [ ] **Step 3: Correr** `npx vitest run components/layout` → PASS. **Checkpoint.**

---

### Task 8: Verificación final

- [ ] `npm test` → PASS (631 + ~30).
- [ ] `npx tsc --noEmit` → sin salida.
- [ ] `npm run lint` → 0 errores.
- [ ] `npm run build` → OK, y `grep -c "rechazo" public/sw.js` ≥ 1 (la clasificación quedó bundleada en el SW).
- [ ] Reporte: verde, listo para commitear. Criterios 1, 2, 4–8 cubiertos por tests; el 3 (Background Sync real) queda para verificación manual en Chrome (DevTools → Application → Service Workers → Sync `sync-tareas`).
