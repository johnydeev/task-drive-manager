# Edificios: vista completa para supervisores + contador de pendientes — Implementation Plan

> **Para agentes:** ejecutar con `superpowers:executing-plans` (inline, por bloques).
> Los pasos usan checkbox (`- [ ]`) para tracking.
>
> **Regla del repo: NO se ejecuta `git commit`.** Los commits los hace Jony con GitLens. Donde un
> plan normal diría "commit", acá va un **checkpoint**: dejar el árbol verde y avisar.

**Goal:** Que el supervisor vea en `/edificios` los consorcios y las tareas asignadas de todos los
integrantes (solo lectura), y que cada pill de edificio muestre cuántas tareas abiertas tiene ese
consorcio.

**Architecture:** Tres capas independientes. (1) Un módulo puro nuevo cuenta las tareas no
`Realizada` por edificio, con el join tolerante de `normalizeEdificio`; no toca IO ni `lib/sheets/*`
porque lo importa un componente de cliente. (2) Dos `GET` dejan de recortar por rol —usuarios y
asignaciones— mientras las escrituras siguen en `withAdmin`. (3) La vista deja de filtrar por email,
ordena la tarjeta propia primero, esconde el bloque Directivas en tarjetas ajenas y dibuja el
contador dentro del link del pill. No hay fetch nuevo: `EdificiosView` ya monta `useTareas()`.

**Tech Stack:** Next 16 (App Router), React 19, TypeScript estricto, TanStack Query, Tailwind v4,
Vitest + Testing Library.

**Spec:** [`../specs/2026-09-07-edificios-vista-completa-y-contador-design.md`](../specs/2026-09-07-edificios-vista-completa-y-contador-design.md)

---

## Estructura de archivos

**Se crean:**

| Archivo | Responsabilidad |
|---|---|
| `lib/pendientes-por-edificio.ts` | Conteo puro de tareas abiertas por consorcio, con join normalizado |
| `lib/pendientes-por-edificio.test.ts` | Test colocado del módulo anterior |

**Se modifican:**

| Archivo | Cambio |
|---|---|
| `app/api/usuarios/route.ts` | `GET`: el no-admin recibe a todos los activos, sin `firmaUrl` en los ajenos |
| `app/api/asignaciones/route.ts` | `GET`: deja de filtrar por email |
| `components/edificios/IntegranteCard.tsx` | Contador en el pill + prop `mostrarDirectivas` |
| `components/edificios/EdificiosView.tsx` | Sin filtro por rol, orden propia-primero, mapa de pendientes |
| `components/edificios/IntegranteCard.test.tsx` | Casos del badge y del bloque Directivas oculto |
| `components/edificios/EdificiosView.test.tsx` | Casos de la vista del supervisor |
| `tests/api/usuarios.test.ts` | **Reescribe** el caso "un no-admin recibe solo su propio registro" |
| `tests/api/asignaciones.test.ts` | **Reescribe** el caso "supervisor recibe solo las suyas" |
| `CHANGELOG.md` | Entrada en `[Unreleased] / Added` |

**No se tocan:** `app/api/directivas/route.ts` (sigue recortando), `app/api/tareas/route.ts` (ya
devuelve todas), `components/edificios/TareasAsignadasCard.tsx`, `lib/informes.ts`,
`lib/dashboard.ts`.

---

## Task 1: Conteo de pendientes (lógica pura)

