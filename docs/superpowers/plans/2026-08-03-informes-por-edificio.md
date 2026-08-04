# Informes por edificio — Implementation Plan

> **Para agentes:** ejecutar con `superpowers:executing-plans` (ejecución inline, por bloques).
> Los pasos usan checkbox (`- [ ]`) para tracking.
>
> **Regla del repo: NO se ejecuta `git commit`.** Los commits los hace Jony con GitLens. Donde un
> plan normal diría "commit", acá va un **checkpoint**: dejar el árbol verde y avisar.

**Goal:** Sección Informes que arma, por edificio y rango de fechas, un informe con membrete y las
tareas agrupadas en Pendientes / En Proceso / Realizadas, exportable a PDF descargable.

**Architecture:** Una función pura (`lib/informes.ts`) agrupa y ordena las tareas y resuelve el
comentario a mostrar; la comparten la vista web y el generador de PDF, así no pueden divergir. La
vista consume el endpoint de tareas que ya existe. El PDF se arma server-side con
`@react-pdf/renderer` en un endpoint propio que responde el archivo como descarga, sin tocar Drive.
El membrete sale de la hoja `Configuracion` (clave/valor), leída con el cache que ya existe.

**Tech Stack:** Next 16 (App Router), React 19, TypeScript estricto, Zod, TanStack Query,
`@react-pdf/renderer`, Tailwind v4, Vitest + Testing Library.

**Spec:** [`../specs/2026-08-03-informes-por-edificio-design.md`](../specs/2026-08-03-informes-por-edificio-design.md)

---

## Estructura de archivos

**Se crean:**

| Archivo | Responsabilidad |
|---|---|
| `lib/informes.ts` | Agrupado, orden, comentario en cascada y nombre de archivo. Puro, sin IO |
| `lib/informes.test.ts` | Test colocado del anterior |
| `lib/informe-pdf.tsx` | Renderiza el componente PDF a buffer (aísla el IO del route) |
| `components/pdf/InformeEdificioPdf.tsx` | Documento PDF: membrete + tablas |
| `app/api/informes/pdf/route.ts` | `GET` que devuelve el PDF como descarga |
| `tests/api/informes-pdf.test.ts` | Test del endpoint |
| `app/(app)/informes/page.tsx` | Página de la sección (client component) |
| `components/informes/InformeEdificio.tsx` | Vista: controles + membrete + tablas |
| `components/informes/MembreteHeader.tsx` | Membrete en pantalla |
| `components/informes/TablaGrupo.tsx` | Una tabla de grupo |
| `components/informes/hooks/useInforme.ts` | Estado, query de tareas y descarga del PDF |
| `components/informes/InformeEdificio.test.tsx` | Test colocado de la vista |

**Se modifican:**

| Archivo | Cambio |
|---|---|
| `types/index.ts` | 5 campos de membrete en `Configuracion` + defaults |
| `lib/schemas.ts` | `configuracionSchema` acepta los campos de membrete |
| `lib/sheets/config.ts` | Lee y escribe las 5 claves nuevas |
| `lib/demo-data.ts` | `CONFIG` demo con membrete de ejemplo |
| `components/configuracion/ConfiguracionForm.tsx` | Sección "Membrete de los informes" |
| `components/layout/AppShell.tsx` | Flag `drawerOnly` + ítem "Informes" |
| `components/layout/AppShell.test.tsx` | Casos del ítem nuevo |
| `CHANGELOG.md` | Entrada en Unreleased |

---

## Task 1: Agrupado y orden (lógica pura)

**Files:**
- Create: `lib/informes.ts`
- Test: `lib/informes.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/informes.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { agruparParaInforme, comentarioMasReciente, nombreArchivoInforme } from "./informes";
import type { Tarea } from "@/types";

const tarea = (over: Partial<Tarea> = {}): Tarea => ({
  rowId: "2026-07-01T10:00:00.000Z",
  objetivo: "x",
  fechaInicio: "2026-07-01",
  fechaEstimada: "",
  edificio: "Castro Barros 1310",
  parteComun: false,
  dpto: "1A",
  informe: "algo",
  imagenes: [],
  videos: [],
  documentos: [],
  estado: "Sin asignar",
  prioridad: "Media",
  supervisor: "sup@x.com",
  ...over,
});

describe("agruparParaInforme", () => {
  it("devuelve siempre los tres grupos en orden fijo", () => {
    const grupos = agruparParaInforme([]);
    expect(grupos.map((g) => g.grupo)).toEqual(["Pendientes", "En Proceso", "Realizadas"]);
  });

  it("mapea cada estado a su grupo", () => {
    const grupos = agruparParaInforme([
      tarea({ rowId: "1", estado: "Sin asignar" }),
      tarea({ rowId: "2", estado: "Asignada" }),
      tarea({ rowId: "3", estado: "Aceptada" }),
      tarea({ rowId: "4", estado: "En Proceso" }),
      tarea({ rowId: "5", estado: "En Revisión" }),
      tarea({ rowId: "6", estado: "Objetada" }),
      tarea({ rowId: "7", estado: "Realizada" }),
    ]);
    expect(grupos[0].tareas.map((t) => t.rowId)).toEqual(["1", "2", "3"]);
    expect(grupos[1].tareas.map((t) => t.rowId)).toEqual(["4", "5", "6"]);
    expect(grupos[2].tareas.map((t) => t.rowId)).toEqual(["7"]);
  });

  it("ordena por prioridad y, a igual prioridad, por fechaInicio ascendente", () => {
    const grupos = agruparParaInforme([
      tarea({ rowId: "baja", prioridad: "Baja", fechaInicio: "2026-01-01" }),
      tarea({ rowId: "alta-nueva", prioridad: "Alta", fechaInicio: "2026-06-01" }),
      tarea({ rowId: "alta-vieja", prioridad: "Alta", fechaInicio: "2026-02-01" }),
      tarea({ rowId: "media", prioridad: "Media", fechaInicio: "2026-01-01" }),
    ]);
    expect(grupos[0].tareas.map((t) => t.rowId)).toEqual([
      "alta-vieja",
      "alta-nueva",
      "media",
      "baja",
    ]);
  });

  it("no muta el array recibido", () => {
    const entrada = [
      tarea({ rowId: "b", prioridad: "Baja" }),
      tarea({ rowId: "a", prioridad: "Alta" }),
    ];
    agruparParaInforme(entrada);
    expect(entrada.map((t) => t.rowId)).toEqual(["b", "a"]);
  });
});

describe("comentarioMasReciente", () => {
  it("prioriza la objeción sobre revisión y proceso", () => {
    const c = comentarioMasReciente(
      tarea({ notaObjecion: "falta foto", comentarioRevision: "listo", comentarioEnProceso: "arranco" })
    );
    expect(c).toEqual({ texto: "falta foto", origen: "objecion" });
  });

  it("cae a revisión cuando no hay objeción", () => {
    const c = comentarioMasReciente(tarea({ comentarioRevision: "listo", comentarioEnProceso: "arranco" }));
    expect(c).toEqual({ texto: "listo", origen: "revision" });
  });

  it("cae a en proceso cuando es lo único cargado", () => {
    const c = comentarioMasReciente(tarea({ comentarioEnProceso: "arranco" }));
    expect(c).toEqual({ texto: "arranco", origen: "proceso" });
  });

  it("ignora los campos que son solo espacios", () => {
    const c = comentarioMasReciente(tarea({ notaObjecion: "   ", comentarioEnProceso: "arranco" }));
    expect(c).toEqual({ texto: "arranco", origen: "proceso" });
  });

  it("devuelve vacío cuando no hay ningún comentario", () => {
    expect(comentarioMasReciente(tarea())).toEqual({ texto: "", origen: null });
  });
});

describe("nombreArchivoInforme", () => {
  it("normaliza acentos y espacios del edificio e incluye el rango", () => {
    expect(nombreArchivoInforme("Av. Belgrano 1429", "2026-06-01", "2026-06-30")).toBe(
      "informe-av-belgrano-1429-2026-06-01_2026-06-30.pdf"
    );
  });

  it("omite el rango cuando no hay fechas", () => {
    expect(nombreArchivoInforme("Castro Barros 1310")).toBe("informe-castro-barros-1310.pdf");
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run lib/informes.test.ts`
Expected: FAIL — `Failed to resolve import "./informes"`.

