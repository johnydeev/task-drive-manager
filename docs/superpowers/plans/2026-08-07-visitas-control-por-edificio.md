# Visita / Control por edificio — Implementation Plan

> **Para agentes:** ejecutar con `superpowers:executing-plans` (inline, por bloques).
> Los pasos usan checkbox (`- [ ]`) para tracking.
>
> **Regla del repo: NO se ejecuta `git commit`.** Los commits los hace Jony con GitLens. Donde un
> plan normal diría "commit", acá va un **checkpoint**: dejar el árbol verde y avisar.

**Goal:** Formulario de visita de control por consorcio que genera un PDF, lo archiva en Drive y
deja en la planilla el historial de links por edificio.

**Architecture:** El formulario no se persiste: se vuelca al PDF. Al guardar, el server genera el
documento con `@react-pdf/renderer`, lo sube a `Tareas/{Edificio}/Visitas/` y recién entonces
escribe una fila en la hoja `Visitas` con el link — si el PDF falla, no se escribe nada. Aparte, una
hoja chica `EdificioFicha` guarda los 9 datos del consorcio para precargar el formulario y se
sobrescribe en cada visita. Las fotos se suben antes por `/api/upload` (que ya está fuera del
matcher del proxy) y el PDF las embebe por URL, igual que el reporte de tarea.

**Tech Stack:** Next 16 (App Router), React 19, TypeScript estricto, Zod, TanStack Query,
`@react-pdf/renderer`, googleapis (Sheets + Drive), Tailwind v4, Vitest + Testing Library.

**Spec:** [`../specs/2026-08-07-visitas-control-por-edificio-design.md`](../specs/2026-08-07-visitas-control-por-edificio-design.md)

---

## Estructura de archivos

**Se crean:**

| Archivo | Responsabilidad |
|---|---|
| `lib/visitas-items.ts` | Los 15 ítems de control con sus claves y etiquetas, en dos bloques |
| `lib/visitas-panel.ts` | Cálculo puro: última visita por edificio, días transcurridos, orden |
| `lib/sheets/visitas.ts` | Hoja `Visitas`: listar, agregar, buscar por id, borrar |
| `lib/sheets/edificio-ficha.ts` | Hoja `EdificioFicha`: leer una, guardar (upsert) |
| `components/pdf/VisitaPdf.tsx` | Documento PDF de la visita |
| `lib/visita-pdf.tsx` | Render a buffer + subida a Drive (aísla el IO del route) |
| `app/api/visitas/route.ts` | `GET` lista · `POST` crear (PDF + fila + ficha) |
| `app/api/visitas/[id]/route.ts` | `DELETE` admin-only (fila + PDF a papelera) |
| `app/api/edificio-ficha/route.ts` | `GET` de la ficha, para precargar el formulario |
| `components/visitas/FotosVisita.tsx` | Subida de fotos de la visita (no reusa `FileUploader`) |
| `app/(app)/visitas/nueva/page.tsx` | Página del formulario |
| `components/visitas/VisitaForm.tsx` | Formulario completo |
| `components/visitas/hooks/useVisitaForm.ts` | Estado, precarga de ficha y submit |
| `components/visitas/PanelVisitas.tsx` | Panel de consorcios + historial del elegido |
| `components/ui/FirmaCanvas.tsx` | Recuadro para dibujar la firma |

**Se modifican:**

| Archivo | Cambio |
|---|---|
| `types/index.ts` | `Visita`, `EdificioFicha`, `VisitaNuevaInput`, `Usuario.firmaUrl` |
| `lib/schemas.ts` | `visitaNuevaSchema`, `firmaSchema` |
| `lib/sheets/core.ts` | `SHEETS.visitas`, `SHEETS.edificioFicha` |
| `lib/google-sheets.ts` | Re-export de los módulos nuevos |
| `lib/google-drive.ts` | `ensureVisitasFolder`, `uploadVisitaFile`, `nombreArchivoVisita` |
| `app/api/upload/route.ts` | Acepta `destino=visita` |
| `lib/sheets/usuarios.ts` | `firma_url`, rango `A:F` → `A:G` |
| `app/api/usuarios/route.ts` | `PATCH` acepta `firmaUrl` (admin) |
| `lib/api-client.ts` | `api.visitas`, `api.usuarios.setFirma` |
| `components/usuarios/UsuariosManager.tsx` | Carga de firma (dibujar o subir) |
| `components/informes/InformeEdificio.tsx` | Pasa a ser el contenido de la pestaña Tareas |
| `app/(app)/informes/page.tsx` | Pestañas Tareas / Visitas |
| `components/layout/AppShell.tsx` | Label "Informes/Visitas" |
| `CHANGELOG.md` | Entrada en Unreleased |

---

## Task 1: Los 15 ítems de control

**Files:**
- Create: `lib/visitas-items.ts`
- Test: `lib/visitas-items.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/visitas-items.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { BLOQUES_VISITA, ITEMS_VISITA, esClaveItem } from "./visitas-items";

describe("ítems de la visita", () => {
  it("tiene 15 ítems repartidos en dos bloques", () => {
    expect(ITEMS_VISITA).toHaveLength(15);
    expect(BLOQUES_VISITA).toHaveLength(2);
    expect(BLOQUES_VISITA[0].items).toHaveLength(8);
    expect(BLOQUES_VISITA[1].items).toHaveLength(7);
  });

  it("respeta el orden del formulario en papel", () => {
    expect(BLOQUES_VISITA[0].items.map((i) => i.label)).toEqual([
      "Hall", "Vereda", "Palieres", "Sótano", "Terraza", "Ascensores", "Escaleras", "Cochera",
    ]);
    expect(BLOQUES_VISITA[1].items.map((i) => i.label)).toEqual([
      "Sala de Medidores", "Amenities", "Luz de Palieres", "Luces de Emergencia",
      "Matafuegos", "Termotanque", "Obleas",
    ]);
  });

  it("no repite claves", () => {
    const claves = ITEMS_VISITA.map((i) => i.clave);
    expect(new Set(claves).size).toBe(claves.length);
  });

  it("reconoce una clave válida y rechaza una inventada", () => {
    expect(esClaveItem("hall")).toBe(true);
    expect(esClaveItem("pileta")).toBe(false);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run lib/visitas-items.test.ts`
Expected: FAIL — `Failed to resolve import "./visitas-items"`.

- [ ] **Step 3: Implementar**

Crear `lib/visitas-items.ts`:

```ts
// Los 15 controles del formulario de visita, en los dos bloques del papel.
// Viven UNA sola vez: los comparten el formulario y el PDF, así no pueden divergir.
// La lista es fija (decisión 4 del spec): cambiarla es cambiar código.

export type EstadoItemVisita = "Realizada" | "No realizada";

export interface ItemVisita {
  clave: string; // se usa como name del input y como key del payload
  label: string; // lo que ve el usuario y sale en el PDF
}

export interface BloqueVisita {
  titulo: string;
  items: ItemVisita[];
}

export const BLOQUES_VISITA: BloqueVisita[] = [
  {
    titulo: "Sectores",
    items: [
      { clave: "hall", label: "Hall" },
      { clave: "vereda", label: "Vereda" },
      { clave: "palieres", label: "Palieres" },
      { clave: "sotano", label: "Sótano" },
      { clave: "terraza", label: "Terraza" },
      { clave: "ascensores", label: "Ascensores" },
      { clave: "escaleras", label: "Escaleras" },
      { clave: "cochera", label: "Cochera" },
    ],
  },
  {
    titulo: "Instalaciones",
    items: [
      { clave: "sala_medidores", label: "Sala de Medidores" },
      { clave: "amenities", label: "Amenities" },
      { clave: "luz_palieres", label: "Luz de Palieres" },
      { clave: "luces_emergencia", label: "Luces de Emergencia" },
      { clave: "matafuegos", label: "Matafuegos" },
      { clave: "termotanque", label: "Termotanque" },
      { clave: "obleas", label: "Obleas" },
    ],
  },
];

export const ITEMS_VISITA: ItemVisita[] = BLOQUES_VISITA.flatMap((b) => b.items);

const CLAVES = new Set(ITEMS_VISITA.map((i) => i.clave));

export function esClaveItem(clave: string): boolean {
  return CLAVES.has(clave);
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run lib/visitas-items.test.ts`
Expected: PASS — 4 tests.

---

## Task 2: Tipos y schemas

**Files:**
- Modify: `types/index.ts`
- Modify: `lib/schemas.ts`
- Test: `tests/lib/schemas.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Agregar al final de `tests/lib/schemas.test.ts`:

```ts
describe("visitaNuevaSchema", () => {
  const base = { edificio: "Castro Barros 1310" };

  it("acepta una visita con solo el edificio", () => {
    const r = visitaNuevaSchema.parse(base);
    expect(r.edificio).toBe("Castro Barros 1310");
    expect(r.controles).toEqual({});
    expect(r.fotos).toEqual([]);
  });

  it("rechaza sin edificio", () => {
    expect(() => visitaNuevaSchema.parse({})).toThrow();
  });

  it("acepta los controles con sus dos estados", () => {
    const r = visitaNuevaSchema.parse({
      ...base,
      controles: { hall: "Realizada", cochera: "No realizada" },
    });
    expect(r.controles.hall).toBe("Realizada");
    expect(r.controles.cochera).toBe("No realizada");
  });

  it("rechaza un estado que no existe", () => {
    expect(() => visitaNuevaSchema.parse({ ...base, controles: { hall: "Mas o menos" } })).toThrow();
  });

  it("rechaza una clave de control inventada", () => {
    expect(() => visitaNuevaSchema.parse({ ...base, controles: { pileta: "Realizada" } })).toThrow();
  });

  it("acepta cabecera, informe y fotos", () => {
    const r = visitaNuevaSchema.parse({
      ...base,
      ficha: { encargado: "Juan", seguroPoliza: "12345" },
      informeGeneral: "Todo en orden",
      fotos: ["https://drive.google.com/file/d/abc/view"],
    });
    expect(r.ficha.encargado).toBe("Juan");
    expect(r.informeGeneral).toBe("Todo en orden");
    expect(r.fotos).toHaveLength(1);
  });
});
```

Y sumar `visitaNuevaSchema` al import de `@/lib/schemas` que ya está arriba del archivo.

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run tests/lib/schemas.test.ts`
Expected: FAIL — `visitaNuevaSchema is not exported`.

- [ ] **Step 3: Agregar los tipos**

Al final de `types/index.ts`:

```ts
// =====================================================
// Visitas de control por edificio
// =====================================================

// Los 9 datos del consorcio que encabezan el formulario. Se guardan por edificio
// (hoja EdificioFicha) para precargar la próxima visita, y se sobrescriben en cada una.
export interface EdificioFicha {
  edificio: string;
  seguroPoliza: string;
  ascensores: string;
  fumigacion: string;
  empresaMatafuegoVenc: string;
  encargado: string;
  calderaTermotanque: string;
  empresaLimpieza: string;
  horarioTrabajo: string;
  encargadoLimpiezaHs: string;
  actualizadoEn?: string;
}

export const EDIFICIO_FICHA_VACIA: Omit<EdificioFicha, "edificio"> = {
  seguroPoliza: "",
  ascensores: "",
  fumigacion: "",
  empresaMatafuegoVenc: "",
  encargado: "",
  calderaTermotanque: "",
  empresaLimpieza: "",
  horarioTrabajo: "",
  encargadoLimpiezaHs: "",
};

// Fila de la hoja Visitas: es el índice del historial, no los datos del formulario
// (esos viven dentro del PDF).
export interface Visita {
  id: string;        // timestamp ISO
  edificio: string;
  fecha: string;     // ISO date, la pone el server
  pdfUrl: string;
  supervisor: string; // email
  creadoEn: string;
}

// Lo que manda el formulario. Nada de esto se guarda en columnas salvo el edificio.
export interface VisitaNuevaInput {
  edificio: string;
  ficha: Partial<Omit<EdificioFicha, "edificio" | "actualizadoEn">>;
  controles: Record<string, "Realizada" | "No realizada">;
  informeGeneral?: string;
  fotos: string[]; // URLs de Drive ya subidas
}
```

Y en la interfaz `Usuario`, agregar el campo:

```ts
  firmaUrl?: string; // URL de la firma en Drive, para estampar en el PDF de visita
```

- [ ] **Step 4: Agregar el schema**

Al final de `lib/schemas.ts`:

```ts
// Visita de control. El edificio es lo único obligatorio: el formulario se completa
// caminando el edificio y tiene que poder guardarse incompleto. La fecha NO viene del
// cliente (la pone el server con el día de emisión).
export const estadoItemVisitaEnum = z.enum(["Realizada", "No realizada"]);

export const visitaNuevaSchema = z.object({
  edificio: z.string().min(1, "Edificio requerido"),
  ficha: z
    .object({
      seguroPoliza: z.string().optional(),
      ascensores: z.string().optional(),
      fumigacion: z.string().optional(),
      empresaMatafuegoVenc: z.string().optional(),
      encargado: z.string().optional(),
      calderaTermotanque: z.string().optional(),
      empresaLimpieza: z.string().optional(),
      horarioTrabajo: z.string().optional(),
      encargadoLimpiezaHs: z.string().optional(),
    })
    .optional()
    .default({}),
  // Solo se aceptan las claves de lib/visitas-items.ts: una clave inventada es un bug
  // del cliente, no un dato a guardar.
  controles: z
    .record(z.string(), estadoItemVisitaEnum)
    .optional()
    .default({})
    .refine((c) => Object.keys(c).every(esClaveItem), {
      message: "Control desconocido",
    }),
  informeGeneral: z.string().optional(),
  fotos: z.array(z.string().url()).optional().default([]),
});

// Firma de un usuario (admin la carga en Usuarios): URL de Drive ya subida.
export const firmaSchema = z.object({
  email: z.string().email().transform((e) => e.toLowerCase()),
  firmaUrl: z.string().url().or(z.literal("")),
});
```

Y arriba del archivo, junto a los otros imports:

```ts
import { esClaveItem } from "./visitas-items";
```

- [ ] **Step 5: Correr y verificar que pasa**

Run: `npx vitest run tests/lib/schemas.test.ts && npx tsc --noEmit`
Expected: PASS y sin errores de tipos. Si `tsc` marca objetos `Usuario` incompletos en tests,
no hace falta tocarlos: `firmaUrl` es opcional.

---

## Task 3: Data-layer de EdificioFicha

**Files:**
- Modify: `lib/sheets/core.ts:5-17`
- Create: `lib/sheets/edificio-ficha.ts`
- Test: `lib/sheets/edificio-ficha.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/sheets/edificio-ficha.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const { valuesGet, valuesUpdate } = vi.hoisted(() => ({
  valuesGet: vi.fn(),
  valuesUpdate: vi.fn(),
}));

vi.mock("googleapis", () => ({
  google: {
    sheets: () => ({
      spreadsheets: { values: { get: valuesGet, update: valuesUpdate }, get: vi.fn(), batchUpdate: vi.fn() },
    }),
  },
}));
vi.mock("@/lib/google-auth", () => ({ getGoogleAuth: () => ({}), getSheetId: () => "sheet-id" }));
vi.mock("../google-auth", () => ({ getGoogleAuth: () => ({}), getSheetId: () => "sheet-id" }));
vi.mock("../demo-mode", () => ({ isDemoMode: () => false }));

import { getEdificioFicha, guardarEdificioFicha } from "./edificio-ficha";

const HEADERS = [
  "edificio", "seguro_poliza", "ascensores", "fumigacion", "empresa_matafuego_venc",
  "encargado", "caldera_termotanque", "empresa_limpieza", "horario_trabajo",
  "encargado_limpieza_hs", "actualizado_en",
];

function mockRows(rows: string[][]) {
  valuesGet.mockResolvedValue({ data: { values: rows } });
}

beforeEach(() => {
  vi.clearAllMocks();
  valuesUpdate.mockResolvedValue({});
});

describe("getEdificioFicha", () => {
  it("devuelve la ficha del edificio pedido", async () => {
    mockRows([
      HEADERS,
      ["Otro", "p1", "", "", "", "", "", "", "", "", ""],
      ["Castro Barros 1310", "POL-123", "AscenSA", "FumiSRL", "2027-01-01", "Juan", "Caldera X", "LimpioSA", "8 a 12", "Ana 6hs", "2026-08-01"],
    ]);
    const f = await getEdificioFicha("Castro Barros 1310");
    expect(f.seguroPoliza).toBe("POL-123");
    expect(f.encargado).toBe("Juan");
    expect(f.encargadoLimpiezaHs).toBe("Ana 6hs");
  });

  it("matchea el edificio de forma tolerante a mayúsculas y acentos", async () => {
    mockRows([HEADERS, ["Av. Belgrano 1429", "POL-9", "", "", "", "", "", "", "", "", ""]]);
    const f = await getEdificioFicha("AV. BELGRANO 1429");
    expect(f.seguroPoliza).toBe("POL-9");
  });

  it("devuelve una ficha vacía si el edificio no está cargado", async () => {
    mockRows([HEADERS]);
    const f = await getEdificioFicha("Nuevo 123");
    expect(f.edificio).toBe("Nuevo 123");
    expect(f.seguroPoliza).toBe("");
    expect(f.encargado).toBe("");
  });

  it("devuelve una ficha vacía si la hoja no existe todavía", async () => {
    valuesGet.mockRejectedValue(new Error("Unable to parse range"));
    const f = await getEdificioFicha("Nuevo 123");
    expect(f.seguroPoliza).toBe("");
  });
});

describe("guardarEdificioFicha", () => {
  it("agrega una fila nueva si el edificio no estaba", async () => {
    mockRows([HEADERS]);
    await guardarEdificioFicha("Nuevo 123", { encargado: "Pedro" });
    const call = valuesUpdate.mock.calls.at(-1)![0];
    expect(call.range).toBe("EdificioFicha!A2:K2");
    expect(call.requestBody.values[0][0]).toBe("Nuevo 123");
    expect(call.requestBody.values[0][5]).toBe("Pedro");
  });

  it("sobrescribe la fila existente del edificio", async () => {
    mockRows([
      HEADERS,
      ["Castro Barros 1310", "POL-123", "", "", "", "Juan", "", "", "", "", "2026-08-01"],
    ]);
    await guardarEdificioFicha("Castro Barros 1310", { encargado: "Pedro" });
    const call = valuesUpdate.mock.calls.at(-1)![0];
    expect(call.range).toBe("EdificioFicha!A2:K2");
    expect(call.requestBody.values[0][5]).toBe("Pedro");
  });

  it("escribe la fecha de actualización", async () => {
    mockRows([HEADERS]);
    await guardarEdificioFicha("Nuevo 123", {});
    const fila = valuesUpdate.mock.calls.at(-1)![0].requestBody.values[0];
    expect(fila[10]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run lib/sheets/edificio-ficha.test.ts`
Expected: FAIL — no se resuelve `./edificio-ficha`.

- [ ] **Step 3: Registrar las hojas nuevas**

En `lib/sheets/core.ts`, dentro de `SHEETS`, agregar:

```ts
  visitas: "Visitas",
  edificioFicha: "EdificioFicha",
```

- [ ] **Step 4: Implementar**

Crear `lib/sheets/edificio-ficha.ts`:

```ts
import { getSheetId } from "../google-auth";
import { isDemoMode } from "../demo-mode";
import { EDIFICIO_FICHA_VACIA, type EdificioFicha } from "@/types";
import { getSheets, readRange, SHEETS } from "./core";
import { buildHeaderMap, type HeaderMap } from "./headers";
import { edificioMatches } from "./edificios";
import { nowBuenosAiresISO } from "../fecha-ar";

// Headers: edificio · seguro_poliza · ascensores · fumigacion · empresa_matafuego_venc
//        · encargado · caldera_termotanque · empresa_limpieza · horario_trabajo
//        · encargado_limpieza_hs · actualizado_en
const RANGE = `${SHEETS.edificioFicha}!A:K`;

function rowToFicha(h: HeaderMap, r: string[]): EdificioFicha {
  return {
    edificio: h.get(r, "edificio"),
    seguroPoliza: h.get(r, "seguro_poliza"),
    ascensores: h.get(r, "ascensores"),
    fumigacion: h.get(r, "fumigacion"),
    empresaMatafuegoVenc: h.get(r, "empresa_matafuego_venc"),
    encargado: h.get(r, "encargado"),
    calderaTermotanque: h.get(r, "caldera_termotanque"),
    empresaLimpieza: h.get(r, "empresa_limpieza"),
    horarioTrabajo: h.get(r, "horario_trabajo"),
    encargadoLimpiezaHs: h.get(r, "encargado_limpieza_hs"),
    actualizadoEn: h.get(r, "actualizado_en") || undefined,
  };
}

function fichaToRow(f: EdificioFicha): string[] {
  return [
    f.edificio,
    f.seguroPoliza,
    f.ascensores,
    f.fumigacion,
    f.empresaMatafuegoVenc,
    f.encargado,
    f.calderaTermotanque,
    f.empresaLimpieza,
    f.horarioTrabajo,
    f.encargadoLimpiezaHs,
    f.actualizadoEn ?? "",
  ];
}

// Busca la fila del edificio. Devuelve null si no está o si la hoja no existe aún.
async function findFichaRow(
  edificio: string
): Promise<{ ficha: EdificioFicha; rowNumber: number } | null> {
  let rows: string[][];
  try {
    rows = await readRange(RANGE);
  } catch {
    // La hoja todavía no fue creada en la planilla: se trata como "sin ficha".
    return null;
  }
  if (rows.length === 0) return null;
  const h = buildHeaderMap(rows[0] ?? []);
  const idx = rows.slice(1).findIndex((r) => edificioMatches(h.get(r, "edificio"), edificio));
  if (idx === -1) return null;
  return { ficha: rowToFicha(h, rows[idx + 1]), rowNumber: idx + 2 };
}

// Ficha del edificio para precargar el formulario. Si no hay nada cargado devuelve
// una ficha vacía: la primera visita de un consorcio arranca en blanco.
export async function getEdificioFicha(edificio: string): Promise<EdificioFicha> {
  if (isDemoMode()) return { edificio, ...EDIFICIO_FICHA_VACIA };
  const found = await findFichaRow(edificio);
  return found?.ficha ?? { edificio, ...EDIFICIO_FICHA_VACIA };
}

// Upsert: sobrescribe la fila del edificio con lo cargado en la visita, o la crea.
export async function guardarEdificioFicha(
  edificio: string,
  datos: Partial<Omit<EdificioFicha, "edificio" | "actualizadoEn">>
): Promise<EdificioFicha> {
  const previa = await getEdificioFicha(edificio);
  const merged: EdificioFicha = {
    ...previa,
    ...datos,
    edificio,
    actualizadoEn: nowBuenosAiresISO(),
  };
  if (isDemoMode()) return merged;

  const found = await findFichaRow(edificio);
  const rowNumber = found?.rowNumber ?? (await proximaFilaLibre());
  await getSheets().spreadsheets.values.update({
    spreadsheetId: getSheetId(),
    range: `${SHEETS.edificioFicha}!A${rowNumber}:K${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [fichaToRow(merged)] },
  });
  return merged;
}

// Fila libre por la columna A. Mismo criterio que el resto del data-layer: values.append
// dispersa las filas al fondo del grid en hojas grandes.
async function proximaFilaLibre(): Promise<number> {
  const colA = await readRange(`${SHEETS.edificioFicha}!A:A`);
  return colA.length + 1;
}
```

- [ ] **Step 5: Correr y verificar que pasa**

Run: `npx vitest run lib/sheets/edificio-ficha.test.ts`
Expected: PASS — 7 tests.

---

## Task 4: Data-layer de Visitas

**Files:**
- Create: `lib/sheets/visitas.ts`
- Test: `lib/sheets/visitas.test.ts`
- Modify: `lib/google-sheets.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/sheets/visitas.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

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
        values: { get: valuesGet, update: valuesUpdate, append: vi.fn() },
        get: spreadsheetsGet,
        batchUpdate,
      },
    }),
  },
}));
vi.mock("@/lib/google-auth", () => ({ getGoogleAuth: () => ({}), getSheetId: () => "sheet-id" }));
vi.mock("../google-auth", () => ({ getGoogleAuth: () => ({}), getSheetId: () => "sheet-id" }));
vi.mock("../demo-mode", () => ({ isDemoMode: () => false }));

import { getVisitas, appendVisita, getVisitaById, deleteVisita } from "./visitas";

const HEADERS = ["id", "edificio", "fecha", "pdf_url", "supervisor", "creado_en"];
const URL_A = "https://drive.google.com/file/d/a/view";
const URL_B = "https://drive.google.com/file/d/b/view";

function mockRows(rows: string[][]) {
  valuesGet.mockResolvedValue({ data: { values: rows } });
}

beforeEach(() => {
  vi.clearAllMocks();
  valuesUpdate.mockResolvedValue({});
  batchUpdate.mockResolvedValue({});
  spreadsheetsGet.mockResolvedValue({
    data: { sheets: [{ properties: { sheetId: 77, title: "Visitas" } }] },
  });
});

describe("getVisitas", () => {
  it("mapea las filas e ignora las que no tienen id", async () => {
    mockRows([
      HEADERS,
      ["2026-08-01T10:00:00-03:00", "Castro Barros 1310", "2026-08-01", URL_A, "sup@x.com", "2026-08-01T10:00:00-03:00"],
      ["", "", "", "", "", ""],
    ]);
    const v = await getVisitas();
    expect(v).toHaveLength(1);
    expect(v[0].edificio).toBe("Castro Barros 1310");
    expect(v[0].pdfUrl).toBe(URL_A);
  });

  it("filtra por edificio de forma tolerante a mayúsculas", async () => {
    mockRows([
      HEADERS,
      ["1", "Castro Barros 1310", "2026-08-01", URL_A, "s@x.com", "2026-08-01"],
      ["2", "Av. Belgrano 1429", "2026-08-02", URL_B, "s@x.com", "2026-08-02"],
    ]);
    const v = await getVisitas("CASTRO BARROS 1310");
    expect(v).toHaveLength(1);
    expect(v[0].id).toBe("1");
  });

  it("devuelve vacío si la hoja todavía no existe", async () => {
    valuesGet.mockRejectedValue(new Error("Unable to parse range"));
    expect(await getVisitas()).toEqual([]);
  });
});