**Files:**
- Create: `lib/pendientes-por-edificio.ts`
- Test: `lib/pendientes-por-edificio.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/pendientes-por-edificio.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { contarPendientesPorEdificio, pendientesDe } from "./pendientes-por-edificio";
import type { Tarea } from "@/types";

function tarea(over: Partial<Tarea>): Tarea {
  return {
    rowId: "2026-01-01T00:00:00.000Z",
    objetivo: "x",
    fechaInicio: "2026-01-10",
    fechaEstimada: "2026-01-20",
    edificio: "BELGRANO 2458",
    parteComun: false,
    dpto: "1A",
    informe: "",
    imagenes: [],
    videos: [],
    documentos: [],
    estado: "Sin asignar",
    prioridad: "Media",
    supervisor: "sup@x.com",
    ...over,
  };
}

describe("contarPendientesPorEdificio", () => {
  it("cuenta todo lo que no está Realizada", () => {
    const mapa = contarPendientesPorEdificio([
      tarea({ estado: "Sin asignar" }),
      tarea({ estado: "Asignada" }),
      tarea({ estado: "Aceptada" }),
      tarea({ estado: "En Proceso" }),
      tarea({ estado: "En Revisión" }),
      tarea({ estado: "Objetada" }),
      tarea({ estado: "Realizada" }),
    ]);
    expect(pendientesDe(mapa, "BELGRANO 2458")).toBe(6);
  });

  it("separa por edificio", () => {
    const mapa = contarPendientesPorEdificio([
      tarea({ edificio: "BELGRANO 2458", estado: "Sin asignar" }),
      tarea({ edificio: "BARTOLOME MITRE 1225", estado: "En Proceso" }),
      tarea({ edificio: "BARTOLOME MITRE 1225", estado: "Objetada" }),
    ]);
    expect(pendientesDe(mapa, "BELGRANO 2458")).toBe(1);
    expect(pendientesDe(mapa, "BARTOLOME MITRE 1225")).toBe(2);
  });

  it("matchea aunque cambien mayúsculas, acentos o espacios", () => {
    const mapa = contarPendientesPorEdificio([
      tarea({ edificio: "Bartolomé  Mitre 1225", estado: "Asignada" }),
    ]);
    expect(pendientesDe(mapa, "BARTOLOME MITRE 1225")).toBe(1);
  });

  it("devuelve 0 para un edificio sin tareas", () => {
    const mapa = contarPendientesPorEdificio([]);
    expect(pendientesDe(mapa, "GARAY 350")).toBe(0);
  });

  it("ignora las tareas sin edificio", () => {
    const mapa = contarPendientesPorEdificio([tarea({ edificio: "   ", estado: "Asignada" })]);
    expect(pendientesDe(mapa, "")).toBe(0);
    expect(mapa.size).toBe(0);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run lib/pendientes-por-edificio.test.ts`
Expected: FAIL — `Failed to resolve import "./pendientes-por-edificio"`.

- [ ] **Step 3: Implementar el módulo**

Crear `lib/pendientes-por-edificio.ts`:

```ts
// Cuántas tareas ABIERTAS tiene cada consorcio. Lógica PURA (sin IO).
//
// "Pendiente" acá = todo lo que no llegó a `Realizada` (6 de los 7 estados). Es una
// lectura distinta de las otras dos que ya viven en el repo, a propósito:
//   - lib/informes.ts   → "Pendientes" excluye En Proceso / En Revisión / Objetada.
//   - lib/dashboard.ts  → `pendiente` excluye En Proceso / En Revisión (Objetada sí suma).
// Ninguna de las dos se toca: este contador responde "cuánto trabajo abierto tiene el
// edificio", que es lo que se muestra en el pill de /edificios.
//
// El `estado` que llega de la API ya es el EFECTIVO (lib/sheets/tareas.ts aplica
// estadoEfectivoTarea al leer), así que una tarea auto-cerrada a las 72 h no cuenta.
//
// IMPORTANTE: este módulo lo importa un componente de cliente. NO puede depender de
// lib/sheets/*, que arrastra `googleapis` y rompe el build con
// "Can't resolve 'child_process' / 'fs'" (los tests no lo ven: vitest corre en Node).

import { normalizeEdificio } from "./edificio-match";
import type { Tarea } from "@/types";

// Clave del mapa: el nombre normalizado. Las tareas viejas referencian el consorcio con
// otra capitalización/acentuación que _Consorcios, y comparar crudo daría todo en cero.
export function contarPendientesPorEdificio(tareas: Tarea[]): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const t of tareas) {
    if (t.estado === "Realizada") continue;
    const clave = normalizeEdificio(t.edificio ?? "");
    if (!clave) continue;
    mapa.set(clave, (mapa.get(clave) ?? 0) + 1);
  }
  return mapa;
}

// Un edificio sin ninguna tarea abierta devuelve 0, no undefined: el badge siempre dibuja
// un número.
export function pendientesDe(mapa: Map<string, number>, edificio: string): number {
  return mapa.get(normalizeEdificio(edificio)) ?? 0;
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run lib/pendientes-por-edificio.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Checkpoint**

Run: `npx tsc --noEmit`
Expected: sin salida. Avisar "Task 1 lista".

---

## Task 2: Abrir los endpoints de lectura

**Files:**
- Modify: `app/api/usuarios/route.ts` (el `GET`)
- Modify: `app/api/asignaciones/route.ts` (el `GET`)
- Test: `tests/api/usuarios.test.ts`, `tests/api/asignaciones.test.ts`

- [ ] **Step 1: Reescribir los tests que afirman el recorte viejo**

En `tests/api/usuarios.test.ts`, agregar `firmaUrl` al fixture y reemplazar el caso del no-admin.
El fixture pasa a ser:

```ts
const US: Usuario[] = [
  { email: "admin@x.com", nombre: "Admin", rol: "admin", activo: true, creadoEn: "", firmaUrl: "https://drive/f1" },
  { email: "op@x.com", nombre: "Operario", rol: "supervisor", activo: true, creadoEn: "", firmaUrl: "https://drive/f2" },
  { email: "otro@x.com", nombre: "Otro", rol: "supervisor", activo: true, creadoEn: "", firmaUrl: "https://drive/f3" },
  { email: "baja@x.com", nombre: "De Baja", rol: "supervisor", activo: false, creadoEn: "" },
];
```

Y el caso `"un no-admin recibe solo su propio registro"` se reemplaza por estos tres:

```ts
  it("un no-admin recibe a todos los integrantes activos", async () => {
    requireSession.mockResolvedValue({ user: { email: "op@x.com", rol: "supervisor" } });
    const res = await GET();
    const body = await res.json();
    expect(body.map((u: Usuario) => u.email)).toEqual(["admin@x.com", "op@x.com", "otro@x.com"]);
  });

  it("un no-admin no recibe la firma de los demás, pero sí la propia", async () => {
    requireSession.mockResolvedValue({ user: { email: "op@x.com", rol: "supervisor" } });
    const body = await (await GET()).json();
    const propio = body.find((u: Usuario) => u.email === "op@x.com");
    const ajeno = body.find((u: Usuario) => u.email === "otro@x.com");
    expect(propio.firmaUrl).toBe("https://drive/f2");
    expect(ajeno).not.toHaveProperty("firmaUrl");
  });

  it("el admin sigue recibiendo todos, inactivos y firmas incluidos", async () => {
    requireSession.mockResolvedValue({ user: { email: "admin@x.com", rol: "admin" } });
    const body = await (await GET()).json();
    expect(body).toHaveLength(4);
    expect(body[0].firmaUrl).toBe("https://drive/f1");
  });