- [ ] **Step 3: Implementar**

Crear `lib/informes.ts`:

```ts
// Armado del informe por edificio. Lógica PURA (sin IO): la comparten la vista web
// (components/informes/*) y el generador de PDF (lib/informe-pdf.tsx), para que lo que
// se ve en pantalla y lo que sale impreso no puedan divergir.

import type { EstadoTarea, Prioridad, Tarea } from "@/types";

export type GrupoInforme = "Pendientes" | "En Proceso" | "Realizadas";

// Orden fijo de los grupos en el informe.
export const GRUPOS_INFORME: GrupoInforme[] = ["Pendientes", "En Proceso", "Realizadas"];

// Los 7 estados del ciclo de vida se consolidan en 3 bloques legibles para quien recibe
// el informe. La columna Estado de cada fila igual muestra el estado exacto.
const GRUPO_POR_ESTADO: Record<EstadoTarea, GrupoInforme> = {
  "Sin asignar": "Pendientes",
  Asignada: "Pendientes",
  Aceptada: "Pendientes",
  "En Proceso": "En Proceso",
  "En Revisión": "En Proceso",
  Objetada: "En Proceso",
  Realizada: "Realizadas",
};

const PESO_PRIORIDAD: Record<Prioridad, number> = { Alta: 0, Media: 1, Baja: 2 };

export interface GrupoTareas {
  grupo: GrupoInforme;
  tareas: Tarea[];
}

// Los tres grupos se devuelven SIEMPRE, aun vacíos; quien renderiza decide si oculta
// los que no tienen filas.
export function agruparParaInforme(tareas: Tarea[]): GrupoTareas[] {
  const porGrupo = new Map<GrupoInforme, Tarea[]>(GRUPOS_INFORME.map((g) => [g, []]));
  for (const t of tareas) {
    const grupo = GRUPO_POR_ESTADO[t.estado] ?? "Pendientes";
    porGrupo.get(grupo)!.push(t);
  }
  return GRUPOS_INFORME.map((grupo) => ({
    grupo,
    tareas: [...porGrupo.get(grupo)!].sort(compararTareas),
  }));
}

function compararTareas(a: Tarea, b: Tarea): number {
  const porPrioridad = PESO_PRIORIDAD[a.prioridad] - PESO_PRIORIDAD[b.prioridad];
  if (porPrioridad !== 0) return porPrioridad;
  return a.fechaInicio.localeCompare(b.fechaInicio);
}

export type OrigenComentario = "objecion" | "revision" | "proceso" | null;

export interface ComentarioInforme {
  texto: string;
  origen: OrigenComentario;
}

// Comentario a mostrar en la columna: el más reciente del ciclo, en cascada.
// Objeción del admin > comentario de revisión > comentario en proceso.
export function comentarioMasReciente(t: Tarea): ComentarioInforme {
  const objecion = t.notaObjecion?.trim();
  if (objecion) return { texto: objecion, origen: "objecion" };
  const revision = t.comentarioRevision?.trim();
  if (revision) return { texto: revision, origen: "revision" };
  const proceso = t.comentarioEnProceso?.trim();
  if (proceso) return { texto: proceso, origen: "proceso" };
  return { texto: "", origen: null };
}

export const ETIQUETA_COMENTARIO: Record<Exclude<OrigenComentario, null>, string> = {
  objecion: "Objeción",
  revision: "Revisión",
  proceso: "En proceso",
};

// Nombre del PDF descargado. Se normaliza a ASCII: los acentos y espacios en un
// Content-Disposition traen problemas de encoding entre navegadores.
export function nombreArchivoInforme(edificio: string, desde?: string, hasta?: string): string {
  const slug = edificio
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // marcas de acento sueltas que deja el NFD
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  const rango = [desde, hasta].filter(Boolean).join("_");
  return rango ? `informe-${slug}-${rango}.pdf` : `informe-${slug}.pdf`;
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run lib/informes.test.ts`
Expected: PASS — 10 tests.

---

## Task 2: Membrete en la hoja Configuracion (lectura y escritura)

**Files:**
- Modify: `types/index.ts`
- Modify: `lib/schemas.ts:127-134`
- Modify: `lib/sheets/config.ts`
- Modify: `lib/demo-data.ts:254-260`
- Test: `tests/lib/google-sheets-crud.test.ts` (agregar casos)

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al final del `describe("getConfiguracion (real)")` en `tests/lib/google-sheets-crud.test.ts`:

```ts
  it("lee las claves del membrete", async () => {
    mockRanges({
      "Configuracion!A2:B": [
        ["max_imagenes", "7"],
        ["membrete_nombre", "Administración Morinigo"],
        ["membrete_email", "contacto@morinigoadm.com"],
        ["membrete_direccion", "Colombres 528 C.A.B.A"],
        ["membrete_telefono", "Tel: 4957-1938 de 13 a 17hs"],
        ["membrete_logo_url", "https://drive.google.com/logo.png"],
      ],
    });
    const cfg = await getConfiguracion();
    expect(cfg.membreteNombre).toBe("Administración Morinigo");
    expect(cfg.membreteEmail).toBe("contacto@morinigoadm.com");
    expect(cfg.membreteDireccion).toBe("Colombres 528 C.A.B.A");
    expect(cfg.membreteTelefono).toBe("Tel: 4957-1938 de 13 a 17hs");
    expect(cfg.membreteLogoUrl).toBe("https://drive.google.com/logo.png");
  });

  it("deja el membrete vacío si la hoja no tiene esas filas", async () => {
    mockRanges({ "Configuracion!A2:B": [["max_imagenes", "7"]] });
    const cfg = await getConfiguracion();
    expect(cfg.membreteNombre).toBe("");
    expect(cfg.membreteLogoUrl).toBe("");
  });
```

Y un `describe` nuevo, después de ese bloque, para la escritura:

```ts
describe("updateConfiguracion (real)", () => {
  it("escribe también las claves del membrete, en un rango que las cubre", async () => {
    mockRanges({});
    await updateConfiguracion({
      maxImagenes: 6,
      maxVideos: 2,
      maxDocumentos: 5,
      maxSizeImagenMB: 10,
      maxSizeVideoMB: 50,
      maxSizePdfMB: 20,
      membreteNombre: "Administración Morinigo",
      membreteEmail: "contacto@morinigoadm.com",
      membreteDireccion: "Colombres 528 C.A.B.A",
      membreteTelefono: "Tel: 4957-1938 de 13 a 17hs",
      membreteLogoUrl: "https://drive.google.com/logo.png",
    });
    const call = valuesUpdate.mock.calls.at(-1)![0];
    expect(call.range).toBe("Configuracion!A2:B12");
    const claves = call.requestBody.values.map((r: [string, unknown]) => r[0]);
    expect(claves).toContain("membrete_nombre");
    expect(claves).toContain("membrete_logo_url");
    expect(call.requestBody.values).toHaveLength(11);
  });
});
```

El spy `valuesUpdate` ya existe en la cabecera del archivo (bloque `vi.hoisted`, línea 5), así que
lo único que falta es sumar `updateConfiguracion` a la lista de imports desde `@/lib/google-sheets`
(la que ya trae `getConfiguracion`).

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run tests/lib/google-sheets-crud.test.ts`
Expected: FAIL — `cfg.membreteNombre` es `undefined` y el rango escrito es `Configuracion!A2:B7`.

- [ ] **Step 3: Agregar los campos al tipo**

En `types/index.ts`, reemplazar la interfaz `Configuracion` y su default:

```ts
export interface Configuracion {
  maxImagenes: number;
  maxVideos: number;
  maxDocumentos: number;
  maxSizeImagenMB: number;
  maxSizeVideoMB: number;
  maxSizePdfMB: number;
  // Membrete de los informes por edificio. Vive en la hoja Configuracion para que cada
  // despliegue cargue su propia marca sin tocar el código. Vacío = no se dibuja.
  membreteNombre: string;
  membreteEmail: string;
  membreteDireccion: string;
  membreteTelefono: string;
  membreteLogoUrl: string;
}

export const CONFIGURACION_DEFAULT: Configuracion = {
  maxImagenes: 10,
  maxVideos: 3,
  maxDocumentos: 5,
  maxSizeImagenMB: 10,
  maxSizeVideoMB: 100,
  maxSizePdfMB: 20,
  membreteNombre: "",
  membreteEmail: "",
  membreteDireccion: "",
  membreteTelefono: "",
  membreteLogoUrl: "",
};
```

- [ ] **Step 4: Leer y escribir las claves nuevas**

En `lib/sheets/config.ts`, dentro de `getConfiguracion`, agregar al objeto `data` después de
`maxSizePdfMB`:

```ts
      membreteNombre: map.get("membrete_nombre") ?? "",
      membreteEmail: map.get("membrete_email") ?? "",
      membreteDireccion: map.get("membrete_direccion") ?? "",
      membreteTelefono: map.get("membrete_telefono") ?? "",
      membreteLogoUrl: map.get("membrete_logo_url") ?? "",
```

Y en `updateConfiguracion`, reemplazar el array `entries` (el tipo cambia porque ahora hay
strings) por:

```ts
  // Se escriben TODAS las claves juntas, en orden fijo: el update pisa el rango completo
  // A2:B{n+1}, así que dejar afuera las del membrete equivaldría a no guardarlas nunca.
  const entries: [string, string | number][] = [
    ["max_imagenes", cfg.maxImagenes],
    ["max_videos", cfg.maxVideos],
    ["max_documentos", cfg.maxDocumentos],
    ["max_size_imagen_mb", cfg.maxSizeImagenMB],
    ["max_size_video_mb", cfg.maxSizeVideoMB],
    ["max_size_pdf_mb", cfg.maxSizePdfMB],
    ["membrete_nombre", cfg.membreteNombre],
    ["membrete_email", cfg.membreteEmail],
    ["membrete_direccion", cfg.membreteDireccion],
    ["membrete_telefono", cfg.membreteTelefono],
    ["membrete_logo_url", cfg.membreteLogoUrl],
  ];