describe("appendVisita", () => {
  it("escribe la fila en la primera libre y devuelve la visita", async () => {
    mockRows([HEADERS]);
    const v = await appendVisita({
      edificio: "Castro Barros 1310",
      pdfUrl: URL_A,
      supervisor: "SUP@X.com",
    });
    expect(v.edificio).toBe("Castro Barros 1310");
    expect(v.supervisor).toBe("sup@x.com");
    expect(v.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const call = valuesUpdate.mock.calls.at(-1)![0];
    expect(call.range).toBe("Visitas!A2:F2");
    expect(call.requestBody.values[0][3]).toBe(URL_A);
  });
});

describe("deleteVisita", () => {
  it("borra la fila de la visita pedida", async () => {
    mockRows([
      HEADERS,
      ["1", "A", "2026-08-01", URL_A, "s@x.com", "2026-08-01"],
      ["2", "B", "2026-08-02", URL_B, "s@x.com", "2026-08-02"],
    ]);
    await deleteVisita("2");
    const req = batchUpdate.mock.calls.at(-1)![0].requestBody.requests[0].deleteDimension.range;
    expect(req.sheetId).toBe(77);
    expect(req.startIndex).toBe(2); // fila 3 (0-based)
  });

  it("es un no-op si el id no existe", async () => {
    mockRows([HEADERS]);
    await deleteVisita("nope");
    expect(batchUpdate).not.toHaveBeenCalled();
  });
});

describe("getVisitaById", () => {
  it("encuentra la visita por id", async () => {
    mockRows([HEADERS, ["1", "A", "2026-08-01", URL_A, "s@x.com", "2026-08-01"]]);
    expect((await getVisitaById("1"))?.pdfUrl).toBe(URL_A);
  });

  it("devuelve null si no está", async () => {
    mockRows([HEADERS]);
    expect(await getVisitaById("nope")).toBeNull();
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run lib/sheets/visitas.test.ts`
Expected: FAIL — no se resuelve `./visitas`.

- [ ] **Step 3: Implementar**

Crear `lib/sheets/visitas.ts`:

```ts
import { getSheetId } from "../google-auth";
import { isDemoMode } from "../demo-mode";
import type { Visita } from "@/types";
import { getSheets, readRange, SHEETS, getSheetGid } from "./core";
import { buildHeaderMap, type HeaderMap } from "./headers";
import { toDateOnly } from "./values";
import { edificioMatches } from "./edificios";
import { nowBuenosAiresISO } from "../fecha-ar";

// Headers: id · edificio · fecha · pdf_url · supervisor · creado_en
// Esta hoja es el ÍNDICE del historial: los datos del formulario viven dentro del PDF.
const RANGE = `${SHEETS.visitas}!A:F`;

function rowToVisita(h: HeaderMap, r: string[]): Visita {
  return {
    id: h.get(r, "id"),
    edificio: h.get(r, "edificio"),
    fecha: toDateOnly(h.get(r, "fecha")),
    pdfUrl: h.get(r, "pdf_url"),
    supervisor: h.get(r, "supervisor").trim().toLowerCase(),
    creadoEn: h.get(r, "creado_en"),
  };
}

function visitaToRow(v: Visita): string[] {
  return [v.id, v.edificio, toDateOnly(v.fecha), v.pdfUrl, v.supervisor, v.creadoEn];
}

// Lee la hoja tolerando que todavía no exista (antes del setup manual en la planilla).
async function leerFilas(): Promise<string[][]> {
  try {
    return await readRange(RANGE);
  } catch {
    return [];
  }
}

export function rowsToVisitas(rows: string[][]): Visita[] {
  if (rows.length === 0) return [];
  const h = buildHeaderMap(rows[0] ?? []);
  return rows
    .slice(1)
    .filter((r) => h.get(r, "id"))
    .map((r) => rowToVisita(h, r));
}

export async function getVisitas(edificio?: string): Promise<Visita[]> {
  if (isDemoMode()) return [];
  const all = rowsToVisitas(await leerFilas());
  if (!edificio) return all;
  return all.filter((v) => edificioMatches(v.edificio, edificio));
}

export async function getVisitaById(id: string): Promise<Visita | null> {
  if (isDemoMode()) return null;
  const all = rowsToVisitas(await leerFilas());
  return all.find((v) => v.id === id) ?? null;
}

// La fecha NO viene del cliente: es el día de emisión en hora de Buenos Aires.
export async function appendVisita(input: {
  edificio: string;
  pdfUrl: string;
  supervisor: string;
}): Promise<Visita> {
  const now = nowBuenosAiresISO();
  const visita: Visita = {
    id: now,
    edificio: input.edificio,
    fecha: now.slice(0, 10),
    pdfUrl: input.pdfUrl,
    supervisor: input.supervisor.trim().toLowerCase(),
    creadoEn: now,
  };
  if (isDemoMode()) return visita;

  // Fila libre por la columna A: values.append dispersa filas al fondo del grid.
  const colA = await readRange(`${SHEETS.visitas}!A:A`);
  const nextRow = colA.length + 1;
  await getSheets().spreadsheets.values.update({
    spreadsheetId: getSheetId(),
    range: `${SHEETS.visitas}!A${nextRow}:F${nextRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [visitaToRow(visita)] },
  });
  return visita;
}

export async function deleteVisita(id: string): Promise<void> {
  if (isDemoMode()) return;
  const rows = await leerFilas();
  if (rows.length === 0) return;
  const h = buildHeaderMap(rows[0] ?? []);
  const idx = rows.slice(1).findIndex((r) => h.get(r, "id") === id);
  if (idx === -1) return;
  const rowNumber = idx + 2;
  const gid = await getSheetGid(SHEETS.visitas);
  await getSheets().spreadsheets.batchUpdate({
    spreadsheetId: getSheetId(),
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: { sheetId: gid, dimension: "ROWS", startIndex: rowNumber - 1, endIndex: rowNumber },
          },
        },
      ],
    },
  });
}
```

- [ ] **Step 4: Re-exportar desde el barrel**

En `lib/google-sheets.ts`, agregar al final:

```ts
export { getVisitas, getVisitaById, appendVisita, deleteVisita, rowsToVisitas } from "./sheets/visitas";
export { getEdificioFicha, guardarEdificioFicha } from "./sheets/edificio-ficha";
```

- [ ] **Step 5: Correr y verificar que pasa**

Run: `npx vitest run lib/sheets/visitas.test.ts && npx tsc --noEmit`
Expected: PASS — 7 tests, sin errores de tipos.

---

## Task 5: Carpeta y nombre del PDF en Drive

**Files:**
- Modify: `lib/google-drive.ts`
- Test: `tests/lib/google-drive.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Agregar al final de `tests/lib/google-drive.test.ts`:

```ts
import { nombreArchivoVisita } from "@/lib/google-drive";

describe("nombreArchivoVisita", () => {
  it("arma VISITA - DD-MM-AAAA - Edificio.pdf", () => {
    expect(nombreArchivoVisita("Castro Barros 1310", "2026-08-08")).toBe(
      "VISITA - 08-08-2026 - Castro Barros 1310.pdf"
    );
  });

  it("limpia los caracteres que Drive no acepta en un nombre", () => {
    expect(nombreArchivoVisita("Edificio A/B: 12", "2026-01-05")).toBe(
      "VISITA - 05-01-2026 - Edificio A B 12.pdf"
    );
  });

  it("agrega un sufijo cuando ya existe un archivo con ese nombre", () => {
    expect(nombreArchivoVisita("Castro Barros 1310", "2026-08-08", 2)).toBe(
      "VISITA - 08-08-2026 - Castro Barros 1310 (2).pdf"
    );
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run tests/lib/google-drive.test.ts`
Expected: FAIL — `nombreArchivoVisita is not exported`.

- [ ] **Step 3: Implementar**

En `lib/google-drive.ts`, agregar después de `tareaFolderName`:

```ts
// Nombre del PDF de una visita: "VISITA - DD-MM-AAAA - Edificio.pdf" (formato de fecha
// argentino, pedido del cliente). `copia` numera los repetidos: puede haber más de una
// visita del mismo edificio el mismo día y Drive admite nombres duplicados.
export function nombreArchivoVisita(edificio: string, fechaISO: string, copia = 1): string {
  const [y, m, d] = fechaISO.slice(0, 10).split("-");
  const fecha = `${d}-${m}-${y}`;
  const nombre = sanitizeSegment(edificio) || "Sin edificio";
  const sufijo = copia > 1 ? ` (${copia})` : "";
  return `VISITA - ${fecha} - ${nombre}${sufijo}.pdf`;
}

// Carpeta de visitas del consorcio: {raíz}/Tareas/{Edificio}/Visitas/
// Queda al mismo nivel que las carpetas de año de las tareas, así todo lo del consorcio
// vive junto (decisión 16 del spec).
export async function ensureVisitasFolder(edificio: string): Promise<string> {
  if (isDemoMode()) return `demo-visitas-${edificio}`.replace(/\s+/g, "_").toLowerCase();
  const root = getDriveRootFolderId();
  const tareas = await ensureFolder("Tareas", root);
  const edificioFolder = await ensureFolder(sanitizeSegment(edificio) || "Sin edificio", tareas);
  return ensureFolder("Visitas", edificioFolder);
}

// Cuenta cuántos archivos hay ya con ese nombre base para numerar la copia.
async function proximaCopia(folderId: string, edificio: string, fechaISO: string): Promise<number> {
  const drive = getDrive();
  for (let copia = 1; copia <= 50; copia++) {
    const nombre = nombreArchivoVisita(edificio, fechaISO, copia).replace(/'/g, "\\'");
    const found = await drive.files.list({
      q: `name='${nombre}' and '${folderId}' in parents and trashed=false`,
      fields: "files(id)",
      spaces: "drive",
      pageSize: 1,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    if (!found.data.files?.length) return copia;
  }
  return 51;
}

// Sube el PDF de una visita a la carpeta Visitas del consorcio, con el nombre definitivo.
export async function uploadVisitaPdf(opts: {
  buffer: Buffer;
  edificio: string;
  fechaISO: string;
}): Promise<UploadResult> {
  if (isDemoMode()) {
    const fakeId = `demo-visita-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    return {
      fileId: fakeId,
      name: nombreArchivoVisita(opts.edificio, opts.fechaISO),
      url: `https://drive.google.com/file/d/${fakeId}/view`,
    };
  }
  const folderId = await ensureVisitasFolder(opts.edificio);
  const copia = await proximaCopia(folderId, opts.edificio, opts.fechaISO);
  const name = nombreArchivoVisita(opts.edificio, opts.fechaISO, copia);
  return uploadFile({ buffer: opts.buffer, name, mimeType: "application/pdf", folderId });
}

// Sube una foto de visita a la misma carpeta, numerada. El PDF después la embebe por URL.
export async function uploadVisitaFoto(opts: {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  edificio: string;
}): Promise<UploadResult> {
  const ext = extFor(opts.originalName, opts.mimeType);
  if (isDemoMode()) {
    const fakeId = `demo-visita-foto-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    return { fileId: fakeId, name: `foto-01${ext}`, url: `https://drive.google.com/file/d/${fakeId}/view` };
  }
  const folderId = await ensureVisitasFolder(opts.edificio);
  const nn = await nextIndex(folderId);
  return uploadFile({
    buffer: opts.buffer,
    name: `foto-${pad2(nn)}${ext}`,
    mimeType: opts.mimeType,
    folderId,
  });
}

// Sube la firma de un usuario a {raíz}/_Firmas/ con el email como nombre.
export async function uploadFirma(opts: {
  buffer: Buffer;
  mimeType: string;
  email: string;
}): Promise<UploadResult> {
  if (isDemoMode()) {
    const fakeId = `demo-firma-${Date.now()}`;
    return { fileId: fakeId, name: "firma.png", url: `https://drive.google.com/file/d/${fakeId}/view` };
  }
  const root = getDriveRootFolderId();
  const firmas = await ensureFolder("_Firmas", root);
  const name = `${sanitizeSegment(opts.email) || "firma"}-${Date.now()}.png`;
  return uploadFile({ buffer: opts.buffer, name, mimeType: opts.mimeType, folderId: firmas });
}
```

Si `nextIndex` o `pad2` no están declarados antes de este bloque en el archivo, moverlo debajo de
donde sí lo estén (son helpers ya existentes usados por `uploadTareaFile`).

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run tests/lib/google-drive.test.ts && npx tsc --noEmit`
Expected: PASS y sin errores de tipos.

---

## Task 6: El PDF de la visita

**Files:**
- Create: `components/pdf/VisitaPdf.tsx`
- Create: `lib/visita-pdf.tsx`

- [ ] **Step 1: Crear el documento**

Crear `components/pdf/VisitaPdf.tsx`:

```tsx
import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { Configuracion, EdificioFicha } from "@/types";
import { APP_NAME } from "@/lib/app-name";
import { BLOQUES_VISITA } from "@/lib/visitas-items";

const colors = {
  text: "#0f172a",
  muted: "#64748b",
  border: "#cbd5e1",
  head: "#d9d9d9",
  link: "#1155cc",
};

const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 9, color: colors.text, fontFamily: "Helvetica" },
  membrete: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  logo: { width: 64, height: 64, marginRight: 14 },
  nombre: { fontSize: 20, fontFamily: "Helvetica-Bold", textAlign: "center" },
  contactoFila: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  email: { fontSize: 8, color: colors.link, fontFamily: "Helvetica-Bold" },
  direccion: { fontSize: 8, fontFamily: "Helvetica-Bold" },
  separador: { borderBottom: `2pt solid ${colors.text}`, marginBottom: 6 },
  titulo: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    backgroundColor: colors.head,
    paddingVertical: 3,
    marginBottom: 8,
  },
  meta: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  metaTexto: { fontSize: 10, fontFamily: "Helvetica-BoldOblique" },
  fichaFila: { flexDirection: "row", marginBottom: 3 },
  fichaLabel: { width: 150, color: colors.muted },
  fichaValor: { flex: 1, borderBottom: `0.5pt solid ${colors.border}` },
  bloqueTitulo: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    backgroundColor: colors.head,
    textAlign: "center",
    paddingVertical: 2,
    marginTop: 10,
  },
  filaItem: { flexDirection: "row", borderBottom: `0.5pt solid ${colors.border}` },
  celdaItem: { padding: 3 },
  encabezado: { backgroundColor: "#f1f5f9", fontFamily: "Helvetica-Bold" },
  seccion: { marginTop: 12 },
  seccionTitulo: { fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  informe: { lineHeight: 1.4, minHeight: 40 },
  fotos: { flexDirection: "row", flexWrap: "wrap", marginTop: 4 },
  foto: { width: 120, height: 120, marginRight: 4, marginBottom: 4 },
  firmaBloque: { marginTop: 20, alignItems: "flex-end" },
  firmaImg: { width: 120, height: 50, objectFit: "contain" },
  firmaLinea: { width: 160, borderTop: `0.5pt solid ${colors.text}`, marginTop: 2, paddingTop: 2 },
  firmaTexto: { fontSize: 8, textAlign: "center" },
});

const ANCHOS = { item: "60%", si: "20%", no: "20%" };

// Marca de check en las columnas Realizada / No realizada.
function marca(valor: string | undefined, esperado: string): string {
  return valor === esperado ? "X" : "";
}

interface Props {
  edificio: string;
  fecha: string; // ISO date
  ficha: EdificioFicha;
  controles: Record<string, string>;
  informeGeneral?: string;
  fotos: string[];
  supervisorNombre: string;
  firmaUrl?: string;
  config: Configuracion;
}

export function VisitaPdf({
  edificio,
  fecha,
  ficha,
  controles,
  informeGeneral,
  fotos,
  supervisorNombre,
  firmaUrl,
  config,
}: Props) {
  const [y, m, d] = fecha.slice(0, 10).split("-");
  const fechaAr = `${d}/${m}/${y}`;

  const filasFicha: Array<[string, string]> = [
    ["Seguro - Póliza", ficha.seguroPoliza],
    ["Ascensores", ficha.ascensores],
    ["Fumigación", ficha.fumigacion],
    ["Empresa Matafuego. Venc.", ficha.empresaMatafuegoVenc],
    ["Encargado", ficha.encargado],
    ["Caldera o Termotanque", ficha.calderaTermotanque],
    ["Emp. de Limpieza", ficha.empresaLimpieza],
    ["Horario de trab.", ficha.horarioTrabajo],
    ["Encargado o limpieza y hs de trab.", ficha.encargadoLimpiezaHs],
  ];

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.membrete}>
          {config.membreteLogoUrl ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image src={config.membreteLogoUrl} style={styles.logo} />
          ) : null}
          <Text style={styles.nombre}>{(config.membreteNombre || APP_NAME).toUpperCase()}</Text>
        </View>
        <View style={styles.contactoFila}>
          <Text style={styles.email}>{config.membreteEmail}</Text>
          <Text style={styles.direccion}>
            {[config.membreteDireccion, config.membreteTelefono].filter(Boolean).join(" ")}
          </Text>
        </View>
        <View style={styles.separador} />

        <Text style={styles.titulo}>VISITA / CONTROL</Text>

        <View style={styles.meta}>
          <Text style={styles.metaTexto}>Consorcio: {edificio}</Text>
          <Text style={styles.metaTexto}>Fecha: {fechaAr}</Text>
        </View>

        {filasFicha.map(([label, valor]) => (
          <View key={label} style={styles.fichaFila}>
            <Text style={styles.fichaLabel}>{label}:</Text>
            <Text style={styles.fichaValor}>{valor || " "}</Text>
          </View>
        ))}

        {BLOQUES_VISITA.map((bloque) => (
          <View key={bloque.titulo}>
            <Text style={styles.bloqueTitulo}>{bloque.titulo}</Text>
            <View style={[styles.filaItem, styles.encabezado]}>
              <Text style={[styles.celdaItem, { width: ANCHOS.item }]}>Sector</Text>
              <Text style={[styles.celdaItem, { width: ANCHOS.si, textAlign: "center" }]}>Realizada</Text>
              <Text style={[styles.celdaItem, { width: ANCHOS.no, textAlign: "center" }]}>No realizada</Text>
            </View>
            {bloque.items.map((item) => (
              <View key={item.clave} style={styles.filaItem} wrap={false}>
                <Text style={[styles.celdaItem, { width: ANCHOS.item }]}>{item.label}</Text>
                <Text style={[styles.celdaItem, { width: ANCHOS.si, textAlign: "center" }]}>
                  {marca(controles[item.clave], "Realizada")}
                </Text>
                <Text style={[styles.celdaItem, { width: ANCHOS.no, textAlign: "center" }]}>
                  {marca(controles[item.clave], "No realizada")}
                </Text>
              </View>
            ))}
          </View>
        ))}

        <View style={styles.seccion}>
          <Text style={styles.seccionTitulo}>INFORME GENERAL:</Text>
          <Text style={styles.informe}>{informeGeneral || " "}</Text>
        </View>

        {fotos.length > 0 && (
          <View style={styles.seccion}>
            <Text style={styles.seccionTitulo}>Fotos ({fotos.length})</Text>
            <View style={styles.fotos}>
              {fotos.slice(0, 9).map((url) => (
                // eslint-disable-next-line jsx-a11y/alt-text
                <Image key={url} src={url} style={styles.foto} />
              ))}
            </View>
          </View>
        )}

        <View style={styles.firmaBloque}>
          {firmaUrl ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image src={firmaUrl} style={styles.firmaImg} />
          ) : null}
          <View style={styles.firmaLinea}>
            <Text style={styles.firmaTexto}>{supervisorNombre}</Text>
            <Text style={[styles.firmaTexto, { color: colors.muted }]}>Supervisor</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
```

- [ ] **Step 2: Crear el generador**

Crear `lib/visita-pdf.tsx`:

```tsx
import { renderToBuffer } from "@react-pdf/renderer";
import { VisitaPdf } from "@/components/pdf/VisitaPdf";
import { uploadVisitaPdf } from "./google-drive";
import { logoMembreteUrl } from "./drive-url";
import { resolverLogoParaPdf } from "./membrete-logo";
import type { Configuracion, EdificioFicha } from "@/types";

interface Args {
  edificio: string;
  fecha: string; // ISO date
  ficha: EdificioFicha;
  controles: Record<string, string>;
  informeGeneral?: string;
  fotos: string[];
  supervisorNombre: string;
  firmaUrl?: string;
  config: Configuracion;
}

// Genera el PDF y lo sube a Drive. Devuelve la URL del archivo.
// Si algo de acá falla, el caller NO escribe la fila: nunca queda un link roto.
export async function generarYSubirVisitaPdf(args: Args): Promise<{ url: string; fileId: string }> {
  const config: Configuracion = {
    ...args.config,
    membreteLogoUrl: resolverLogoParaPdf(args.config.membreteLogoUrl),
  };
  const buffer = await renderToBuffer(
    <VisitaPdf
      edificio={args.edificio}
      fecha={args.fecha}
      ficha={args.ficha}
      controles={args.controles}
      informeGeneral={args.informeGeneral}
      // Las fotos son links de Drive: el <Image> del PDF necesita la URL de imagen,
      // no la página /view (mismo caso que el logo del membrete).
      fotos={args.fotos.map((u) => logoMembreteUrl(u, 800))}
      supervisorNombre={args.supervisorNombre}
      firmaUrl={args.firmaUrl ? logoMembreteUrl(args.firmaUrl, 400) : undefined}
      config={config}
    />
  );
  const subido = await uploadVisitaPdf({ buffer, edificio: args.edificio, fechaISO: args.fecha });
  return { url: subido.url, fileId: subido.fileId };
}
```

- [ ] **Step 3: Verificar tipos y lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores.

---

## Task 7: `firma_url` en Usuarios (data-layer y API)

**Files:**
- Modify: `lib/sheets/usuarios.ts:12` y `rowsToUsuarios`
- Modify: `lib/google-sheets.ts`
- Modify: `app/api/usuarios/route.ts` (PATCH)
- Modify: `lib/api-client.ts`
- Test: `tests/api/usuarios.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Agregar al final de `tests/api/usuarios.test.ts`:

```ts
describe("PATCH /api/usuarios — firma", () => {
  beforeEach(() => {
    requireAdmin.mockResolvedValue({ user: { email: "admin@x.com", rol: "admin" } });
  });

  it("guarda la firma de un usuario (admin)", async () => {
    const res = await PATCH(
      new NextRequest("http://localhost/api/usuarios?email=sup@x.com", {
        method: "PATCH",
        body: JSON.stringify({ firmaUrl: "https://drive.google.com/file/d/f1/view" }),
      })
    );
    expect(res.status).toBe(200);
    expect(vi.mocked(setUsuarioFirma)).toHaveBeenCalledWith(
      "sup@x.com",
      "https://drive.google.com/file/d/f1/view"
    );
  });

  it("permite borrar la firma mandando cadena vacía", async () => {
    const res = await PATCH(
      new NextRequest("http://localhost/api/usuarios?email=sup@x.com", {
        method: "PATCH",
        body: JSON.stringify({ firmaUrl: "" }),
      })
    );
    expect(res.status).toBe(200);
    expect(vi.mocked(setUsuarioFirma)).toHaveBeenCalledWith("sup@x.com", "");
  });

  it("sigue aceptando el patch de activo", async () => {
    const res = await PATCH(
      new NextRequest("http://localhost/api/usuarios?email=sup@x.com", {
        method: "PATCH",
        body: JSON.stringify({ activo: false }),
      })
    );
    expect(res.status).toBe(200);
    expect(vi.mocked(setUsuarioActivo)).toHaveBeenCalledWith("sup@x.com", false);
  });
});
```

Sumar `setUsuarioFirma` al `vi.mock("@/lib/google-sheets", …)` de la cabecera del archivo
(como `setUsuarioFirma: vi.fn()`) y al import de `@/lib/google-sheets`.

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run tests/api/usuarios.test.ts`
Expected: FAIL — `setUsuarioFirma` no existe.

- [ ] **Step 3: Ampliar el rango y leer la columna**

En `lib/sheets/usuarios.ts`, cambiar el rango:

```ts
const RANGE = `${SHEETS.usuarios}!A:G`;
```

Y dentro del objeto que devuelve el `.map(...)` de `rowsToUsuarios`, agregar:

```ts
        firmaUrl: h.get(r, "firma_url") || undefined,
```

- [ ] **Step 4: Agregar `setUsuarioFirma`**

Al final de `lib/sheets/usuarios.ts`:

```ts
// Guarda (o borra, con "") la URL de la firma del usuario. Escribe SOLO esa celda,
// ubicándola por header — mismo patrón que setUsuarioActivo.
export async function setUsuarioFirma(email: string, firmaUrl: string): Promise<void> {
  if (isDemoMode()) return;
  const rows = await readRange(RANGE);
  const h = buildHeaderMap(rows[0] ?? []);
  const target = email.trim().toLowerCase();
  const idx = rows.slice(1).findIndex((r) => h.get(r, "email").trim().toLowerCase() === target);
  if (idx === -1) throw new Error(`Usuario ${email} no encontrado`);
  const rowNumber = idx + 2;

  const firmaIdx = h.index("firma_url");
  if (firmaIdx === -1) throw new Error("La hoja Usuarios no tiene la columna firma_url");

  await getSheets().spreadsheets.values.update({
    spreadsheetId: getSheetId(),
    range: `${SHEETS.usuarios}!${colLetter(firmaIdx + 1)}${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[firmaUrl]] },
  });

  const updIdx = h.index("actualizado_en");
  if (updIdx !== -1) {
    await getSheets().spreadsheets.values.update({
      spreadsheetId: getSheetId(),
      range: `${SHEETS.usuarios}!${colLetter(updIdx + 1)}${rowNumber}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[nowBuenosAiresISO()]] },
    });
  }
}
```

Y en `lib/google-sheets.ts`, sumarla a la línea de usuarios:

```ts
export { getUsuarios, getUsuarioByEmail, appendUsuario, setUsuarioActivo, setUsuarioFirma } from "./sheets/usuarios";
```

- [ ] **Step 5: Aceptar el patch en la API**

En `app/api/usuarios/route.ts`, reemplazar el cuerpo del `PATCH`:

```ts
export async function PATCH(req: NextRequest) {
  try {
    await requireAdmin();
    const email = req.nextUrl.searchParams.get("email");
    if (!email) return jsonError(400, "Falta query param 'email'");

    const body = await req.json();
    // Dos patches distintos sobre el mismo endpoint: activar/desactivar y firma.
    if (typeof body?.firmaUrl === "string") {
      const parsedFirma = firmaSchema.parse({ email, firmaUrl: body.firmaUrl });
      await setUsuarioFirma(email, parsedFirma.firmaUrl);
      return NextResponse.json({ ok: true });
    }
    const parsed = usuarioPatchSchema.parse(body);
    await setUsuarioActivo(email, parsed.activo);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
```

Sumar `setUsuarioFirma` al import de `@/lib/google-sheets` y `firmaSchema` al de `@/lib/schemas`.

- [ ] **Step 6: Método en el cliente**

En `lib/api-client.ts`, dentro de `usuarios`, después de `setActivo`:

```ts
    setFirma: (email: string, firmaUrl: string) =>
      request<{ ok: true }>(
        `/api/usuarios?email=${encodeURIComponent(email)}`,
        { method: "PATCH", body: JSON.stringify({ firmaUrl }) }
      ),
```

- [ ] **Step 7: Correr y verificar que pasa**

Run: `npx vitest run tests/api/usuarios.test.ts && npx tsc --noEmit`
Expected: PASS y sin errores de tipos.

---

## Task 8: Recuadro de firma y su carga desde Usuarios

**Files:**
- Create: `components/ui/FirmaCanvas.tsx`
- Test: `components/ui/FirmaCanvas.test.tsx`
- Modify: `app/api/upload/route.ts`
- Modify: `components/usuarios/UsuariosManager.tsx`

- [ ] **Step 1: Escribir el test que falla**

Crear `components/ui/FirmaCanvas.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FirmaCanvas } from "./FirmaCanvas";

// jsdom no implementa el contexto 2D del canvas: se mockea lo que usa el componente.
beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    clearRect: vi.fn(),
    lineWidth: 0,
    lineCap: "",
    strokeStyle: "",
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.toBlob = vi.fn((cb: BlobCallback) =>
    cb(new Blob(["x"], { type: "image/png" }))
  ) as unknown as typeof HTMLCanvasElement.prototype.toBlob;
});

describe("FirmaCanvas", () => {
  it("arranca con Guardar deshabilitado porque no hay trazo", () => {
    render(<FirmaCanvas onGuardar={vi.fn()} guardando={false} />);
    expect(screen.getByRole("button", { name: /guardar firma/i })).toBeDisabled();
  });

  it("habilita Guardar después de dibujar", () => {
    render(<FirmaCanvas onGuardar={vi.fn()} guardando={false} />);
    const canvas = screen.getByTestId("firma-canvas");
    fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10 });
    fireEvent.pointerMove(canvas, { clientX: 30, clientY: 20 });
    fireEvent.pointerUp(canvas);
    expect(screen.getByRole("button", { name: /guardar firma/i })).toBeEnabled();
  });

  it("Borrar vuelve a dejar Guardar deshabilitado", () => {
    render(<FirmaCanvas onGuardar={vi.fn()} guardando={false} />);
    const canvas = screen.getByTestId("firma-canvas");
    fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10 });
    fireEvent.pointerUp(canvas);
    fireEvent.click(screen.getByRole("button", { name: /borrar/i }));
    expect(screen.getByRole("button", { name: /guardar firma/i })).toBeDisabled();
  });

  it("entrega un Blob PNG al guardar", () => {
    const onGuardar = vi.fn();
    render(<FirmaCanvas onGuardar={onGuardar} guardando={false} />);
    const canvas = screen.getByTestId("firma-canvas");
    fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10 });
    fireEvent.pointerUp(canvas);
    fireEvent.click(screen.getByRole("button", { name: /guardar firma/i }));
    expect(onGuardar).toHaveBeenCalledWith(expect.any(Blob));
  });

  it("bloquea el botón mientras guarda", () => {
    render(<FirmaCanvas onGuardar={vi.fn()} guardando />);
    expect(screen.getByRole("button", { name: /guardar firma/i })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run components/ui/FirmaCanvas.test.tsx`
Expected: FAIL — no se resuelve `./FirmaCanvas`.

- [ ] **Step 3: Implementar el canvas**

Crear `components/ui/FirmaCanvas.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import { Eraser, Loader2, Save } from "lucide-react";

interface Props {
  onGuardar: (blob: Blob) => void;
  guardando: boolean;
}

// Recuadro para firmar con el dedo o el mouse. Usa Pointer Events: un solo camino
// para touch y mouse, sin dependencias externas.
export function FirmaCanvas({ onGuardar, guardando }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);
  const [tieneTrazo, setTieneTrazo] = useState(false);

  const ctx = () => canvasRef.current?.getContext("2d") ?? null;

  const posicion = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const empezar = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = ctx();
    if (!c) return;
    dibujando.current = true;
    setTieneTrazo(true);
    c.lineWidth = 2;
    c.lineCap = "round";
    c.strokeStyle = "#0f172a";
    const { x, y } = posicion(e);
    c.beginPath();
    c.moveTo(x, y);
  };

  const mover = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dibujando.current) return;
    const c = ctx();
    if (!c) return;
    const { x, y } = posicion(e);
    c.lineTo(x, y);
    c.stroke();
  };

  const soltar = () => {
    dibujando.current = false;
  };

  const borrar = () => {
    const c = ctx();
    const canvas = canvasRef.current;
    if (c && canvas) c.clearRect(0, 0, canvas.width, canvas.height);
    setTieneTrazo(false);
  };

  const guardar = () => {
    canvasRef.current?.toBlob((blob) => {
      if (blob) onGuardar(blob);
    }, "image/png");
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        data-testid="firma-canvas"
        width={480}
        height={160}
        onPointerDown={empezar}
        onPointerMove={mover}
        onPointerUp={soltar}
        onPointerLeave={soltar}
        className="w-full touch-none rounded-lg border border-dashed border-slate-300 bg-white"
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={borrar}
          className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          <Eraser size={14} /> Borrar
        </button>
        <button
          type="button"
          onClick={guardar}
          disabled={!tieneTrazo || guardando}
          className="flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60 disabled:hover:bg-slate-900"
        >
          {guardando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Guardar firma
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run components/ui/FirmaCanvas.test.tsx`
Expected: PASS — 5 tests.

- [ ] **Step 5: Aceptar firmas y fotos de visita en el upload**

En `app/api/upload/route.ts`, dentro del `POST`, **antes** de la línea
`if (!objetivo) return jsonError(400, "Falta objetivo");`, insertar:

```ts
    // Destinos alternativos al de tareas. Se resuelven antes porque no requieren
    // objetivo/ubicación/rowId, que son propios de una tarea.
    const destino = (form.get("destino") ?? "").toString();

    if (destino === "firma") {
      const emailFirma = (form.get("email") ?? "").toString();
      if (!emailFirma) return jsonError(400, "Falta el email del usuario");
      if (!IMAGE_MIMES.has(file.type)) {
        return jsonError(400, `La firma tiene que ser una imagen: ${file.type}`);
      }
      const subida = await uploadFirma({
        buffer: Buffer.from(await file.arrayBuffer()),
        mimeType: file.type,
        email: emailFirma,
      });
      return NextResponse.json({ url: subida.url, kind: "imagen" });
    }

    if (destino === "visita") {
      if (!edificio) return jsonError(400, "Falta edificio");
      if (!IMAGE_MIMES.has(file.type)) {
        return jsonError(400, `Solo se permiten imágenes en una visita: ${file.type}`);
      }
      const subida = await uploadVisitaFoto({
        buffer: Buffer.from(await file.arrayBuffer()),
        originalName: file.name,
        mimeType: file.type,
        edificio,
      });
      return NextResponse.json({ url: subida.url, kind: "imagen" });
    }
```

Sumar al import de `@/lib/google-drive`: `uploadFirma, uploadVisitaFoto`.

- [ ] **Step 6: Carga de firma en la pantalla de Usuarios**

En `components/usuarios/UsuariosManager.tsx`, junto a las mutaciones que ya existen:

```tsx
  const [firmaDe, setFirmaDe] = useState<string | null>(null);

  const subirFirma = useMutation({
    mutationFn: async ({ email, blob }: { email: string; blob: Blob }) => {
      const form = new FormData();
      form.append("file", new File([blob], "firma.png", { type: "image/png" }));
      form.append("destino", "firma");
      form.append("email", email);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      if (!res.ok) throw new Error("No se pudo subir la firma");
      const { url } = (await res.json()) as { url: string };
      await api.usuarios.setFirma(email, url);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["usuarios"] });
      setFirmaDe(null);
    },
  });
```

En la fila de cada usuario, el botón que abre el panel:

```tsx
              <button
                type="button"
                onClick={() => setFirmaDe(firmaDe === u.email ? null : u.email)}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
              >
                {u.firmaUrl ? "Cambiar firma" : "Cargar firma"}
              </button>
```

Y debajo de la fila, el panel desplegado:

```tsx
            {firmaDe === u.email && (
              <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                {u.firmaUrl && (
                  // Imagen externa de Drive: <img> evita configurar remotePatterns.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logoMembreteUrl(u.firmaUrl, 300)}
                    alt=""
                    className="mb-2 h-16 object-contain"
                  />
                )}
                <p className="mb-2 text-xs text-slate-600">Dibujá la firma o subí una imagen.</p>
                <FirmaCanvas
                  guardando={subirFirma.isPending}
                  onGuardar={(blob) => subirFirma.mutate({ email: u.email, blob })}
                />
                <label className="mt-2 block text-xs text-slate-600">
                  …o subir una imagen
                  <input
                    type="file"
                    accept="image/*"
                    disabled={subirFirma.isPending}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) subirFirma.mutate({ email: u.email, blob: f });
                    }}
                    className="mt-1 block w-full text-xs"
                  />
                </label>
                {subirFirma.isError && (
                  <p className="mt-1 text-xs text-red-600">No se pudo guardar la firma.</p>
                )}
              </div>
            )}
```

Sumar los imports que falten: `FirmaCanvas` desde `@/components/ui/FirmaCanvas` y
`logoMembreteUrl` desde `@/lib/drive-url`.

- [ ] **Step 7: Verificar**

Run: `npx vitest run components/ui/FirmaCanvas.test.tsx && npx tsc --noEmit && npm run lint`
Expected: PASS y 0 errores de lint.

---

## Task 9: API de visitas

**Files:**
- Create: `app/api/visitas/route.ts`
- Create: `app/api/visitas/[id]/route.ts`
- Test: `tests/api/visitas.test.ts`
- Modify: `lib/api-client.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/api/visitas.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const { requireSession } = vi.hoisted(() => ({ requireSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireSession }));
vi.mock("@/lib/google-sheets", () => ({
  getVisitas: vi.fn(),
  getVisitaById: vi.fn(),
  appendVisita: vi.fn(),
  deleteVisita: vi.fn(),
  getEdificioFicha: vi.fn(),
  guardarEdificioFicha: vi.fn(),
  getConfiguracion: vi.fn(),
  getUsuarios: vi.fn(),
}));
vi.mock("@/lib/visita-pdf", () => ({ generarYSubirVisitaPdf: vi.fn() }));
vi.mock("@/lib/google-drive", () => ({ trashFileByUrl: vi.fn() }));

import {
  getVisitas,
  getVisitaById,
  appendVisita,
  deleteVisita,
  getEdificioFicha,
  guardarEdificioFicha,
  getConfiguracion,
  getUsuarios,
} from "@/lib/google-sheets";
import { generarYSubirVisitaPdf } from "@/lib/visita-pdf";
import { trashFileByUrl } from "@/lib/google-drive";
import { GET, POST } from "@/app/api/visitas/route";
import { DELETE } from "@/app/api/visitas/[id]/route";
import { NextRequest } from "next/server";
import { CONFIGURACION_DEFAULT, EDIFICIO_FICHA_VACIA } from "@/types";

const PDF_URL = "https://drive.google.com/file/d/pdf1/view";
const post = (body: unknown) =>
  new NextRequest("http://localhost/api/visitas", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue({ user: { email: "sup@x.com", rol: "supervisor" } });
  vi.mocked(getVisitas).mockResolvedValue([]);
  vi.mocked(getConfiguracion).mockResolvedValue(CONFIGURACION_DEFAULT);
  vi.mocked(getUsuarios).mockResolvedValue([
    { email: "sup@x.com", nombre: "Supervisor Uno", rol: "supervisor", activo: true, creadoEn: "" },
  ]);
  vi.mocked(getEdificioFicha).mockResolvedValue({
    edificio: "Castro Barros 1310",
    ...EDIFICIO_FICHA_VACIA,
  });
  vi.mocked(generarYSubirVisitaPdf).mockResolvedValue({ url: PDF_URL, fileId: "pdf1" });
  vi.mocked(appendVisita).mockImplementation(async (i) => ({
    id: "1",
    edificio: i.edificio,
    fecha: "2026-08-08",
    pdfUrl: i.pdfUrl,
    supervisor: i.supervisor,
    creadoEn: "2026-08-08T10:00:00-03:00",
  }));
});

describe("GET /api/visitas", () => {
  it("lista todas las visitas", async () => {
    await GET(new NextRequest("http://localhost/api/visitas"), undefined);
    expect(getVisitas).toHaveBeenCalledWith(undefined);
  });

  it("filtra por edificio cuando viene el query param", async () => {
    await GET(new NextRequest("http://localhost/api/visitas?edificio=Castro%20Barros%201310"), undefined);
    expect(getVisitas).toHaveBeenCalledWith("Castro Barros 1310");
  });
});

describe("POST /api/visitas", () => {
  it("genera el PDF, escribe la fila y guarda la ficha", async () => {
    const res = await POST(
      post({
        edificio: "Castro Barros 1310",
        ficha: { encargado: "Juan" },
        controles: { hall: "Realizada" },
        informeGeneral: "ok",
        fotos: [],
      }),
      undefined
    );
    expect(res.status).toBe(201);
    expect(generarYSubirVisitaPdf).toHaveBeenCalled();
    expect(appendVisita).toHaveBeenCalledWith(
      expect.objectContaining({
        edificio: "Castro Barros 1310",
        pdfUrl: PDF_URL,
        supervisor: "sup@x.com",
      })
    );
    expect(guardarEdificioFicha).toHaveBeenCalledWith(
      "Castro Barros 1310",
      expect.objectContaining({ encargado: "Juan" })
    );
  });

  it("usa el nombre del usuario para la firma del PDF", async () => {
    await POST(post({ edificio: "Castro Barros 1310" }), undefined);
    const args = vi.mocked(generarYSubirVisitaPdf).mock.calls[0][0];
    expect(args.supervisorNombre).toBe("Supervisor Uno");
  });

  it("NO escribe la fila si falla la generación del PDF", async () => {
    vi.mocked(generarYSubirVisitaPdf).mockRejectedValue(new Error("boom"));
    const res = await POST(post({ edificio: "Castro Barros 1310" }), undefined);
    expect(res.status).toBe(500);
    expect(appendVisita).not.toHaveBeenCalled();
    expect(guardarEdificioFicha).not.toHaveBeenCalled();
  });

  it("rechaza sin edificio", async () => {
    const res = await POST(post({ controles: {} }), undefined);
    expect(res.status).toBe(400);
    expect(generarYSubirVisitaPdf).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/visitas/[id]", () => {
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
  const req = () => new NextRequest("http://localhost/api/visitas/1", { method: "DELETE" });

  it("un admin borra la fila y manda el PDF a la papelera", async () => {
    requireSession.mockResolvedValue({ user: { email: "admin@x.com", rol: "admin" } });
    vi.mocked(getVisitaById).mockResolvedValue({
      id: "1",
      edificio: "A",
      fecha: "2026-08-08",
      pdfUrl: PDF_URL,
      supervisor: "sup@x.com",
      creadoEn: "2026-08-08",
    });
    const res = await DELETE(req(), ctx("1"));
    expect(res.status).toBe(200);
    expect(trashFileByUrl).toHaveBeenCalledWith(PDF_URL);
    expect(deleteVisita).toHaveBeenCalledWith("1");
  });

  it("un supervisor recibe 403 y no borra nada", async () => {
    requireSession.mockResolvedValue({ user: { email: "sup@x.com", rol: "supervisor" } });
    const res = await DELETE(req(), ctx("1"));
    expect(res.status).toBe(403);
    expect(deleteVisita).not.toHaveBeenCalled();
    expect(trashFileByUrl).not.toHaveBeenCalled();
  });

  it("404 si la visita no existe", async () => {
    requireSession.mockResolvedValue({ user: { email: "admin@x.com", rol: "admin" } });
    vi.mocked(getVisitaById).mockResolvedValue(null);
    const res = await DELETE(req(), ctx("9"));
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run tests/api/visitas.test.ts`
Expected: FAIL — no se resuelve `@/app/api/visitas/route`.

- [ ] **Step 3: Implementar lista y alta**

Crear `app/api/visitas/route.ts`:

```ts
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/http/withAuth";
import {
  getVisitas,
  appendVisita,
  getEdificioFicha,
  guardarEdificioFicha,
  getConfiguracion,
  getUsuarios,
} from "@/lib/google-sheets";
import { generarYSubirVisitaPdf } from "@/lib/visita-pdf";
import { visitaNuevaSchema } from "@/lib/schemas";
import { displayName } from "@/lib/user-display";
import { nowBuenosAiresISO } from "@/lib/fecha-ar";

export const runtime = "nodejs";
// Generar el PDF con fotos puede tardar: mismo margen que el reporte de tarea.
export const maxDuration = 60;

export const GET = withAuth(async (req) => {
  const edificio = req.nextUrl.searchParams.get("edificio")?.trim() || undefined;
  return NextResponse.json(await getVisitas(edificio));
});

// Crear una visita: se genera el PDF y se sube a Drive; SOLO SI eso funcionó se escribe
// la fila y se actualiza la ficha. Así el historial nunca apunta a un archivo inexistente.
export const POST = withAuth(async (req, session) => {
  const body = await req.json();
  const input = visitaNuevaSchema.parse(body);

  const fecha = nowBuenosAiresISO().slice(0, 10);
  const [fichaPrevia, config, usuarios] = await Promise.all([
    getEdificioFicha(input.edificio),
    getConfiguracion(),
    getUsuarios(),
  ]);

  // La ficha del PDF es la previa pisada con lo que se cargó en el formulario.
  const ficha = { ...fichaPrevia, ...input.ficha, edificio: input.edificio };
  const email = session.user.email.toLowerCase();
  const usuario = usuarios.find((u) => u.email === email);

  const { url } = await generarYSubirVisitaPdf({
    edificio: input.edificio,
    fecha,
    ficha,
    controles: input.controles,
    informeGeneral: input.informeGeneral,
    fotos: input.fotos,
    supervisorNombre: displayName(session.user.email, usuarios),
    firmaUrl: usuario?.firmaUrl,
    config,
  });

  const visita = await appendVisita({
    edificio: input.edificio,
    pdfUrl: url,
    supervisor: session.user.email,
  });
  await guardarEdificioFicha(input.edificio, input.ficha);

  return NextResponse.json(visita, { status: 201 });
});
```

- [ ] **Step 4: Implementar el borrado**

Crear `app/api/visitas/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/http/withAuth";
import { getVisitaById, deleteVisita } from "@/lib/google-sheets";
import { trashFileByUrl } from "@/lib/google-drive";
import { jsonError } from "@/lib/api-utils";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// Borrar es la única forma de corregir una visita mal cargada (los PDF son inmutables):
// el archivo va a la papelera de Drive y la fila se saca de la planilla.
export const DELETE = withAuth<Ctx>(async (_req, session, { params }) => {
  if (session.user.rol !== "admin") {
    return jsonError(403, "Solo un administrador puede eliminar visitas");
  }

  const { id } = await params;
  const visita = await getVisitaById(decodeURIComponent(id));
  if (!visita) return jsonError(404, "Visita no encontrada");

  if (visita.pdfUrl) await trashFileByUrl(visita.pdfUrl);
  await deleteVisita(visita.id);

  return NextResponse.json({ ok: true });
});
```

- [ ] **Step 5: Métodos en el cliente**

En `lib/api-client.ts`, agregar antes de `upload` (y sumar `Visita` y `VisitaNuevaInput` al import
de `@/types`):

```ts
  visitas: {
    list: (edificio?: string) =>
      request<Visita[]>(
        edificio ? `/api/visitas?edificio=${encodeURIComponent(edificio)}` : "/api/visitas"
      ),
    create: (input: VisitaNuevaInput) =>
      request<Visita>("/api/visitas", { method: "POST", body: JSON.stringify(input) }),
    remove: (id: string) =>
      request<{ ok: true }>(`/api/visitas/${encodeURIComponent(id)}`, { method: "DELETE" }),
  },
```

- [ ] **Step 6: Correr y verificar que pasa**

Run: `npx vitest run tests/api/visitas.test.ts && npx tsc --noEmit`
Expected: PASS — 9 tests, sin errores de tipos.

---

## Task 10: Cálculo del panel de consorcios

**Files:**
- Create: `lib/visitas-panel.ts`
- Test: `lib/visitas-panel.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/visitas-panel.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { UMBRAL_ATRASO_DIAS, resumenPorEdificio } from "./visitas-panel";
import type { Visita } from "@/types";

const visita = (edificio: string, fecha: string): Visita => ({
  id: fecha,
  edificio,
  fecha,
  pdfUrl: "https://drive.google.com/file/d/x/view",
  supervisor: "sup@x.com",
  creadoEn: fecha,
});

const HOY = new Date("2026-08-08T12:00:00-03:00").getTime();

describe("resumenPorEdificio", () => {
  it("toma la visita más reciente de cada edificio", () => {
    const r = resumenPorEdificio(
      [{ nombre: "A" }],
      [visita("A", "2026-07-01"), visita("A", "2026-08-01")],
      HOY
    );
    expect(r[0].ultima?.fecha).toBe("2026-08-01");
    expect(r[0].dias).toBe(7);
  });

  it("pone primero los edificios sin ninguna visita", () => {
    const r = resumenPorEdificio(
      [{ nombre: "Con" }, { nombre: "Sin" }],
      [visita("Con", "2026-08-07")],
      HOY
    );
    expect(r.map((x) => x.edificio)).toEqual(["Sin", "Con"]);
    expect(r[0].ultima).toBeNull();
    expect(r[0].dias).toBeNull();
  });

  it("ordena del más atrasado al más reciente", () => {
    const r = resumenPorEdificio(
      [{ nombre: "Nueva" }, { nombre: "Vieja" }, { nombre: "Media" }],
      [visita("Nueva", "2026-08-07"), visita("Vieja", "2026-05-01"), visita("Media", "2026-07-01")],
      HOY
    );
    expect(r.map((x) => x.edificio)).toEqual(["Vieja", "Media", "Nueva"]);
  });

  it("marca como atrasado al que supera el umbral", () => {
    const r = resumenPorEdificio(
      [{ nombre: "A" }, { nombre: "B" }],
      [visita("A", "2026-08-07"), visita("B", "2026-01-01")],
      HOY
    );
    const porNombre = Object.fromEntries(r.map((x) => [x.edificio, x]));
    expect(porNombre.A.atrasado).toBe(false);
    expect(porNombre.B.atrasado).toBe(true);
  });

  it("considera atrasado al que nunca fue visitado", () => {
    const r = resumenPorEdificio([{ nombre: "Sin" }], [], HOY);
    expect(r[0].atrasado).toBe(true);
  });

  it("matchea el edificio de forma tolerante a mayúsculas y acentos", () => {
    const r = resumenPorEdificio(
      [{ nombre: "Av. Belgrano 1429" }],
      [visita("AV. BELGRANO 1429", "2026-08-01")],
      HOY
    );
    expect(r[0].ultima?.fecha).toBe("2026-08-01");
  });

  it("el umbral es de 45 días", () => {
    expect(UMBRAL_ATRASO_DIAS).toBe(45);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run lib/visitas-panel.test.ts`
Expected: FAIL — no se resuelve `./visitas-panel`.

- [ ] **Step 3: Implementar**

Crear `lib/visitas-panel.ts`:

```ts
// Resumen del panel de visitas: para cada consorcio, cuándo fue la última y hace cuánto.
// Lógica PURA (sin IO), para poder testearla sin tocar Sheets.

import type { Edificio, Visita } from "@/types";
import { edificioMatches } from "./sheets/edificios";

// A partir de este atraso el consorcio se resalta. Es una constante, no configuración:
// la frecuencia la decide el administrador y la app solo señala (decisión 11 del spec).
export const UMBRAL_ATRASO_DIAS = 45;

const MS_POR_DIA = 24 * 60 * 60 * 1000;

export interface ResumenVisitas {
  edificio: string;
  ultima: Visita | null;
  dias: number | null; // null = nunca visitado
  atrasado: boolean;
}

export function resumenPorEdificio(
  edificios: Edificio[],
  visitas: Visita[],
  now: number = Date.now()
): ResumenVisitas[] {
  const filas: ResumenVisitas[] = edificios.map((e) => {
    const suyas = visitas
      .filter((v) => edificioMatches(v.edificio, e.nombre))
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
    const ultima = suyas[0] ?? null;
    const dias = ultima ? diasDesde(ultima.fecha, now) : null;
    return {
      edificio: e.nombre,
      ultima,
      dias,
      atrasado: dias === null || dias > UMBRAL_ATRASO_DIAS,
    };
  });

  // Sin visitas primero; después, del más atrasado al más reciente.
  return filas.sort((a, b) => {
    if (a.dias === null && b.dias === null) return a.edificio.localeCompare(b.edificio);
    if (a.dias === null) return -1;
    if (b.dias === null) return 1;
    return b.dias - a.dias;
  });
}

function diasDesde(fechaISO: string, now: number): number {
  const [y, m, d] = fechaISO.slice(0, 10).split("-").map(Number);
  // Mediodía UTC: evita que el desfasaje horario corra el resultado un día.
  const ts = Date.UTC(y, (m ?? 1) - 1, d ?? 1, 12);
  return Math.max(0, Math.floor((now - ts) / MS_POR_DIA));
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run lib/visitas-panel.test.ts`
Expected: PASS — 7 tests.

---

## Task 11: Formulario de visita

**Files:**
- Create: `components/visitas/FotosVisita.tsx`
- Create: `components/visitas/hooks/useVisitaForm.ts`
- Create: `components/visitas/VisitaForm.tsx`
- Create: `app/(app)/visitas/nueva/page.tsx`
- Test: `components/visitas/VisitaForm.test.tsx`

> **Por qué un componente de fotos propio y no `FileUploader`:** ese está atado al modelo de
> tarea (pide `objetivo`, `dpto`, `rowId` y separa imágenes/videos/documentos). Una visita solo
> sube fotos y solo necesita el edificio. Adaptarlo sería más invasivo que escribir 60 líneas.

- [ ] **Step 1: Escribir el test que falla**

Crear `components/visitas/VisitaForm.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { VisitaForm } from "./VisitaForm";
import { EDIFICIO_FICHA_VACIA } from "@/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/api-client", () => ({
  api: {
    edificios: { list: vi.fn() },
    visitas: { create: vi.fn() },
    configuracion: { get: vi.fn() },
  },
}));
vi.mock("./FotosVisita", () => ({
  FotosVisita: () => <div data-testid="fotos-visita" />,
}));

import { api } from "@/lib/api-client";

// La ficha se pide con fetch directo (no pasa por api-client).
const fetchMock = vi.fn();

function renderForm() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <VisitaForm />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.edificios.list).mockResolvedValue([{ nombre: "Castro Barros 1310" }]);
  vi.mocked(api.visitas.create).mockResolvedValue({
    id: "1",
    edificio: "Castro Barros 1310",
    fecha: "2026-08-08",
    pdfUrl: "https://drive.google.com/file/d/x/view",
    supervisor: "sup@x.com",
    creadoEn: "2026-08-08",
  });
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ edificio: "Castro Barros 1310", ...EDIFICIO_FICHA_VACIA, encargado: "Juan" }),
  });
  vi.stubGlobal("fetch", fetchMock);
});

describe("VisitaForm", () => {
  it("no deja guardar sin edificio elegido", async () => {
    renderForm();
    expect(await screen.findByRole("button", { name: /guardar y generar pdf/i })).toBeDisabled();
  });

  it("muestra los 15 controles en dos bloques", async () => {
    renderForm();
    expect(await screen.findByText("Sectores")).toBeInTheDocument();
    expect(screen.getByText("Instalaciones")).toBeInTheDocument();
    expect(screen.getAllByRole("radio", { name: /^realizada$/i })).toHaveLength(15);
  });

  it("precarga la ficha al elegir el edificio", async () => {
    const user = userEvent.setup();
    renderForm();
    await screen.findByRole("option", { name: "Castro Barros 1310" });
    await user.selectOptions(screen.getByLabelText("Edificio"), "Castro Barros 1310");
    // "Datos del edificio" arranca colapsada y CollapsibleSection desmonta su contenido.
    await user.click(screen.getByRole("button", { name: /datos del edificio/i }));
    await waitFor(() => expect(screen.getByLabelText(/^encargado$/i)).toHaveValue("Juan"));
  });

  it("manda edificio, ficha y controles al guardar", async () => {
    const user = userEvent.setup();
    renderForm();
    await screen.findByRole("option", { name: "Castro Barros 1310" });
    await user.selectOptions(screen.getByLabelText("Edificio"), "Castro Barros 1310");
    // "Datos del edificio" arranca colapsada y CollapsibleSection desmonta su contenido.
    await user.click(screen.getByRole("button", { name: /datos del edificio/i }));
    await waitFor(() => expect(screen.getByLabelText(/^encargado$/i)).toHaveValue("Juan"));

    await user.click(screen.getAllByRole("radio", { name: /^realizada$/i })[0]);
    await user.click(screen.getByRole("button", { name: /guardar y generar pdf/i }));

    await waitFor(() => expect(api.visitas.create).toHaveBeenCalled());
    const enviado = vi.mocked(api.visitas.create).mock.calls[0][0];
    expect(enviado.edificio).toBe("Castro Barros 1310");
    expect(enviado.ficha.encargado).toBe("Juan");
    expect(enviado.controles.hall).toBe("Realizada");
  });

  it("avisa si falla la generación del PDF", async () => {
    vi.mocked(api.visitas.create).mockRejectedValue(new Error("No se pudo generar el PDF"));
    const user = userEvent.setup();
    renderForm();
    await screen.findByRole("option", { name: "Castro Barros 1310" });
    await user.selectOptions(screen.getByLabelText("Edificio"), "Castro Barros 1310");
    await user.click(screen.getByRole("button", { name: /guardar y generar pdf/i }));
    expect(await screen.findByText(/no se pudo generar el pdf/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run components/visitas/VisitaForm.test.tsx`
Expected: FAIL — no se resuelve `./VisitaForm`.

- [ ] **Step 3: Endpoint de la ficha**

El formulario necesita leer la ficha del edificio elegido. Crear
`app/api/edificio-ficha/route.ts`:

```ts
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/http/withAuth";
import { getEdificioFicha } from "@/lib/google-sheets";
import { jsonError } from "@/lib/api-utils";

export const runtime = "nodejs";

// Datos fijos del consorcio, para precargar el formulario de visita.
export const GET = withAuth(async (req) => {
  const edificio = req.nextUrl.searchParams.get("edificio")?.trim();
  if (!edificio) return jsonError(400, "Falta el parámetro edificio");
  return NextResponse.json(await getEdificioFicha(edificio));
});
```

- [ ] **Step 4: Componente de fotos**

Crear `components/visitas/FotosVisita.tsx`:

```tsx
"use client";

import { useState } from "react";
import Image from "next/image";
import { Camera, Loader2, X } from "lucide-react";
import { thumbUrl } from "@/lib/drive-url";

interface Props {
  edificio: string;
  fotos: string[];
  onChange: (fotos: string[]) => void;
  disabled?: boolean;
}

// Fotos de la visita: se suben a Drive apenas se eligen y el PDF las embebe por URL.
// No se listan en la planilla (decisión 6 del spec): viven en el PDF y en la carpeta.
export function FotosVisita({ edificio, fotos, onChange, disabled }: Props) {
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subir = async (files: FileList) => {
    setSubiendo(true);
    setError(null);
    try {
      const nuevas: string[] = [];
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        form.append("destino", "visita");
        form.append("edificio", edificio);
        const res = await fetch("/api/upload", { method: "POST", body: form });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? "No se pudo subir la foto");
        }
        const { url } = (await res.json()) as { url: string };
        nuevas.push(url);
      }
      onChange([...fotos, ...nuevas]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir la foto");
    } finally {
      setSubiendo(false);
    }
  };

  return (
    <div>
      <label className="flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
        {subiendo ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
        Agregar fotos
        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          disabled={disabled || subiendo || !edificio}
          onChange={(e) => {
            if (e.target.files?.length) subir(e.target.files);
            e.target.value = "";
          }}
        />
      </label>

      {!edificio && <p className="mt-1 text-xs text-slate-500">Elegí primero el edificio.</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}

      {fotos.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {fotos.map((url) => (
            <li key={url} className="relative">
              <Image
                src={thumbUrl(url, 200)}
                alt=""
                width={80}
                height={80}
                unoptimized
                className="h-20 w-20 rounded-lg border border-slate-200 object-cover"
              />
              <button
                type="button"
                onClick={() => onChange(fotos.filter((f) => f !== url))}
                aria-label="Quitar foto"
                className="absolute -right-1.5 -top-1.5 rounded-full bg-white p-0.5 text-slate-500 shadow hover:text-red-600"
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Hook del formulario**

Crear `components/visitas/hooks/useVisitaForm.ts`:

```ts
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { EDIFICIO_FICHA_VACIA, type EdificioFicha } from "@/types";

type DatosFicha = Omit<EdificioFicha, "edificio" | "actualizadoEn">;

export function useVisitaForm() {
  const router = useRouter();
  const [edificio, setEdificio] = useState("");
  const [ficha, setFicha] = useState<DatosFicha>({ ...EDIFICIO_FICHA_VACIA });
  const [controles, setControles] = useState<Record<string, "Realizada" | "No realizada">>({});
  const [informeGeneral, setInformeGeneral] = useState("");
  const [fotos, setFotos] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const edificiosQ = useQuery({
    queryKey: ["edificios"],
    queryFn: api.edificios.list,
    staleTime: 5 * 60_000,
  });

  // Al elegir el edificio se traen sus datos fijos para no reescribirlos (decisión 2).
  const fichaQ = useQuery({
    queryKey: ["edificio-ficha", edificio],
    enabled: !!edificio,
    queryFn: async (): Promise<EdificioFicha> => {
      const res = await fetch(`/api/edificio-ficha?edificio=${encodeURIComponent(edificio)}`);
      if (!res.ok) throw new Error("No se pudo cargar la ficha del edificio");
      return res.json();
    },
  });

  useEffect(() => {
    if (!fichaQ.data) return;
    const { edificio: _e, actualizadoEn: _a, ...datos } = fichaQ.data;
    setFicha(datos);
  }, [fichaQ.data]);

  const guardar = useMutation({
    mutationFn: () =>
      api.visitas.create({ edificio, ficha, controles, informeGeneral, fotos }),
    onSuccess: () => {
      setError(null);
      router.push("/informes?tab=visitas");
    },
    onError: (e: Error) => setError(e.message),
  });

  const setControl = (clave: string, valor: "Realizada" | "No realizada") =>
    setControles((c) => ({ ...c, [clave]: valor }));

  const setCampoFicha = (campo: keyof DatosFicha, valor: string) =>
    setFicha((f) => ({ ...f, [campo]: valor }));

  return {
    edificio,
    setEdificio,
    edificios: edificiosQ.data ?? [],
    ficha,
    setCampoFicha,
    cargandoFicha: fichaQ.isFetching,
    controles,
    setControl,
    informeGeneral,
    setInformeGeneral,
    fotos,
    setFotos,
    guardar,
    error,
  };
}
```

- [ ] **Step 6: El formulario**

Crear `components/visitas/VisitaForm.tsx`:

```tsx
"use client";

import { Loader2, Save } from "lucide-react";
import { BLOQUES_VISITA } from "@/lib/visitas-items";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import { FotosVisita } from "./FotosVisita";
import { useVisitaForm } from "./hooks/useVisitaForm";
import type { EdificioFicha } from "@/types";

type CampoFicha = keyof Omit<EdificioFicha, "edificio" | "actualizadoEn">;

const CAMPOS_FICHA: Array<[CampoFicha, string]> = [
  ["seguroPoliza", "Seguro - Póliza"],
  ["ascensores", "Ascensores"],
  ["fumigacion", "Fumigación"],
  ["empresaMatafuegoVenc", "Empresa Matafuego. Venc."],
  ["encargado", "Encargado"],
  ["calderaTermotanque", "Caldera o Termotanque"],
  ["empresaLimpieza", "Emp. de Limpieza"],
  ["horarioTrabajo", "Horario de trab."],
  ["encargadoLimpiezaHs", "Encargado o limpieza y hs de trab."],
];

export function VisitaForm() {
  const {
    edificio, setEdificio, edificios,
    ficha, setCampoFicha, cargandoFicha,
    controles, setControl,
    informeGeneral, setInformeGeneral,
    fotos, setFotos,
    guardar, error,
  } = useVisitaForm();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        guardar.mutate();
      }}
      className="mx-auto w-full max-w-3xl px-4 py-4 md:px-8 md:py-6"
    >
      <h2 className="text-xl font-semibold text-slate-900">Visita / Control</h2>
      <p className="text-sm text-slate-600">
        Al guardar se genera el PDF de la visita y queda archivado en Drive.
      </p>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Edificio</span>
          <select
            value={edificio}
            onChange={(e) => setEdificio(e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-2 py-2"
          >
            <option value="">Elegí un edificio…</option>
            {edificios.map((e) => (
              <option key={e.nombre} value={e.nombre}>{e.nombre}</option>
            ))}
          </select>
        </label>
        <p className="mt-2 text-xs text-slate-500">
          La fecha de la visita es la de hoy y la asigna el sistema.
        </p>
      </div>

      {/* Los datos del edificio arrancan colapsados: se precargan solos y casi nunca se tocan.
          Los bloques de control y el informe arrancan abiertos: son lo que se completa. */}
      <CollapsibleSection title="Datos del edificio">
        {cargandoFicha && <p className="text-sm text-slate-500">Cargando datos…</p>}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {CAMPOS_FICHA.map(([campo, label]) => (
            <label key={campo} className="block text-sm">
              <span className="mb-1 block text-slate-600">{label}</span>
              <input
                type="text"
                value={ficha[campo]}
                onChange={(e) => setCampoFicha(campo, e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-2 py-2"
              />
            </label>
          ))}
        </div>
      </CollapsibleSection>

      {BLOQUES_VISITA.map((bloque) => (
        <CollapsibleSection key={bloque.titulo} title={bloque.titulo} defaultOpen>
          <ul className="divide-y divide-slate-100">
            {bloque.items.map((item) => (
              <li key={item.clave} className="flex items-center justify-between gap-3 py-2">
                <span className="text-sm text-slate-800">{item.label}</span>
                <div className="flex shrink-0 gap-3">
                  {(["Realizada", "No realizada"] as const).map((valor) => (
                    <label key={valor} className="flex items-center gap-1 text-xs text-slate-600">
                      <input
                        type="radio"
                        name={item.clave}
                        aria-label={valor}
                        checked={controles[item.clave] === valor}
                        onChange={() => setControl(item.clave, valor)}
                      />
                      {valor}
                    </label>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      ))}

      <CollapsibleSection title="Informe general" defaultOpen>
        <textarea
          value={informeGeneral}
          onChange={(e) => setInformeGeneral(e.target.value)}
          rows={5}
          className="w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm"
        />
      </CollapsibleSection>

      <CollapsibleSection title={`Fotos (${fotos.length})`}>
        <FotosVisita edificio={edificio} fotos={fotos} onChange={setFotos} />
      </CollapsibleSection>

      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <button
          type="submit"
          disabled={!edificio || guardar.isPending}
          className="flex items-center gap-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60 disabled:hover:bg-slate-900"
        >
          {guardar.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Guardar y generar PDF
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 7: La página**

Crear `app/(app)/visitas/nueva/page.tsx`:

```tsx
import { VisitaForm } from "@/components/visitas/VisitaForm";

export default function VisitaNuevaPage() {
  return <VisitaForm />;
}
```

- [ ] **Step 8: Correr y verificar que pasa**

Run: `npx vitest run components/visitas/VisitaForm.test.tsx`
Expected: PASS — 5 tests.

Nota: `CollapsibleSection` **desmonta** su contenido cuando está cerrada (`{open && …}`), por eso
los bloques de control, el informe y las fotos llevan `defaultOpen` — si no, los 15 radios no
estarían en el DOM. El test de precarga busca el campo "Encargado", que vive en la sección
colapsada: hay que abrirla antes con
`await user.click(screen.getByRole("button", { name: /datos del edificio/i }))`.

---

## Task 12: Pestañas Informes/Visitas, panel e historial

**Files:**
- Create: `components/visitas/PanelVisitas.tsx`
- Test: `components/visitas/PanelVisitas.test.tsx`
- Modify: `app/(app)/informes/page.tsx`
- Modify: `components/layout/AppShell.tsx:31-38`

- [ ] **Step 1: Escribir el test que falla**

Crear `components/visitas/PanelVisitas.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PanelVisitas } from "./PanelVisitas";
import type { Visita } from "@/types";

vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { rol: "admin" } } }) }));
vi.mock("@/lib/api-client", () => ({
  api: { edificios: { list: vi.fn() }, visitas: { list: vi.fn(), remove: vi.fn() } },
}));

import { api } from "@/lib/api-client";

const visita = (edificio: string, fecha: string): Visita => ({
  id: `${edificio}-${fecha}`,
  edificio,
  fecha,
  pdfUrl: `https://drive.google.com/file/d/${fecha}/view`,
  supervisor: "sup@x.com",
  creadoEn: fecha,
});

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PanelVisitas />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.edificios.list).mockResolvedValue([{ nombre: "Con visitas" }, { nombre: "Sin visitas" }]);
  vi.mocked(api.visitas.list).mockResolvedValue([visita("Con visitas", "2026-08-01")]);
});

describe("PanelVisitas", () => {
  it("lista los consorcios y marca los que no tienen visitas", async () => {
    renderPanel();
    expect(await screen.findByText("Sin visitas")).toBeInTheDocument();
    expect(screen.getByText("Con visitas")).toBeInTheDocument();
    expect(screen.getAllByText(/sin visitas registradas/i).length).toBeGreaterThan(0);
  });

  it("al elegir un consorcio muestra su historial de PDFs", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByRole("button", { name: /con visitas/i }));
    const link = await screen.findByRole("link", { name: /01\/08\/2026/ });
    expect(link).toHaveAttribute("href", "https://drive.google.com/file/d/2026-08-01/view");
  });

  it("tiene un acceso para registrar una visita nueva", async () => {
    renderPanel();
    expect(await screen.findByRole("link", { name: /nueva visita/i })).toHaveAttribute(
      "href",
      "/visitas/nueva"
    );
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run components/visitas/PanelVisitas.test.tsx`
Expected: FAIL — no se resuelve `./PanelVisitas`.

- [ ] **Step 3: Implementar el panel**

Crear `components/visitas/PanelVisitas.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Loader2, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { resumenPorEdificio } from "@/lib/visitas-panel";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { Visita } from "@/types";

const fmt = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

export function PanelVisitas() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.rol === "admin";
  const qc = useQueryClient();
  const [elegido, setElegido] = useState<string | null>(null);
  const [aBorrar, setABorrar] = useState<Visita | null>(null);

  const edificiosQ = useQuery({
    queryKey: ["edificios"],
    queryFn: api.edificios.list,
    staleTime: 5 * 60_000,
  });
  const visitasQ = useQuery({ queryKey: ["visitas"], queryFn: () => api.visitas.list() });

  const resumen = useMemo(
    () => resumenPorEdificio(edificiosQ.data ?? [], visitasQ.data ?? []),
    [edificiosQ.data, visitasQ.data]
  );

  const historial = useMemo(
    () =>
      (visitasQ.data ?? [])
        .filter((v) => v.edificio === elegido)
        .sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [visitasQ.data, elegido]
  );

  const eliminar = useMutation({
    mutationFn: (id: string) => api.visitas.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["visitas"] });
      setABorrar(null);
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">
          Última visita de cada consorcio. Tocá uno para ver su historial.
        </p>
        <Link
          href="/visitas/nueva"
          className="flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          <Plus size={16} /> Nueva visita
        </Link>
      </div>

      <ul className="mt-4 space-y-2">
        {resumen.map((r) => (
          <li key={r.edificio}>
            <button
              type="button"
              onClick={() => setElegido(elegido === r.edificio ? null : r.edificio)}
              className={cn(
                "flex w-full items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3 text-left transition",
                r.atrasado ? "border-red-300 bg-red-50" : "border-slate-200 hover:border-slate-300"
              )}
            >
              <span className="min-w-0 flex-1 truncate font-medium text-slate-900">{r.edificio}</span>
              <span className={cn("shrink-0 text-sm", r.atrasado ? "text-red-700" : "text-slate-600")}>
                {r.ultima
                  ? `${fmt(r.ultima.fecha)} · hace ${r.dias} día${r.dias === 1 ? "" : "s"}`
                  : "Sin visitas registradas"}
              </span>
            </button>

            {elegido === r.edificio && (
              <ul className="mt-1 space-y-1 rounded-xl border border-slate-200 bg-slate-50 p-3">
                {historial.length === 0 && (
                  <li className="text-sm text-slate-500">Este consorcio todavía no tiene visitas.</li>
                )}
                {historial.map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-2">
                    <a
                      href={v.pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-slate-800 hover:underline"
                    >
                      <FileText size={14} className="shrink-0 text-slate-500" />
                      {fmt(v.fecha)}
                    </a>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => setABorrar(v)}
                        aria-label="Eliminar visita"
                        className="rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      >
                        {eliminar.isPending && eliminar.variables === v.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Trash2 size={14} />
                        )}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={!!aBorrar}
        title="Eliminar visita"
        message={`Se va a eliminar la visita del ${aBorrar ? fmt(aBorrar.fecha) : ""} y su PDF se moverá a la papelera de Drive (recuperable). ¿Confirmás?`}
        loading={eliminar.isPending}
        onConfirm={() => aBorrar && eliminar.mutate(aBorrar.id)}
        onCancel={() => setABorrar(null)}
      />
    </div>
  );
}
```

- [ ] **Step 4: Pestañas en la página**

Reemplazar `app/(app)/informes/page.tsx` por:

```tsx
"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { InformeEdificio } from "@/components/informes/InformeEdificio";
import { PanelVisitas } from "@/components/visitas/PanelVisitas";

type Tab = "tareas" | "visitas";

export default function InformesPage() {
  const [tab, setTab] = useState<Tab>("tareas");

  return (
    <div>
      <div className="border-b border-slate-200 bg-white px-4 md:px-8">
        <div className="mx-auto flex w-full max-w-5xl gap-1">
          {(
            [
              ["tareas", "Tareas"],
              ["visitas", "Visitas"],
            ] as Array<[Tab, string]>
          ).map(([valor, label]) => (
            <button
              key={valor}
              type="button"
              onClick={() => setTab(valor)}
              className={cn(
                "-mb-px border-b-2 px-4 py-3 text-sm font-medium transition",
                tab === valor
                  ? "border-slate-900 text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === "tareas" ? (
        <InformeEdificio />
      ) : (
        <div className="mx-auto w-full max-w-5xl px-4 py-4 md:px-8 md:py-6">
          <h2 className="text-xl font-semibold text-slate-900">Visitas</h2>
          <PanelVisitas />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Renombrar la entrada del sidebar**

En `components/layout/AppShell.tsx`, cambiar el label del ítem de informes:

```tsx
  { href: "/informes", label: "Informes/Visitas", Icon: FileText, drawerOnly: true },
```

- [ ] **Step 6: Correr y verificar que pasa**

Run: `npx vitest run components/visitas components/layout/AppShell.test.tsx`
Expected: PASS. Si algún test del shell buscaba el texto exacto "Informes", actualizarlo a
"Informes/Visitas" (los tests usan `/informes/i`, que sigue matcheando).

---

## Task 13: Documentación y verificación final

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Entrada en el CHANGELOG**

Al principio de la lista `### Added` de `## [Unreleased]`:

```markdown
- **Visitas de control por edificio**: formulario con los campos del parte en papel (datos del
  consorcio, 15 controles por sector marcados *Realizada / No realizada*, informe general y
  fotos) que al guardar **genera un PDF y lo archiva** en Drive, en
  `Tareas/{Edificio}/Visitas/`, con el nombre `VISITA - DD-MM-AAAA - Edificio.pdf`. Los datos del
  formulario **no se guardan en la planilla**: viven en el PDF. En la hoja `Visitas` queda el
  índice del historial (edificio, fecha y link). Los 9 datos fijos del consorcio se recuerdan en
  la hoja `EdificioFicha` y precargan la visita siguiente. Nueva pestaña **Visitas** dentro de
  **Informes/Visitas**, con el panel de todos los consorcios ordenados por antigüedad de la última
  visita (se resaltan los de más de 45 días) y el historial de PDFs de cada uno. Los PDF son
  inmutables: para corregir una visita se carga de nuevo y **solo el admin** puede eliminar la
  errónea. La **firma del supervisor** se carga desde Usuarios (dibujándola o subiendo una imagen)
  y se estampa en el PDF
```

- [ ] **Step 2: Suite completa**

Run: `npm test`
Expected: todo verde (424 previos + los nuevos).

- [ ] **Step 3: Tipos**

Run: `npx tsc --noEmit`
Expected: sin salida.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: 0 errores (siguen los 5 warnings preexistentes de `react-hooks/set-state-in-effect`).

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: build exitoso, con `/visitas/nueva`, `/api/visitas`, `/api/visitas/[id]` y
`/api/edificio-ficha` en el listado de rutas.

- [ ] **Step 6: Checkpoint final**

Avisar "listo para commitear" con el resumen de archivos tocados. **No ejecutar `git commit`.**

---

## Prerrequisito manual (Jony, fuera del código)

Crear en la planilla **dos hojas nuevas** con la fila 1 de headers exactos:

- **`Visitas`** — `id`, `edificio`, `fecha`, `pdf_url`, `supervisor`, `creado_en` (con `id` en A).
- **`EdificioFicha`** — `edificio`, `seguro_poliza`, `ascensores`, `fumigacion`,
  `empresa_matafuego_venc`, `encargado`, `caldera_termotanque`, `empresa_limpieza`,
  `horario_trabajo`, `encargado_limpieza_hs`, `actualizado_en`.

Y en la hoja **`Usuarios`**, agregar la columna **`firma_url`** (columna G).

Sin las hojas, la pestaña Visitas se ve vacía y guardar una visita falla con un error claro.