```

El caso existente `"el admin recibe todos"` espera `toHaveLength(2)`: actualizarlo a `4` por el
fixture nuevo, o borrarlo porque el tercer test de arriba lo cubre. Borrarlo.

En `tests/api/asignaciones.test.ts`, el caso `"supervisor recibe solo las suyas"` se reemplaza por:

```ts
  it("supervisor también recibe todas (vista de equipo)", async () => {
    requireSession.mockResolvedValue({ user: { email: "b@x.com", rol: "supervisor" } });
    vi.mocked(getAsignaciones).mockResolvedValue([{ email: "c@x.com", edificio: "Garay 350" }]);
    const res = await GET(getReq(), undefined);
    expect(res.status).toBe(200);
    expect(vi.mocked(getAsignaciones)).toHaveBeenCalledWith();
    expect(await res.json()).toHaveLength(1);
  });
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run tests/api/usuarios.test.ts tests/api/asignaciones.test.ts`
Expected: FAIL — el de usuarios porque el no-admin recibe 1 registro y se esperan 3; el de
asignaciones porque `getAsignaciones` se llamó con `"b@x.com"` y se espera sin argumentos.

- [ ] **Step 3: Abrir `GET /api/usuarios`**

En `app/api/usuarios/route.ts`, reemplazar el handler `GET` completo por:

```ts
// La firma es el link público en Drive con el que se sellan los PDF de visita. No hace
// falta para dibujar /edificios, así que no viaja en los registros ajenos.
function sinFirma(u: Usuario): Usuario {
  const copia = { ...u };
  delete copia.firmaUrl;
  return copia;
}

export async function GET() {
  try {
    const session = await requireSession();
    const usuarios = await getUsuarios();
    // El admin recibe todo (gestión de usuarios: necesita también los inactivos y las
    // firmas). Un no-admin recibe al equipo activo para la vista Edificios, con su propio
    // registro completo y los ajenos sin firma.
    if (session.user.rol === "admin") return NextResponse.json(usuarios);
    const email = session.user.email.toLowerCase();
    const esPropio = (u: Usuario) => u.email.toLowerCase() === email;
    const visibles = usuarios
      .filter((u) => u.activo || esPropio(u))
      .map((u) => (esPropio(u) ? u : sinFirma(u)));
    return NextResponse.json(visibles);
  } catch (err) {
    return handleApiError(err);
  }
}
```

Agregar el import del tipo arriba del archivo:

```ts
import type { Usuario } from "@/types";
```

- [ ] **Step 4: Abrir `GET /api/asignaciones`**

En `app/api/asignaciones/route.ts`, reemplazar el handler `GET` por:

```ts
// Todas las asignaciones, para cualquier rol: la vista Edificios muestra qué consorcio
// atiende cada integrante. La escritura sigue siendo admin-only (withAdmin, más abajo).
export const GET = withAuth(async () => {
  return NextResponse.json(await getAsignaciones());
});
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `npx vitest run tests/api/usuarios.test.ts tests/api/asignaciones.test.ts`
Expected: PASS.

- [ ] **Step 6: Checkpoint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores. Avisar "Task 2 lista".

---

## Task 3: Contador y Directivas condicionales en la tarjeta

**Files:**
- Modify: `components/edificios/IntegranteCard.tsx`
- Test: `components/edificios/IntegranteCard.test.tsx`

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al final del `describe("IntegranteCard", …)` de
`components/edificios/IntegranteCard.test.tsx`:

```ts
  it("muestra el contador de pendientes en rojo dentro del link del pill", () => {
    wrap(
      <IntegranteCard
        usuario={usuario}
        usuarios={[usuario]}
        asignaciones={[{ email: "op@x.com", edificio: "Garay 350" }]}
        directivas={[]}
        readOnly
        currentEmail="op@x.com"
        isAdmin={false}
        mostrarDirectivas
        pendientes={new Map([["garay 350", 3]])}
      />
    );
    const link = screen.getByRole("link", { name: /Garay 350 — 3 tareas pendientes/ });
    expect(link).toHaveAttribute("href", "/tareas?edificio=Garay%20350");
    expect(within(link).getByText("3")).toHaveClass("text-red-700");
  });

  it("muestra el contador apagado cuando el consorcio no tiene pendientes", () => {
    wrap(
      <IntegranteCard
        usuario={usuario}
        usuarios={[usuario]}
        asignaciones={[{ email: "op@x.com", edificio: "Garay 350" }]}
        directivas={[]}
        readOnly
        currentEmail="op@x.com"
        isAdmin={false}
        mostrarDirectivas
        pendientes={new Map()}
      />
    );
    const link = screen.getByRole("link", { name: /Garay 350 — sin tareas pendientes/ });
    expect(within(link).getByText("0")).toHaveClass("text-slate-500");
  });

  it("con mostrarDirectivas en false no renderiza el bloque Directivas", () => {
    wrap(
      <IntegranteCard
        usuario={usuario}
        usuarios={[usuario]}
        asignaciones={[]}
        directivas={[]}
        readOnly
        currentEmail="otro@x.com"
        isAdmin={false}
        mostrarDirectivas={false}
        pendientes={new Map()}
      />
    );
    expect(screen.queryByText("Directivas")).not.toBeInTheDocument();
    expect(screen.queryByText("Sin directivas")).not.toBeInTheDocument();
  });
```