```

- [ ] **Step 5: Aceptar los campos en el schema**

En `lib/schemas.ts`, reemplazar `configuracionSchema`:

```ts
export const configuracionSchema = z.object({
  maxImagenes: z.number().int().min(1),
  maxVideos: z.number().int().min(0),
  maxDocumentos: z.number().int().min(0),
  maxSizeImagenMB: z.number().positive(),
  maxSizeVideoMB: z.number().positive(),
  maxSizePdfMB: z.number().positive(),
  // Membrete: todo opcional. Un despliegue sin marca cargada guarda config igual.
  membreteNombre: z.string().optional().default(""),
  membreteEmail: z.string().optional().default(""),
  membreteDireccion: z.string().optional().default(""),
  membreteTelefono: z.string().optional().default(""),
  membreteLogoUrl: z.string().optional().default(""),
});
```

- [ ] **Step 6: Membrete de ejemplo en modo demo**

En `lib/demo-data.ts`, reemplazar la constante `CONFIG`:

```ts
const CONFIG: Configuracion = {
  maxImagenes: 10,
  maxVideos: 3,
  maxDocumentos: 5,
  maxSizeImagenMB: 10,
  maxSizeVideoMB: 100,
  maxSizePdfMB: 20,
  membreteNombre: "Administración Demo",
  membreteEmail: "contacto@demo.local",
  membreteDireccion: "Av. Siempreviva 742, C.A.B.A",
  membreteTelefono: "Tel: 4000-0000 de 9 a 18hs",
  membreteLogoUrl: "",
};
```

- [ ] **Step 7: Correr los tests y verificar que pasan**

Run: `npx vitest run tests/lib/google-sheets-crud.test.ts tests/lib/schemas.test.ts tests/lib/demo-data.test.ts`
Expected: PASS.

- [ ] **Step 8: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores. Si aparece algún objeto `Configuracion` literal incompleto en tests o
código, completarlo con los 5 campos nuevos en `""`.

---

## Task 3: Editar el membrete desde /configuracion

**Files:**
- Modify: `components/configuracion/ConfiguracionForm.tsx`

- [ ] **Step 1: Agregar el handler de texto**

En `ConfiguracionForm.tsx`, debajo de `handleNumber`:

```ts
  const handleText = (key: keyof Configuracion) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
  };
```

- [ ] **Step 2: Agregar la sección de membrete**

En el mismo archivo, insertar este bloque **después** del `</div>` que cierra el grid de límites
(el que arranca en `<div className="grid grid-cols-1 gap-3 md:grid-cols-2">`) y **antes** del
bloque `{error && (`:

```tsx
      <div className="border-t border-slate-200 pt-4">
        <h3 className="text-sm font-semibold text-slate-900">Membrete de los informes</h3>
        <p className="mt-0.5 text-xs text-slate-500">
          Datos que encabezan el informe por edificio y su PDF. Los campos vacíos no se muestran.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Nombre de la administración">
            <input type="text" value={form.membreteNombre} onChange={handleText("membreteNombre")} className="input" />
          </Field>
          <Field label="Email de contacto">
            <input type="text" value={form.membreteEmail} onChange={handleText("membreteEmail")} className="input" />
          </Field>
          <Field label="Dirección">
            <input type="text" value={form.membreteDireccion} onChange={handleText("membreteDireccion")} className="input" />
          </Field>
          <Field label="Teléfono y horario">
            <input type="text" value={form.membreteTelefono} onChange={handleText("membreteTelefono")} className="input" />
          </Field>
          <Field label="URL del logo" hint="Imagen pública (Drive). Vacío = informe sin logo.">
            <input type="text" value={form.membreteLogoUrl} onChange={handleText("membreteLogoUrl")} className="input" />
          </Field>
        </div>
      </div>
```

- [ ] **Step 3: Verificar tipos y lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores.

---

## Task 4: Documento PDF

**Files:**
- Create: `components/pdf/InformeEdificioPdf.tsx`
- Create: `lib/informe-pdf.tsx`

- [ ] **Step 1: Crear el documento**

Crear `components/pdf/InformeEdificioPdf.tsx`:

```tsx
import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { Configuracion } from "@/types";
import { APP_NAME } from "@/lib/app-name";
import {
  comentarioMasReciente,
  ETIQUETA_COMENTARIO,
  type GrupoInforme,
  type GrupoTareas,
} from "@/lib/informes";

const colors = {
  text: "#0f172a",
  muted: "#64748b",
  border: "#cbd5e1",
  accent: "#7c92aa",
  head: "#e2e8f0",
};

// Fondo por grupo, siguiendo la planilla que la administración usaba a mano.
const FONDO_GRUPO: Record<GrupoInforme, string> = {
  Pendientes: "#fde2e2",
  "En Proceso": "#fdf6c3",
  Realizadas: "#dcfce7",
};

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 9, color: colors.text, fontFamily: "Helvetica" },
  membrete: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  logo: { width: 64, height: 64, marginRight: 12 },
  marca: { flex: 1 },
  nombre: { fontSize: 18, fontFamily: "Helvetica-Bold" },
  contacto: { fontSize: 9, color: colors.muted, marginTop: 2 },
  separador: { borderBottom: `2pt solid ${colors.accent}`, marginBottom: 8 },
  meta: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  metaTexto: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  grupoTitulo: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    marginTop: 10,
    marginBottom: 4,
  },
  fila: { flexDirection: "row", borderBottom: `1pt solid ${colors.border}` },
  celda: { padding: 4 },
  encabezado: { backgroundColor: colors.head, fontFamily: "Helvetica-Bold" },
  vacio: { fontSize: 9, color: colors.muted, marginBottom: 4 },
  footer: {
    position: "absolute",
    bottom: 18,
    left: 32,
    right: 32,
    fontSize: 8,
    color: colors.muted,
    textAlign: "center",
  },
});

// Anchos de columna (suman 100).
const ANCHOS = { dpto: "14%", prioridad: "10%", informe: "34%", comentario: "26%", estado: "16%" };

interface Props {
  edificio: string;
  desde?: string;
  hasta?: string;
  grupos: GrupoTareas[];
  config: Configuracion;
  generatedAt: string;
}