Agregar `within` al import de Testing Library en ese archivo:

```ts
import { render, screen, waitFor, within } from "@testing-library/react";
```

Los tests que ya existen en el archivo pasan props sin `mostrarDirectivas` ni `pendientes`: a cada
uno agregarle `mostrarDirectivas` y `pendientes={new Map()}` para que compile.

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run components/edificios/IntegranteCard.test.tsx`
Expected: FAIL — TypeScript/props desconocidas y `Unable to find role="link"` con ese nombre.

- [ ] **Step 3: Implementar el contador y el flag**

En `components/edificios/IntegranteCard.tsx`:

Agregar los imports:

```ts
import { cn } from "@/lib/utils";
import { pendientesDe } from "@/lib/pendientes-por-edificio";
```

Agregar las dos props a la interfaz `Props`:

```ts
  mostrarDirectivas: boolean;
  pendientes: Map<string, number>;
```

y a la desestructuración del componente (`mostrarDirectivas`, `pendientes`).

Reemplazar el `<span>` del pill dentro del `.map(...)` de asignaciones por:

```tsx
          {asignaciones.map((a) => {
            const n = pendientesDe(pendientes, a.edificio);
            return (
              <span
                key={a.edificio}
                className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3.5 py-1.5 text-sm font-medium text-slate-700"
              >
                {/* El link envuelve nombre + contador para que el número también sea área
                    clickeable. El ✕ queda FUERA del anchor: un <button> dentro de un <a> es
                    HTML inválido y en mobile el tap se pelea entre navegar y quitar. */}
                <Link
                  href={`/tareas?edificio=${encodeURIComponent(a.edificio)}`}
                  aria-label={`${a.edificio} — ${n === 0 ? "sin tareas pendientes" : `${n} ${n === 1 ? "tarea pendiente" : "tareas pendientes"}`}`}
                  className="inline-flex items-center gap-1.5 rounded px-0.5 transition-colors hover:bg-slate-200 hover:text-slate-900"
                >
                  {a.edificio}
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums",
                      n > 0 ? "bg-red-100 text-red-700" : "bg-slate-200 text-slate-500"
                    )}
                  >
                    {n}
                  </span>
                </Link>
                {!readOnly && (
                  <button
                    onClick={() => removeM.mutate(a.edificio)}
                    disabled={removeM.isPending && removeM.variables === a.edificio}
                    aria-label={`Quitar ${a.edificio}`}
                    className="-mr-1 ml-0.5 text-slate-400 hover:text-red-600 disabled:opacity-50"
                  >
                    {removeM.isPending && removeM.variables === a.edificio ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <X size={14} />
                    )}
                  </button>
                )}
              </span>
            );
          })}
```

Envolver el bloque Directivas completo (el `<div>` que arranca con el `<p>` "Directivas" y termina
después del `{showForm && !readOnly && (…)}`) en:

```tsx
      {mostrarDirectivas && (
        <div>
          {/* …contenido actual del bloque Directivas, sin cambios… */}
        </div>
      )}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run components/edificios/IntegranteCard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Checkpoint**