export function InformeEdificioPdf({ edificio, desde, hasta, grupos, config, generatedAt }: Props) {
  const rango = [desde, hasta].filter(Boolean).join(" al ");
  const conFilas = grupos.filter((g) => g.tareas.length > 0);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.membrete}>
          {config.membreteLogoUrl ? (
            // El <Image> de @react-pdf/renderer no soporta `alt` (no es next/image).
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image src={config.membreteLogoUrl} style={styles.logo} />
          ) : null}
          <View style={styles.marca}>
            <Text style={styles.nombre}>{config.membreteNombre || APP_NAME}</Text>
            {config.membreteEmail ? (
              <Text style={styles.contacto}>{config.membreteEmail}</Text>
            ) : null}
            {(config.membreteDireccion || config.membreteTelefono) && (
              <Text style={styles.contacto}>
                {[config.membreteDireccion, config.membreteTelefono].filter(Boolean).join(" · ")}
              </Text>
            )}
          </View>
        </View>
        <View style={styles.separador} />

        <View style={styles.meta}>
          <Text style={styles.metaTexto}>Consorcio: {edificio}</Text>
          {rango ? <Text style={styles.metaTexto}>Período: {rango}</Text> : null}
        </View>

        {conFilas.length === 0 && (
          <Text style={styles.vacio}>No hay tareas registradas para este período.</Text>
        )}

        {conFilas.map(({ grupo, tareas }) => (
          <View key={grupo}>
            <Text style={styles.grupoTitulo}>
              {grupo} ({tareas.length})
            </Text>
            <View style={[styles.fila, styles.encabezado]}>
              <Text style={[styles.celda, { width: ANCHOS.dpto }]}>Dpto</Text>
              <Text style={[styles.celda, { width: ANCHOS.prioridad }]}>Prioridad</Text>
              <Text style={[styles.celda, { width: ANCHOS.informe }]}>Informe</Text>
              <Text style={[styles.celda, { width: ANCHOS.comentario }]}>Comentario</Text>
              <Text style={[styles.celda, { width: ANCHOS.estado }]}>Estado</Text>
            </View>
            {tareas.map((t) => {
              const comentario = comentarioMasReciente(t);
              return (
                <View
                  key={t.rowId}
                  style={[styles.fila, { backgroundColor: FONDO_GRUPO[grupo] }]}
                  wrap={false}
                >
                  <Text style={[styles.celda, { width: ANCHOS.dpto }]}>{t.dpto || "—"}</Text>
                  <Text style={[styles.celda, { width: ANCHOS.prioridad }]}>{t.prioridad}</Text>
                  <Text style={[styles.celda, { width: ANCHOS.informe }]}>{t.informe || "—"}</Text>
                  <Text style={[styles.celda, { width: ANCHOS.comentario }]}>
                    {comentario.origen
                      ? `${ETIQUETA_COMENTARIO[comentario.origen]}: ${comentario.texto}`
                      : "—"}
                  </Text>
                  <Text style={[styles.celda, { width: ANCHOS.estado }]}>{t.estado}</Text>
                </View>
              );
            })}
          </View>
        ))}

        <Text style={styles.footer} fixed>
          Generado el {generatedAt} · {config.membreteNombre || APP_NAME}
        </Text>
      </Page>
    </Document>
  );
}
```

- [ ] **Step 2: Crear el renderizador a buffer**

Crear `lib/informe-pdf.tsx`:

```tsx
import { renderToBuffer } from "@react-pdf/renderer";
import { InformeEdificioPdf } from "@/components/pdf/InformeEdificioPdf";
import { agruparParaInforme } from "./informes";
import type { Configuracion, Tarea } from "@/types";

interface Args {
  edificio: string;
  desde?: string;
  hasta?: string;
  tareas: Tarea[];
  config: Configuracion;
}

// Aísla el render del route handler: el endpoint se testea mockeando este módulo,
// sin levantar @react-pdf/renderer. Espejo de lib/pdf-generator.tsx (que además sube
// a Drive); acá el PDF es efímero y se devuelve como descarga.
export async function renderInformeEdificio({
  edificio,
  desde,
  hasta,
  tareas,
  config,
}: Args): Promise<Buffer> {
  const generatedAt = new Date().toLocaleDateString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
  });
  return renderToBuffer(
    <InformeEdificioPdf
      edificio={edificio}
      desde={desde}
      hasta={hasta}
      grupos={agruparParaInforme(tareas)}
      config={config}
      generatedAt={generatedAt}
    />
  );
}
```

- [ ] **Step 3: Verificar tipos y lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores.

---

## Task 5: Endpoint del PDF

**Files:**
- Create: `app/api/informes/pdf/route.ts`
- Test: `tests/api/informes-pdf.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/api/informes-pdf.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const { requireSession } = vi.hoisted(() => ({ requireSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireSession }));
vi.mock("@/lib/google-sheets", () => ({ getTareas: vi.fn(), getConfiguracion: vi.fn() }));
vi.mock("@/lib/informe-pdf", () => ({ renderInformeEdificio: vi.fn() }));

import { getTareas, getConfiguracion } from "@/lib/google-sheets";
import { renderInformeEdificio } from "@/lib/informe-pdf";
import { GET } from "@/app/api/informes/pdf/route";
import { NextRequest } from "next/server";
import { CONFIGURACION_DEFAULT } from "@/types";

const req = (qs: string) => new NextRequest(`http://localhost/api/informes/pdf${qs}`);

beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue({ user: { email: "sup@x.com", rol: "supervisor" } });
  vi.mocked(getTareas).mockResolvedValue([]);
  vi.mocked(getConfiguracion).mockResolvedValue(CONFIGURACION_DEFAULT);
  vi.mocked(renderInformeEdificio).mockResolvedValue(Buffer.from("%PDF-fake"));
});

describe("GET /api/informes/pdf", () => {
  it("devuelve el PDF como descarga con nombre normalizado", async () => {
    const res = await GET(req("?edificio=Av.%20Belgrano%201429&desde=2026-06-01&hasta=2026-06-30"), undefined);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="informe-av-belgrano-1429-2026-06-01_2026-06-30.pdf"'
    );
  });

  it("pasa el edificio y el rango al filtro de tareas", async () => {
    await GET(req("?edificio=Castro%20Barros%201310&desde=2026-06-01&hasta=2026-06-30"), undefined);
    expect(vi.mocked(getTareas).mock.calls[0][0]).toEqual({
      edificio: "Castro Barros 1310",
      desde: "2026-06-01",
      hasta: "2026-06-30",
    });
  });

  it("rechaza con 400 si falta el edificio", async () => {
    const res = await GET(req("?desde=2026-06-01"), undefined);
    expect(res.status).toBe(400);
    expect(vi.mocked(renderInformeEdificio)).not.toHaveBeenCalled();
  });

  it("es accesible para un supervisor (no es admin-only)", async () => {
    const res = await GET(req("?edificio=Castro%20Barros%201310"), undefined);
    expect(res.status).toBe(200);
  });

  it("propaga 401 si no hay sesión", async () => {
    requireSession.mockRejectedValue(
      new Response(JSON.stringify({ error: "No autenticado" }), { status: 401 })
    );
    const res = await GET(req("?edificio=Castro%20Barros%201310"), undefined);
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run tests/api/informes-pdf.test.ts`
Expected: FAIL — no se resuelve `@/app/api/informes/pdf/route`.

- [ ] **Step 3: Implementar el endpoint**

Crear `app/api/informes/pdf/route.ts`:

```ts
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/http/withAuth";
import { getTareas, getConfiguracion } from "@/lib/google-sheets";
import { renderInformeEdificio } from "@/lib/informe-pdf";
import { nombreArchivoInforme } from "@/lib/informes";
import { jsonError } from "@/lib/api-utils";

export const runtime = "nodejs";
export const maxDuration = 60;

// Informe por edificio en PDF. Accesible a cualquier usuario logueado (admin y supervisor).
// Es efímero: se descarga y no se guarda en Drive ni en la planilla.
export const GET = withAuth(async (req) => {
  const sp = req.nextUrl.searchParams;
  const edificio = sp.get("edificio")?.trim();
  if (!edificio) return jsonError(400, "Falta el parámetro edificio");

  const desde = sp.get("desde")?.trim() || undefined;
  const hasta = sp.get("hasta")?.trim() || undefined;

  const [tareas, config] = await Promise.all([
    getTareas({ edificio, desde, hasta }),
    getConfiguracion(),
  ]);

  const buffer = await renderInformeEdificio({ edificio, desde, hasta, tareas, config });

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nombreArchivoInforme(edificio, desde, hasta)}"`,
    },
  });
});
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run tests/api/informes-pdf.test.ts`
Expected: PASS — 5 tests.

---

## Task 6: Vista /informes

**Files:**
- Create: `components/informes/hooks/useInforme.ts`
- Create: `components/informes/MembreteHeader.tsx`
- Create: `components/informes/TablaGrupo.tsx`
- Create: `components/informes/InformeEdificio.tsx`
- Create: `app/(app)/informes/page.tsx`
- Test: `components/informes/InformeEdificio.test.tsx`

- [ ] **Step 1: Escribir el test que falla**

Crear `components/informes/InformeEdificio.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { InformeEdificio } from "./InformeEdificio";
import type { Tarea } from "@/types";
import { CONFIGURACION_DEFAULT } from "@/types";

vi.mock("@/lib/api-client", () => ({
  api: {
    edificios: { list: vi.fn() },
    tareas: { list: vi.fn() },
    configuracion: { get: vi.fn() },
  },
}));

import { api } from "@/lib/api-client";

const tarea = (over: Partial<Tarea> = {}): Tarea => ({
  rowId: "2026-07-01T10:00:00.000Z",
  objetivo: "x",
  fechaInicio: "2026-07-01",
  fechaEstimada: "",
  edificio: "Castro Barros 1310",
  parteComun: false,
  dpto: "TERRAZA",
  informe: "Impermeabilizar el frente",
  imagenes: [],
  videos: [],
  documentos: [],
  estado: "En Proceso",
  prioridad: "Alta",
  supervisor: "sup@x.com",
  ...over,
});

function renderConQuery() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <InformeEdificio />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.edificios.list).mockResolvedValue([{ nombre: "Castro Barros 1310" }]);
  vi.mocked(api.configuracion.get).mockResolvedValue({
    ...CONFIGURACION_DEFAULT,
    membreteNombre: "Administración Morinigo",
    membreteEmail: "contacto@morinigoadm.com",
  });
  vi.mocked(api.tareas.list).mockResolvedValue([]);
});

describe("InformeEdificio", () => {
  it("pide elegir un edificio antes de mostrar el informe", async () => {
    renderConQuery();
    expect(await screen.findByText(/eleg[ií] un edificio/i)).toBeInTheDocument();
    expect(api.tareas.list).not.toHaveBeenCalled();
  });

  it("al elegir un edificio muestra el membrete y las tareas agrupadas", async () => {
    vi.mocked(api.tareas.list).mockResolvedValue([
      tarea({ rowId: "1", estado: "Sin asignar", dpto: "FRENTE", informe: "Reparar primer piso" }),
      tarea({ rowId: "2", estado: "En Proceso", dpto: "TERRAZA" }),
    ]);
    const user = userEvent.setup();
    renderConQuery();

    await user.selectOptions(
      await screen.findByLabelText(/edificio/i),
      "Castro Barros 1310"
    );

    expect(await screen.findByText("Administración Morinigo")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Pendientes \(1\)/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /En Proceso \(1\)/ })).toBeInTheDocument();
    expect(screen.getByText("Reparar primer piso")).toBeInTheDocument();
    // Realizadas está vacío: no se dibuja
    expect(screen.queryByRole("heading", { name: /Realizadas/ })).not.toBeInTheDocument();
  });

  it("avisa cuando el edificio no tiene tareas en el rango", async () => {
    const user = userEvent.setup();
    renderConQuery();
    await user.selectOptions(
      await screen.findByLabelText(/edificio/i),
      "Castro Barros 1310"
    );
    expect(await screen.findByText(/no hay tareas/i)).toBeInTheDocument();
  });

  it("deshabilita Exportar PDF mientras no haya edificio elegido", async () => {
    renderConQuery();
    expect(await screen.findByRole("button", { name: /exportar pdf/i })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run components/informes/InformeEdificio.test.tsx`
Expected: FAIL — no se resuelve `./InformeEdificio`.

- [ ] **Step 3: Crear el hook**

Crear `components/informes/hooks/useInforme.ts`:

```ts
"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { agruparParaInforme, nombreArchivoInforme } from "@/lib/informes";

// Primer día del mes actual y hoy, en formato ISO corto (lo que espera <input type="date">).
function rangoPorDefecto(): { desde: string; hasta: string } {
  const hoy = new Date();
  const primero = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { desde: iso(primero), hasta: iso(hoy) };
}

export function useInforme() {
  const inicial = useMemo(rangoPorDefecto, []);
  const [edificio, setEdificio] = useState("");
  const [desde, setDesde] = useState(inicial.desde);
  const [hasta, setHasta] = useState(inicial.hasta);
  const [errorExport, setErrorExport] = useState<string | null>(null);

  const edificiosQ = useQuery({
    queryKey: ["edificios"],
    queryFn: api.edificios.list,
    staleTime: 5 * 60_000,
  });

  const configQ = useQuery({ queryKey: ["configuracion"], queryFn: api.configuracion.get });

  const tareasQ = useQuery({
    queryKey: ["informe", edificio, desde, hasta],
    queryFn: () => api.tareas.list({ edificio, desde, hasta }),
    enabled: !!edificio,
  });

  const grupos = useMemo(() => agruparParaInforme(tareasQ.data ?? []), [tareasQ.data]);
  const total = tareasQ.data?.length ?? 0;

  // La descarga no puede ir por api-client (devuelve JSON): se pide el blob y se
  // dispara un <a download> temporal.
  const exportar = useMutation({
    mutationFn: async () => {
      const p = new URLSearchParams({ edificio });
      if (desde) p.set("desde", desde);
      if (hasta) p.set("hasta", hasta);
      const res = await fetch(`/api/informes/pdf?${p.toString()}`);
      if (!res.ok) throw new Error("No se pudo generar el PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nombreArchivoInforme(edificio, desde, hasta);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
    onSuccess: () => setErrorExport(null),
    onError: (e: Error) => setErrorExport(e.message),
  });

  return {
    edificio,
    setEdificio,
    desde,
    setDesde,
    hasta,
    setHasta,
    edificios: edificiosQ.data ?? [],
    config: configQ.data,
    grupos,
    total,
    cargando: tareasQ.isLoading,
    error: tareasQ.isError,
    exportar,
    errorExport,
  };
}
```

- [ ] **Step 4: Crear el membrete de pantalla**

Crear `components/informes/MembreteHeader.tsx`:

```tsx
"use client";

import type { Configuracion } from "@/types";
import { APP_NAME } from "@/lib/app-name";

interface Props {
  config?: Configuracion;
  edificio: string;
  desde: string;
  hasta: string;
}

// Espejo en pantalla del membrete del PDF. Los campos vacíos no se dibujan.
export function MembreteHeader({ config, edificio, desde, hasta }: Props) {
  const contacto = [config?.membreteDireccion, config?.membreteTelefono].filter(Boolean).join(" · ");
  const rango = [desde, hasta].filter(Boolean).join(" al ");

  return (
    <div className="rounded-t-2xl border border-b-0 border-slate-200 bg-white p-4 md:p-6">
      <div className="flex items-center gap-4">
        {config?.membreteLogoUrl ? (
          // Imagen externa arbitraria (Drive): <img> evita configurar remotePatterns de next/image.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={config.membreteLogoUrl}
            alt=""
            className="h-16 w-16 shrink-0 rounded-full object-contain"
          />
        ) : null}
        <div className="min-w-0">
          <h3 className="truncate text-xl font-bold text-slate-900">
            {config?.membreteNombre || APP_NAME}
          </h3>
          {config?.membreteEmail && (
            <p className="truncate text-sm text-sky-700">{config.membreteEmail}</p>
          )}
          {contacto && <p className="truncate text-sm text-slate-600">{contacto}</p>}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 text-sm font-semibold text-slate-900">
        <span>Consorcio: {edificio}</span>
        {rango && <span>Período: {rango}</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Crear la tabla de grupo**

Crear `components/informes/TablaGrupo.tsx`:

```tsx
"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  comentarioMasReciente,
  ETIQUETA_COMENTARIO,
  type GrupoInforme,
  type GrupoTareas,
} from "@/lib/informes";

// Mismos fondos que el PDF, replicando la planilla original.
const FONDO_GRUPO: Record<GrupoInforme, string> = {
  Pendientes: "bg-red-50",
  "En Proceso": "bg-yellow-50",
  Realizadas: "bg-green-50",
};

export function TablaGrupo({ grupo, tareas }: GrupoTareas) {
  if (tareas.length === 0) return null;

  return (
    <section className="mt-4">
      <h4 className="text-sm font-semibold text-slate-900">
        {grupo} ({tareas.length})
      </h4>
      <div className="mt-1.5 overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th className="px-3 py-2 font-semibold">Dpto</th>
              <th className="px-3 py-2 font-semibold">Prioridad</th>
              <th className="px-3 py-2 font-semibold">Informe</th>
              <th className="px-3 py-2 font-semibold">Comentario</th>
              <th className="px-3 py-2 font-semibold">Estado</th>
            </tr>
          </thead>
          <tbody>
            {tareas.map((t) => {
              const comentario = comentarioMasReciente(t);
              return (
                <tr key={t.rowId} className={cn("border-t border-slate-200", FONDO_GRUPO[grupo])}>
                  <td className="px-3 py-2 font-medium text-slate-900">
                    <Link
                      href={`/tareas/${encodeURIComponent(t.rowId)}`}
                      className="hover:underline"
                    >
                      {t.dpto || "—"}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{t.prioridad}</td>
                  <td className="px-3 py-2">{t.informe || "—"}</td>
                  <td className="px-3 py-2">
                    {comentario.origen ? (
                      <>
                        <span className="text-slate-500">
                          {ETIQUETA_COMENTARIO[comentario.origen]}:{" "}
                        </span>
                        {comentario.texto}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2">{t.estado}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Crear la vista**

Crear `components/informes/InformeEdificio.tsx`:

```tsx
"use client";

import { Download, Loader2 } from "lucide-react";
import { useInforme } from "./hooks/useInforme";
import { MembreteHeader } from "./MembreteHeader";
import { TablaGrupo } from "./TablaGrupo";

export function InformeEdificio() {
  const {
    edificio,
    setEdificio,
    desde,
    setDesde,
    hasta,
    setHasta,
    edificios,
    config,
    grupos,
    total,
    cargando,
    error,
    exportar,
    errorExport,
  } = useInforme();

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-4 md:px-8 md:py-6">
      <h2 className="text-xl font-semibold text-slate-900">Informes</h2>
      <p className="text-sm text-slate-600">Informe de tareas por edificio, listo para exportar</p>

      <div className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-4">
        <label className="text-sm md:col-span-2">
          <span className="mb-1 block text-slate-600">Edificio</span>
          <select
            value={edificio}
            onChange={(e) => setEdificio(e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-2 py-2"
          >
            <option value="">Elegí un edificio…</option>
            {edificios.map((e) => (
              <option key={e.nombre} value={e.nombre}>
                {e.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">Desde</span>
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-2 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">Hasta</span>
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-2 py-2"
          />
        </label>
        <div className="md:col-span-4 flex justify-end">
          <button
            type="button"
            onClick={() => exportar.mutate()}
            disabled={!edificio || exportar.isPending}
            className="flex items-center gap-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-60 disabled:hover:bg-slate-900"
          >
            {exportar.isPending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Download size={16} />
            )}
            Exportar PDF
          </button>
        </div>
      </div>

      {errorExport && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorExport}
        </div>
      )}

      {!edificio && (
        <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          Elegí un edificio para ver su informe.
        </div>
      )}

      {edificio && error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          No se pudo cargar el informe.
        </div>
      )}

      {edificio && !error && (
        <div className="mt-4">
          <MembreteHeader config={config} edificio={edificio} desde={desde} hasta={hasta} />
          <div className="rounded-b-2xl border border-slate-200 bg-white p-4 md:p-6">
            {cargando && <p className="text-sm text-slate-500">Cargando…</p>}
            {!cargando && total === 0 && (
              <p className="text-sm text-slate-500">
                No hay tareas de este edificio en el período elegido.
              </p>
            )}
            {!cargando &&
              grupos.map((g) => <TablaGrupo key={g.grupo} grupo={g.grupo} tareas={g.tareas} />)}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Crear la página**

Crear `app/(app)/informes/page.tsx`:

```tsx
import { InformeEdificio } from "@/components/informes/InformeEdificio";

export default function InformesPage() {
  return <InformeEdificio />;
}
```

- [ ] **Step 8: Correr el test y verificar que pasa**

Run: `npx vitest run components/informes/InformeEdificio.test.tsx`
Expected: PASS — 4 tests.

---

## Task 7: Entrada "Informes" en el sidebar

**Files:**
- Modify: `components/layout/AppShell.tsx:24-48`
- Test: `components/layout/AppShell.test.tsx`

- [ ] **Step 1: Escribir el test que falla**

`components/layout/AppShell.test.tsx` ya existe y trae en su cabecera los mocks de
`next-auth/react`, `next/navigation`, `useOnlineStatus` y `usePendingCount`, más el helper
`asAdmin()`. Usa `fireEvent` y `within` (no `userEvent`).

Primero, agregar junto a `asAdmin` un helper hermano para el rol supervisor:

```tsx
const asSupervisor = () =>
  vi.mocked(useSession).mockReturnValue({
    data: { user: { email: "sup@x.com", rol: "supervisor" } },
  } as never);
```

Y después este `describe` nuevo al final del archivo:

```tsx
describe("AppShell — sección Informes", () => {
  it("Informes está en el shell para un supervisor (sidebar desktop)", () => {
    asSupervisor();
    render(
      <AppShell>
        <div>c</div>
      </AppShell>
    );
    expect(screen.getByRole("link", { name: /informes/i })).toBeInTheDocument();
  });

  it("Informes NO ocupa una celda de la bottom nav mobile", () => {
    asSupervisor();
    render(
      <AppShell>
        <div>c</div>
      </AppShell>
    );
    const bottom = screen.getByTestId("bottom-nav");
    expect(bottom).not.toHaveTextContent("Informes");
    // Siguen siendo 3 destinos + "Nueva"
    expect(within(bottom).getAllByRole("link")).toHaveLength(4);
  });

  it("Informes está en el drawer mobile, también para un no-admin", () => {
    asSupervisor();
    render(
      <AppShell>
        <div>c</div>
      </AppShell>
    );
    fireEvent.click(screen.getByRole("button", { name: /abrir menú/i }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("link", { name: /informes/i })).toBeInTheDocument();
    // El supervisor no ve los destinos de admin
    expect(within(dialog).queryByRole("link", { name: /usuarios/i })).not.toBeInTheDocument();
  });
});
```

Nota del repo: en jsdom las clases `hidden md:flex` no ocultan nada, así que el sidebar desktop
siempre está en el DOM — por eso la bottom nav se consulta por `data-testid="bottom-nav"` y el
drawer por `role="dialog"` con `within`.

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run components/layout/AppShell.test.tsx`
Expected: FAIL — no existe ningún link "Informes".

- [ ] **Step 3: Implementar**

En `components/layout/AppShell.tsx`, agregar `FileText` al import de `lucide-react` y reemplazar
la interfaz `NavItem`, la constante `NAV` y el cálculo de los ítems:

```tsx
interface NavItem {
  href: string;
  label: string;
  Icon: typeof ClipboardList;
  adminOnly?: boolean;
  // Visible para todos, pero fuera de la bottom nav mobile: va al drawer. La bottom nav
  // tiene lugar para 3 destinos + "Nueva"; sumar una cuarta celda la deja ilegible.
  drawerOnly?: boolean;
}

const NAV: NavItem[] = [
  { href: "/tareas", label: "Tareas", Icon: ClipboardList },
  { href: "/edificios", label: "Edificios", Icon: Building2 },
  { href: "/informes", label: "Informes", Icon: FileText, drawerOnly: true },
  { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/usuarios", label: "Usuarios", Icon: Users, adminOnly: true },
  { href: "/configuracion", label: "Config", Icon: Settings, adminOnly: true },
];
```

Y dentro del componente:

```tsx
  const items = NAV.filter((n) => !n.adminOnly || isAdmin);
  const bottomItems = items.filter((n) => !n.adminOnly && !n.drawerOnly); // Tareas, Edificios, Dashboard
  const drawerItems = items.filter((n) => n.adminOnly || n.drawerOnly); // Informes + Usuarios/Config (admin)
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run components/layout/AppShell.test.tsx`
Expected: PASS.

---

## Task 8: Documentación y verificación final

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Entrada en el CHANGELOG**

En `CHANGELOG.md`, al principio de la lista `### Added` de `## [Unreleased]`:

```markdown
- **Sección Informes**: informe de tareas por edificio y rango de fechas, con el membrete de la
  administración y las tareas agrupadas en **Pendientes / En Proceso / Realizadas** (columnas
  Dpto, Prioridad, Informe, Comentario y Estado). Botón **Exportar PDF** que descarga el informe
  armado con `@react-pdf/renderer` — no se guarda en Drive, se regenera cuando haga falta.
  Accesible para admin y supervisor: en desktop está en el sidebar, en mobile en el menú
  hamburguesa. El membrete (nombre, email, dirección, teléfono y logo) se carga en la hoja
  `Configuracion` y se edita desde **Config**, así cada despliegue usa su propia marca
```

- [ ] **Step 2: Suite completa**

Run: `npm test`
Expected: todos los archivos en verde (386 previos + los nuevos).

- [ ] **Step 3: Tipos**

Run: `npx tsc --noEmit`
Expected: sin salida.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: 0 errores (los 5 warnings preexistentes de `react-hooks/set-state-in-effect` siguen).

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: build exitoso, con `/informes` y `/api/informes/pdf` en el listado de rutas.

- [ ] **Step 6: Checkpoint final**

Avisar "listo para commitear" con el resumen de archivos tocados. **No ejecutar `git commit`.**

---

## Prerrequisito manual (Jony, fuera del código)

Cargar en la hoja `Configuracion` las 5 filas del membrete (clave en A, valor en B):

```
membrete_nombre      Administración Morinigo
membrete_email       contacto@morinigoadm.com
membrete_direccion   Colombres 528 C.A.B.A
membrete_telefono    Tel: 4957-1938 de 13 a 17hs
membrete_logo_url    <URL pública de la imagen del logo>
```

También se pueden cargar desde `/configuracion` una vez deployado. Sin ellas el informe sale con
el nombre por defecto de la app y sin logo.