Run: `npx tsc --noEmit`
Expected: falla **solo** en `EdificiosView.tsx`, porque todavía no pasa las props nuevas. Se
arregla en la Task 4.

---

## Task 4: La vista completa

**Files:**
- Modify: `components/edificios/EdificiosView.tsx`
- Test: `components/edificios/EdificiosView.test.tsx`

- [ ] **Step 1: Escribir los tests que fallan**

En `components/edificios/EdificiosView.test.tsx`, ampliar el mock de `api` con las tareas (el
archivo hoy no mockea `api.tareas`), agregando dentro del objeto `api`:

```ts
    tareas: {
      list: vi.fn().mockResolvedValue([
        { rowId: "1", objetivo: "T1", fechaInicio: "2026-01-01", fechaEstimada: "", edificio: "Garay 350",
          parteComun: false, dpto: "1A", informe: "", imagenes: [], videos: [], documentos: [],
          estado: "Sin asignar", prioridad: "Media", supervisor: "op@x.com" },
        { rowId: "2", objetivo: "T2", fechaInicio: "2026-01-02", fechaEstimada: "", edificio: "garay  350",
          parteComun: false, dpto: "2B", informe: "", imagenes: [], videos: [], documentos: [],
          estado: "Realizada", prioridad: "Media", supervisor: "op@x.com" },
      ]),
    },
```

Y agregar estos casos al `describe`:

```ts
  it("el supervisor ve a todos los integrantes, con su tarjeta primero", async () => {
    vi.mocked(useSession).mockReturnValue({ data: { user: { email: "op@x.com", rol: "supervisor" } } } as never);
    renderView();
    await waitFor(() => expect(screen.getByText("Operario Uno")).toBeInTheDocument());
    expect(screen.getByText("Admin")).toBeInTheDocument();
    const nombres = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(nombres[0]).toBe("Operario Uno");
  });

  it("el supervisor no ve el bloque Directivas de los demás", async () => {
    vi.mocked(useSession).mockReturnValue({ data: { user: { email: "op@x.com", rol: "supervisor" } } } as never);
    renderView();
    await waitFor(() => expect(screen.getByText("Admin")).toBeInTheDocument());
    // Solo queda el bloque de su propia tarjeta.
    expect(screen.getAllByText("Directivas")).toHaveLength(1);
  });

  it("el supervisor no ve el cartel de edificios sin asignar", async () => {
    vi.mocked(api.asignaciones.sinAsignar).mockResolvedValue(["Nazca 2538"]);
    vi.mocked(useSession).mockReturnValue({ data: { user: { email: "op@x.com", rol: "supervisor" } } } as never);
    renderView();
    await waitFor(() => expect(screen.getByText("Admin")).toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("el pill del edificio muestra las tareas abiertas del consorcio", async () => {
    vi.mocked(useSession).mockReturnValue({ data: { user: { email: "admin@x.com", rol: "admin" } } } as never);
    renderView();
    // 2 tareas en Garay 350 (una escrita "garay  350"), pero solo 1 sin Realizar.
    await waitFor(() =>
      expect(screen.getByRole("link", { name: /Garay 350 — 1 tarea pendiente/ })).toBeInTheDocument()
    );
  });
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run components/edificios/EdificiosView.test.tsx`
Expected: FAIL — el supervisor solo ve su tarjeta, y no existe el link con el contador.

- [ ] **Step 3: Implementar la vista**

En `components/edificios/EdificiosView.tsx`:

Agregar el import:

```ts
import { contarPendientesPorEdificio } from "@/lib/pendientes-por-edificio";
```

Reemplazar el `useMemo` de `integrantes` por:

```ts
  // Todos los integrantes activos, para cualquier rol: el supervisor ve la misma pantalla
  // que el admin, en lectura. La tarjeta propia va primera y el resto alfabético.
  const integrantes = useMemo(() => {
    const activos = (usuariosQ.data ?? []).filter((u) => u.activo);
    return [...activos].sort((a, b) => {
      const propioA = a.email.toLowerCase() === myEmail;
      const propioB = b.email.toLowerCase() === myEmail;
      if (propioA !== propioB) return propioA ? -1 : 1;
      return (a.nombre || a.email).localeCompare(b.nombre || b.email, "es");
    });
  }, [usuariosQ.data, myEmail]);

  // Tareas abiertas por consorcio. Se calcula una sola vez sobre las tareas que la vista
  // ya tenía cargadas: no hay fetch nuevo.
  const pendientes = useMemo(
    () => contarPendientesPorEdificio(tareasQ.data ?? []),
    [tareasQ.data]
  );
```

Y en el JSX, pasar las props nuevas a `IntegranteCard`:

```tsx
              readOnly={!isAdmin}
              currentEmail={myEmail}
              isAdmin={isAdmin}
              mostrarDirectivas={isAdmin || u.email.toLowerCase() === myEmail}
              pendientes={pendientes}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run components/edificios/`
Expected: PASS — `EdificiosView.test.tsx` e `IntegranteCard.test.tsx`.

- [ ] **Step 5: Checkpoint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores. Avisar "Task 4 lista".

---

## Task 5: Verificación completa y CHANGELOG

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Suite completa**

Run: `npm test`
Expected: PASS, sin tests fallando ni saltados.

- [ ] **Step 2: Typecheck y lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build OK. Es el único paso que detecta si `lib/pendientes-por-edificio.ts` terminó
arrastrando `googleapis` al bundle del cliente (`Can't resolve 'child_process' / 'fs'`).

- [ ] **Step 4: Entrada en el CHANGELOG**

Agregar como primer ítem de `## [Unreleased]` → `### Added` en `CHANGELOG.md`:

```markdown
- **Edificios a la vista de todo el equipo**: el supervisor ahora ve en **Edificios** los
  consorcios y las tareas asignadas de **todos** los integrantes, en solo lectura — sin poder
  asignar, quitar ni crear directivas. Las **directivas ajenas siguen siendo privadas**: el
  bloque solo aparece en la tarjeta propia (o para el admin). Además, cada consorcio muestra
  al lado un **contador de tareas pendientes** (todo lo que no está *Realizada*): en rojo si
  hay trabajo abierto, apagado en `0`. El número es del **edificio**, no del integrante, y
  tocar el pill abre el listado de tareas de ese consorcio
```

- [ ] **Step 5: Verificación manual**

Con el dev server levantado por Jony (`npm run dev -- -p 4001`):
1. Entrar como **supervisor**: ver todas las tarjetas, la propia arriba; sin ✕, sin dropdown, sin
   "Asignar directiva"; el bloque Directivas solo en la propia; sin cartel rojo.
2. Abrir el detalle de una tarea como supervisor: "Asignado a" y "Supervisor" muestran nombres, no
   emails, y el panel Acciones no tiene el selector "Asignar a".
3. Entrar como **admin**: el ✕ sigue quitando el edificio y no dispara la navegación del pill.
4. Contrastar un contador contra `/tareas?edificio=…` filtrando por estado.

- [ ] **Step 6: Checkpoint final**

Avisar "listo para commitear" con el resumen de archivos tocados.

---

## Notas de ejecución

- **No se corre `git commit`.** Cada checkpoint deja el árbol verde y frena.
- **No levantar el dev server desde el agente**, ni en background: nadie consume su stdout, el
  buffer del pipe se llena con los logs de compilación y el proceso se bloquea. Lo levanta Jony.
- `npm run build` no es opcional en la Task 5: es el único de los cuatro comandos que detecta el
  arrastre de `googleapis` a un componente de cliente.
