# UX de campo: filtros en URL, búsqueda/orden, Combobox estricto, reporte al cerrar, toasts — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el spec [`../specs/2026-09-19-ux-de-campo-lista-combobox-reporte-toasts-design.md`](../specs/2026-09-19-ux-de-campo-lista-combobox-reporte-toasts-design.md).

**Architecture:** Módulos puros nuevos (`lib/texto.ts`, `lib/tareas-orden.ts`) + hook `useListaTareas` que absorbe la lógica de la página (estado local sembrado desde la URL, `router.replace` en cada cambio). `Combobox` gana `strict` y sus opciones pasan a `<li role="option">` clickeables sin botón interno. `Toaster` con contexto no-op por defecto. `after()` en la ruta y polling con tope en el detalle.

**Tech Stack:** Next 16 (`next/server` `after`, `next/navigation`), TanStack Query v5 (`refetchInterval` función), react-hook-form `Controller`, Vitest + Testing Library.

**Reglas del repo:** nunca `git commit` (checkpoints). Tests colocados salvo rutas. Verificación final: `npm test` + `npx tsc --noEmit` + `npm run lint` + `npm run build`.

---

## Mapa de archivos

| Archivo | Acción |
|---|---|
| `lib/texto.ts` + test | crear |
| `lib/tareas-orden.ts` + test | crear |
| `components/ui/Combobox.tsx` + test | modificar (strict, ✕, `<li>` clickeable, `aria-label`) |
| `components/ui/Toaster.tsx` + test | crear |
| `app/layout.tsx` | `ToastProvider` |
| `vitest.setup.ts` | `replace` en el mock de `useRouter` |
| `components/tareas/hooks/useListaTareas.ts` + test | crear |
| `app/(app)/tareas/page.tsx` + test | reescribir sobre el hook; búsqueda, orden, Combobox, toast |
| `components/tareas/TareaForm.tsx`, `hooks/useTareaForm.ts` + test | Combobox vía `Controller`; toast; sin `SuccessDialog` |
| `components/visitas/VisitaForm.tsx` + test, `components/informes/InformeEdificio.tsx` + test, `components/dashboard/Dashboard.tsx`, `components/edificios/IntegranteCard.tsx` + test | Combobox |
| `app/api/tareas/[id]/route.ts`, `tests/api/tareas-transiciones.test.ts` | `after()` |
| `components/tareas/hooks/useTareaDetalle.ts` + test, `components/tareas/TareaDetalle.tsx` | polling + texto; toast al eliminar |

---

### Task 1: `lib/texto.ts` y `lib/tareas-orden.ts` (puros)

- [ ] **Test `lib/texto.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { normalizar } from "./texto";

describe("normalizar", () => {
  it("quita acentos y baja a minúsculas", () => {
    expect(normalizar("Pintar TERRAZA")).toBe("pintar terraza");
    expect(normalizar("Ñandú Árbol")).toBe("nandu arbol");
    expect(normalizar("")).toBe("");
  });
});
```

- [ ] **Implementar `lib/texto.ts`**

```ts
// Sin acentos ni mayúsculas, para comparar y buscar. Compartida por Combobox y la lista.
export function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}
```

- [ ] **Test `lib/tareas-orden.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { buscarTareas, ordenarTareas } from "./tareas-orden";
import type { Tarea } from "@/types";

const t = (over: Partial<Tarea>): Tarea =>
  ({
    rowId: "2026-09-10T10:00:00.000-03:00", objetivo: "x", fechaInicio: "2026-09-10", fechaEstimada: "",
    edificio: "E", parteComun: false, dpto: "1A", informe: "", imagenes: [], videos: [], documentos: [],
    estado: "Sin asignar", prioridad: "Media", supervisor: "s@x.com", ...over,
  }) as Tarea;

describe("buscarTareas", () => {
  const lista = [
    t({ rowId: "a", objetivo: "Pintar pasillo" }),
    t({ rowId: "b", edificio: "Garay 350" }),
    t({ rowId: "c", dpto: "Terraza" }),
    t({ rowId: "d", proveedor: "Plomería López" }),
    t({ rowId: "e", informe: "Filtración en el baño" }),
  ];
  it("q vacío devuelve todo", () => expect(buscarTareas(lista, "  ")).toBe(lista));
  it.each([
    ["pasillo", "a"], ["garay", "b"], ["terraza", "c"], ["lopez", "d"], ["filtracion", "e"],
  ])("coincide por %s", (q, id) => {
    expect(buscarTareas(lista, q).map((x) => x.rowId)).toEqual([id]);
  });
  it("ignora acentos y mayúsculas en ambos lados", () => {
    expect(buscarTareas(lista, "PLOMERÍA").map((x) => x.rowId)).toEqual(["d"]);
  });
  it("sin coincidencia → []", () => expect(buscarTareas(lista, "zzz")).toEqual([]));
});

describe("ordenarTareas", () => {
  const r = (iso: string) => `${iso}T10:00:00.000-03:00`;
  const abiertaBaja = t({ rowId: r("2026-09-01"), prioridad: "Baja" });
  const cerradaAlta = t({ rowId: r("2026-09-02"), prioridad: "Alta", estado: "Realizada" });
  const abiertaAlta = t({ rowId: r("2026-09-03"), prioridad: "Alta" });
  const abiertaMedia = t({ rowId: r("2026-09-04"), prioridad: "Media" });
  const abiertaAltaVieja = t({ rowId: r("2026-08-01"), prioridad: "Alta" });
  const lista = [abiertaBaja, cerradaAlta, abiertaAlta, abiertaMedia, abiertaAltaVieja];
  const ids = (l: Tarea[]) => l.map((x) => x.rowId.slice(0, 10));

  it("prioridad: abiertas antes que cerradas, Alta→Media→Baja, más reciente primero", () => {
    expect(ids(ordenarTareas(lista, "prioridad"))).toEqual([
      "2026-09-03", "2026-08-01", "2026-09-04", "2026-09-01", "2026-09-02",
    ]);
  });
  it("recientes / antiguas por fecha de creación (rowId)", () => {
    expect(ids(ordenarTareas(lista, "recientes"))[0]).toBe("2026-09-04");
    expect(ids(ordenarTareas(lista, "antiguas"))[0]).toBe("2026-08-01");
  });
  it("estimada: con fecha ascendente, sin fecha al final", () => {
    const l = [
      t({ rowId: r("2026-09-01"), fechaEstimada: "" }),
      t({ rowId: r("2026-09-02"), fechaEstimada: "2026-10-05" }),
      t({ rowId: r("2026-09-03"), fechaEstimada: "2026-09-25" }),
    ];
    expect(ids(ordenarTareas(l, "estimada"))).toEqual(["2026-09-03", "2026-09-02", "2026-09-01"]);
  });
  it("rowId no parseable va al final y no muta el array", () => {
    const raro = t({ rowId: "sin-fecha" });
    const l = [raro, abiertaAlta];
    const out = ordenarTareas(l, "recientes");
    expect(out[out.length - 1]).toBe(raro);
    expect(l[0]).toBe(raro);
  });
});
```

- [ ] **Implementar `lib/tareas-orden.ts`**

```ts
import type { Prioridad, Tarea } from "@/types";
import { normalizar } from "./texto";

export type OrdenTareas = "prioridad" | "recientes" | "antiguas" | "estimada";
export const ORDENES: { value: OrdenTareas; label: string }[] = [
  { value: "prioridad", label: "Prioridad" },
  { value: "recientes", label: "Más recientes" },
  { value: "antiguas", label: "Más antiguas" },
  { value: "estimada", label: "Fecha estimada" },
];

// Búsqueda en memoria, sin acentos ni mayúsculas, sobre los campos de texto que el
// encargado recuerda: qué, dónde y quién.
export function buscarTareas(tareas: Tarea[], q: string): Tarea[] {
  const needle = normalizar(q.trim());
  if (!needle) return tareas;
  return tareas.filter((t) =>
    normalizar([t.objetivo, t.edificio, t.dpto, t.proveedor ?? "", t.informe].join(" ")).includes(needle)
  );
}

const PESO_PRIORIDAD: Record<Prioridad, number> = { Alta: 0, Media: 1, Baja: 2 };

// Creación a partir del rowId (timestamp ISO). No parseable → -Infinity (al final en desc).
function creacion(t: Tarea): number {
  const ms = Date.parse(t.rowId);
  return Number.isNaN(ms) ? -Infinity : ms;
}

// Devuelve copia ordenada. Estable.
export function ordenarTareas(tareas: Tarea[], orden: OrdenTareas): Tarea[] {
  const copia = [...tareas];
  switch (orden) {
    case "recientes":
      return copia.sort((a, b) => creacion(b) - creacion(a));
    case "antiguas":
      return copia.sort((a, b) => creacion(a) - creacion(b));
    case "estimada":
      return copia.sort((a, b) => {
        if (a.fechaEstimada && b.fechaEstimada) return a.fechaEstimada.localeCompare(b.fechaEstimada);
        if (a.fechaEstimada) return -1;
        if (b.fechaEstimada) return 1;
        return creacion(b) - creacion(a);
      });
    case "prioridad":
    default:
      return copia.sort((a, b) => {
        const cerradaA = a.estado === "Realizada" ? 1 : 0;
        const cerradaB = b.estado === "Realizada" ? 1 : 0;
        if (cerradaA !== cerradaB) return cerradaA - cerradaB;
        const pa = PESO_PRIORIDAD[a.prioridad] ?? 1;
        const pb = PESO_PRIORIDAD[b.prioridad] ?? 1;
        if (pa !== pb) return pa - pb;
        return creacion(b) - creacion(a);
      });
  }
}
```

Nota: `-Infinity - -Infinity` es `NaN` → `sort` lo trata como 0 (igual); solo pasa entre dos rowIds inválidos. Aceptable.

- [ ] **Correr** `npx vitest run lib/texto.test.ts lib/tareas-orden.test.ts` → PASS. **Checkpoint.**

---

### Task 2: `Combobox` estricto

- [ ] **Test `components/ui/Combobox.test.tsx`**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Combobox } from "./Combobox";

const OPCIONES = ["Belgrano 1429", "Garay 350", "Castro Barros 1310"];

describe("Combobox (no strict)", () => {
  it("tipear dispara onChange con el texto (valor libre)", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Combobox value="" onChange={onChange} options={OPCIONES} aria-label="Proveedor" />);
    await user.type(screen.getByRole("combobox", { name: "Proveedor" }), "Nuevo");
    expect(onChange).toHaveBeenLastCalledWith("Nuevo");
  });
});

describe("Combobox strict", () => {
  function Sujeto({ onChange, inicial = "" }: { onChange: (v: string) => void; inicial?: string }) {
    return <Combobox strict value={inicial} onChange={onChange} options={OPCIONES} aria-label="Edificio" placeholder="Todos" />;
  }

  it("elegir una opción dispara onChange", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Sujeto onChange={onChange} />);
    await user.click(screen.getByRole("combobox", { name: "Edificio" }));
    await user.click(screen.getByRole("option", { name: "Garay 350" }));
    expect(onChange).toHaveBeenCalledWith("Garay 350");
  });

  it("tipear filtra sin disparar onChange; coincidencia exacta al salir la toma", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Sujeto onChange={onChange} />);
    const input = screen.getByRole("combobox", { name: "Edificio" });
    await user.type(input, "garay");
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("option", { name: "Garay 350" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Belgrano 1429" })).not.toBeInTheDocument();
    await user.clear(input);
    await user.type(input, "garay 350");
    await user.tab();
    expect(onChange).toHaveBeenCalledWith("Garay 350");
  });

  it("tipear algo inválido y salir revierte al valor, sin onChange", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Sujeto onChange={onChange} inicial="Garay 350" />);
    const input = screen.getByRole("combobox", { name: "Edificio" });
    await user.clear(input);
    await user.type(input, "zzz");
    await user.tab();
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveValue("Garay 350");
  });

  it("vaciar y salir dispara onChange('')", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Sujeto onChange={onChange} inicial="Garay 350" />);
    await user.clear(screen.getByRole("combobox", { name: "Edificio" }));
    await user.tab();
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("el botón ✕ limpia", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Sujeto onChange={onChange} inicial="Garay 350" />);
    await user.click(screen.getByRole("button", { name: "Limpiar" }));
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("al enfocar con un valor elegido muestra todas las opciones", async () => {
    const user = userEvent.setup();
    render(<Sujeto onChange={vi.fn()} inicial="Garay 350" />);
    await user.click(screen.getByRole("combobox", { name: "Edificio" }));
    expect(screen.getAllByRole("option")).toHaveLength(3);
  });
});
```

- [ ] **Implementar.** Reescribir `components/ui/Combobox.tsx`:

```tsx
"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { normalizar } from "@/lib/texto";

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  // strict: solo se puede elegir una opción. Lo tipeado que no coincide se descarta al salir.
  strict?: boolean;
  "aria-label"?: string;
}

// Combobox: input con dropdown estilado (se despliega debajo, como un select) que filtra
// las opciones mientras se escribe. Sin `strict` además permite tipear un valor nuevo
// (proveedor). Con `strict` el texto del input es estado interno y `onChange` solo dispara
// al elegir una opción o al vaciar (edificio).
export function Combobox({ value, onChange, options, placeholder, disabled, id, strict, "aria-label": ariaLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [texto, setTexto] = useState(value);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useId();

  // El valor puede cambiar desde afuera (reset del form, URL): resincronizar el texto.
  useEffect(() => setTexto(value), [value]);

  // Cerrar al hacer click fuera.
  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        if (strict) confirmar();
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  });

  const mostrado = strict ? texto : value;
  const filtered = useMemo(() => {
    const q = normalizar(mostrado.trim());
    // strict recién enfocado (texto === value): mostrar todo, no filtrar por lo ya elegido.
    if (!q || (strict && mostrado === value)) return options;
    return options.filter((o) => normalizar(o).includes(q));
  }, [options, mostrado, strict, value]);

  const openList = () => {
    setOpen(true);
    setHighlight(0);
  };

  const select = (opt: string) => {
    onChange(opt);
    setTexto(opt);
    setOpen(false);
  };

  // strict: al salir, tomar la coincidencia exacta, vaciar, o revertir.
  const confirmar = () => {
    if (!strict) return;
    const t = texto.trim();
    if (t === "") {
      if (value !== "") onChange("");
      setTexto("");
      return;
    }
    const exacta = options.find((o) => normalizar(o) === normalizar(t));
    if (exacta) {
      if (exacta !== value) onChange(exacta);
      setTexto(exacta);
    } else {
      setTexto(value);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        openList();
        return;
      }
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      if (open && filtered[highlight]) {
        e.preventDefault();
        select(filtered[highlight]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      confirmar();
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <input
        id={id}
        type="text"
        className={strict && value ? "input pr-16" : "input pr-9"}
        value={mostrado}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        onChange={(e) => {
          if (strict) setTexto(e.target.value);
          else onChange(e.target.value);
          openList();
        }}
        onFocus={openList}
        onBlur={() => {
          setOpen(false);
          confirmar();
        }}
        onKeyDown={onKeyDown}
      />
      <div className="absolute inset-y-0 right-0 flex items-center">
        {strict && value && !disabled && (
          <button
            type="button"
            tabIndex={-1}
            aria-label="Limpiar"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onChange("");
              setTexto("");
            }}
            className="flex items-center px-1.5 text-slate-400 hover:text-slate-600"
          >
            <X size={14} />
          </button>
        )}
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          aria-label="Mostrar opciones"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setOpen((o) => !o)}
          className="flex items-center px-2 text-slate-400 disabled:opacity-50"
        >
          <ChevronDown size={16} className={open ? "rotate-180 transition-transform" : "transition-transform"} />
        </button>
      </div>

      {open && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {filtered.length === 0 && (
            <li className="px-3 py-2 text-sm text-slate-400">Sin opciones</li>
          )}
          {filtered.map((opt, i) => (
            <li
              key={opt}
              role="option"
              aria-selected={opt === value}
              onMouseDown={(e) => {
                // Evita que el blur del input cierre el dropdown antes del click.
                e.preventDefault();
                select(opt);
              }}
              onMouseEnter={() => setHighlight(i)}
              className={`cursor-pointer truncate px-3 py-2 text-sm ${
                i === highlight ? "bg-slate-100 text-slate-900" : "text-slate-700"
              }`}
            >
              {opt}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

Notas: el `onBlur` reemplaza al click-fuera para `confirmar` en la mayoría de los casos; el listener de documento queda para cerrar la lista (y confirmar) si el foco no estaba en el input. `onMouseDown={preventDefault}` en los botones evita que el blur del input dispare `confirmar` antes del click. El `<li role="option">` recibe el click directo: `user.click(getByRole("option"))` funciona en tests.

- [ ] **Correr** `npx vitest run components/ui/Combobox.test.tsx` → PASS (7). Después `npx vitest run components/tareas/TareaForm.test.tsx components/tareas/hooks` para confirmar que el uso no-strict (proveedor) sigue verde. **Checkpoint.**

---

### Task 3: `Toaster` + `ToastProvider` en el layout

- [ ] **Test `components/ui/Toaster.test.tsx`**

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act, fireEvent, renderHook } from "@testing-library/react";
import { ToastProvider, useToast } from "./Toaster";

function Disparador({ n = 1, tipo = "success" as const }: { n?: number; tipo?: "success" | "error" }) {
  const toast = useToast();
  return (
    <button onClick={() => { for (let i = 0; i < n; i++) toast[tipo](`Aviso ${i + 1}`); }}>disparar</button>
  );
}

afterEach(() => vi.useRealTimers());

describe("Toaster", () => {
  it("success renderiza con role=status y desaparece a los 4 s", () => {
    vi.useFakeTimers();
    render(<ToastProvider><Disparador /></ToastProvider>);
    fireEvent.click(screen.getByText("disparar"));
    expect(screen.getByRole("status")).toHaveTextContent("Aviso 1");
    act(() => { vi.advanceTimersByTime(4000); });
    expect(screen.queryByText("Aviso 1")).not.toBeInTheDocument();
  });

  it("tocar el toast lo cierra", () => {
    render(<ToastProvider><Disparador tipo="error" /></ToastProvider>);
    fireEvent.click(screen.getByText("disparar"));
    fireEvent.click(screen.getByText("Aviso 1"));
    expect(screen.queryByText("Aviso 1")).not.toBeInTheDocument();
  });

  it("más de 3 descarta el más viejo", () => {
    render(<ToastProvider><Disparador n={4} /></ToastProvider>);
    fireEvent.click(screen.getByText("disparar"));
    expect(screen.queryByText("Aviso 1")).not.toBeInTheDocument();
    expect(screen.getByText("Aviso 4")).toBeInTheDocument();
  });

  it("useToast sin provider no lanza", () => {
    const { result } = renderHook(() => useToast());
    expect(() => result.current.success("x")).not.toThrow();
  });
});
```

- [ ] **Implementar `components/ui/Toaster.tsx`**

```tsx
"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Tipo = "success" | "error";
interface Toast {
  id: number;
  tipo: Tipo;
  mensaje: string;
}
interface Api {
  success: (mensaje: string) => void;
  error: (mensaje: string) => void;
}

const DURACION_MS = 4000;
const MAXIMO = 3;

// Sin provider (tests de hooks/componentes sueltos) los avisos se descartan en silencio.
const noop: Api = { success: () => {}, error: () => {} };
const ToastContext = createContext<Api>(noop);

export function useToast(): Api {
  return useContext(ToastContext);
}

// Avisos breves de éxito/error, apilados abajo (sobre el bottom nav en mobile). Se cierran
// solos a los 4 s o al tocarlos. Reemplazan los modales de "listo" que pedían un tap extra.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const siguienteId = useRef(1);

  const cerrar = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const agregar = useCallback(
    (tipo: Tipo, mensaje: string) => {
      const id = siguienteId.current++;
      setToasts((prev) => [...prev, { id, tipo, mensaje }].slice(-MAXIMO));
      window.setTimeout(() => cerrar(id), DURACION_MS);
    },
    [cerrar]
  );

  const api = useMemo<Api>(
    () => ({ success: (m) => agregar("success", m), error: (m) => agregar("error", m) }),
    [agregar]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6"
      >
        {toasts.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => cerrar(t.id)}
            className={cn(
              "pointer-events-auto flex max-w-sm items-center gap-2 rounded-full border bg-white px-4 py-2 text-sm shadow-lg",
              t.tipo === "success" ? "border-emerald-200 text-slate-800" : "border-red-200 text-red-800"
            )}
          >
            {t.tipo === "success" ? (
              <CheckCircle2 size={16} className="shrink-0 text-emerald-600" />
            ) : (
              <XCircle size={16} className="shrink-0 text-red-600" />
            )}
            {t.mensaje}
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
```

- [ ] **Montar en `app/layout.tsx`:** `import { ToastProvider } from "@/components/ui/Toaster";` y envolver `{children}` (dentro de `QueryProvider`, después de `DemoBanner`): `<ToastProvider>{children}</ToastProvider>`.

- [ ] **`vitest.setup.ts`:** en el mock de `useRouter` agregar `replace: vi.fn()`.

- [ ] **Correr** `npx vitest run components/ui/Toaster.test.tsx` → PASS. **Checkpoint.**

---

### Task 4: `useListaTareas` + página con búsqueda, orden y Combobox

- [ ] **Test `components/tareas/hooks/useListaTareas.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { Tarea } from "@/types";

const { replace, params, useSession } = vi.hoisted(() => ({
  replace: vi.fn(),
  params: { current: new URLSearchParams() },
  useSession: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/tareas",
  useSearchParams: () => params.current,
}));
vi.mock("next-auth/react", () => ({ useSession }));
const { tareas } = vi.hoisted(() => ({ tareas: { current: [] as Tarea[] } }));
vi.mock("@/hooks/queries", () => ({
  useTareas: () => ({ data: tareas.current, isLoading: false, isError: false }),
  useEdificios: () => ({ data: [{ nombre: "E1" }, { nombre: "E2" }] }),
}));

import { useListaTareas } from "./useListaTareas";

const t = (over: Partial<Tarea>): Tarea =>
  ({
    rowId: "2026-09-10T10:00:00.000-03:00", objetivo: "x", fechaInicio: "2026-09-10", fechaEstimada: "",
    edificio: "E1", parteComun: false, dpto: "1A", informe: "", imagenes: [], videos: [], documentos: [],
    estado: "Sin asignar", prioridad: "Media", supervisor: "s@x.com", ...over,
  }) as Tarea;

beforeEach(() => {
  vi.clearAllMocks();
  params.current = new URLSearchParams();
  useSession.mockReturnValue({ data: { user: { email: "yo@x.com", rol: "admin" } } });
  tareas.current = [
    t({ rowId: "2026-09-01T10:00:00.000-03:00", objetivo: "Pintar", estado: "Realizada", edificio: "E2", asignadoA: "yo@x.com" }),
    t({ rowId: "2026-09-02T10:00:00.000-03:00", objetivo: "Luz", estado: "En Proceso", prioridad: "Alta" }),
  ];
});

describe("useListaTareas", () => {
  it("lee los filtros de la URL y abre el panel si hay filtros avanzados", () => {
    params.current = new URLSearchParams("estado=En+Proceso&mias=1&q=luz&orden=antiguas");
    const { result } = renderHook(() => useListaTareas());
    expect(result.current.filtros).toMatchObject({ estado: "En Proceso", mias: true, q: "luz", orden: "antiguas" });
    expect(result.current.hayFiltrosAvanzados).toBe(true);
  });

  it("un valor inválido en la URL cuenta como vacío/default", () => {
    params.current = new URLSearchParams("estado=Inventado&orden=zzz");
    const { result } = renderHook(() => useListaTareas());
    expect(result.current.filtros.estado).toBe("");
    expect(result.current.filtros.orden).toBe("prioridad");
    expect(result.current.hayFiltrosAvanzados).toBe(false);
  });

  it("setFiltro actualiza el estado y hace replace sin scroll; los defaults no van a la URL", () => {
    const { result } = renderHook(() => useListaTareas());
    act(() => result.current.setFiltro("estado", "En Proceso"));
    expect(result.current.tareas.map((x) => x.objetivo)).toEqual(["Luz"]);
    expect(replace).toHaveBeenLastCalledWith("/tareas?estado=En+Proceso", { scroll: false });
    act(() => result.current.setFiltro("estado", ""));
    expect(replace).toHaveBeenLastCalledWith("/tareas", { scroll: false });
  });

  it("mias y sinAsignar se excluyen", () => {
    const { result } = renderHook(() => useListaTareas());
    act(() => result.current.setFiltro("sinAsignar", true));
    act(() => result.current.setFiltro("mias", true));
    expect(result.current.filtros).toMatchObject({ mias: true, sinAsignar: false });
    expect(result.current.tareas.map((x) => x.objetivo)).toEqual(["Pintar"]);
  });

  it("orden por defecto: abiertas primero", () => {
    const { result } = renderHook(() => useListaTareas());
    expect(result.current.tareas.map((x) => x.objetivo)).toEqual(["Luz", "Pintar"]);
  });
});
```

- [ ] **Implementar `components/tareas/hooks/useListaTareas.ts`**

```ts
"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEdificios, useTareas } from "@/hooks/queries";
import { filterTareas } from "@/lib/tareas-filter";
import { buscarTareas, ordenarTareas, ORDENES, type OrdenTareas } from "@/lib/tareas-orden";
import { estadoEnum, prioridadEnum } from "@/lib/schemas";
import type { EstadoTarea, Prioridad } from "@/types";

export interface FiltrosLista {
  edificio: string; // "" = todos
  estado: EstadoTarea | ""; // "" = todos
  prioridad: Prioridad | ""; // "" = todas
  mias: boolean;
  sinAsignar: boolean;
  q: string;
  orden: OrdenTareas;
}

const DEFAULTS: FiltrosLista = {
  edificio: "", estado: "", prioridad: "", mias: false, sinAsignar: false, q: "", orden: "prioridad",
};

// URL → filtros. Valores inválidos (enum, orden) cuentan como default.
export function leerFiltros(params: URLSearchParams): FiltrosLista {
  const estado = estadoEnum.safeParse(params.get("estado"));
  const prioridad = prioridadEnum.safeParse(params.get("prioridad"));
  const orden = params.get("orden");
  return {
    edificio: params.get("edificio") ?? "",
    estado: estado.success ? estado.data : "",
    prioridad: prioridad.success ? prioridad.data : "",
    mias: params.get("mias") === "1",
    sinAsignar: params.get("sinAsignar") === "1",
    q: params.get("q") ?? "",
    orden: ORDENES.some((o) => o.value === orden) ? (orden as OrdenTareas) : "prioridad",
  };
}

// Filtros → query string. Omite defaults: la URL limpia es /tareas.
export function escribirFiltros(f: FiltrosLista): string {
  const p = new URLSearchParams();
  if (f.edificio) p.set("edificio", f.edificio);
  if (f.estado) p.set("estado", f.estado);
  if (f.prioridad) p.set("prioridad", f.prioridad);
  if (f.mias) p.set("mias", "1");
  if (f.sinAsignar) p.set("sinAsignar", "1");
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.orden !== DEFAULTS.orden) p.set("orden", f.orden);
  return p.toString();
}

// Lógica de /tareas: filtros con la URL como persistencia (estado local sembrado al montar,
// router.replace en cada cambio; volver del detalle remonta y relee), búsqueda y orden en
// memoria sobre la query única de tareas.
export function useListaTareas() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const myEmail = session?.user?.email?.toLowerCase() ?? "";
  const isAdmin = !session?.user || session.user.rol === "admin";

  const [filtros, setFiltros] = useState<FiltrosLista>(() => leerFiltros(searchParams));
  const [hayFiltrosAvanzados] = useState(
    () => !!(filtros.edificio || filtros.estado || filtros.prioridad)
  );

  const setFiltro = <K extends keyof FiltrosLista>(k: K, v: FiltrosLista[K]) => {
    setFiltros((prev) => {
      const next = { ...prev, [k]: v };
      // "Mis tareas" y "Sin asignar" se excluyen: activar uno apaga el otro.
      if (k === "mias" && v) next.sinAsignar = false;
      if (k === "sinAsignar" && v) next.mias = false;
      const qs = escribirFiltros(next);
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      return next;
    });
  };

  const tareasQ = useTareas();
  const edificiosQ = useEdificios();

  const tareas = useMemo(() => {
    const filtradas = filterTareas(tareasQ.data ?? [], {
      edificio: filtros.edificio || undefined,
      estado: filtros.estado || undefined,
      prioridad: filtros.prioridad || undefined,
      asignado: filtros.mias && myEmail ? myEmail : undefined,
      sinAsignar: filtros.sinAsignar || undefined,
    });
    return ordenarTareas(buscarTareas(filtradas, filtros.q), filtros.orden);
  }, [tareasQ.data, filtros, myEmail]);

  return { filtros, setFiltro, tareas, tareasQ, edificiosQ, hayFiltrosAvanzados, isAdmin, myEmail };
}
```

Nota: `router.replace` dentro del updater de `setFiltros` corre una vez por cambio (React puede invocar updaters dos veces en StrictMode dev; `replace` idempotente, sin efecto).

- [ ] **Reescribir `app/(app)/tareas/page.tsx`** sobre el hook. Cambios respecto al actual:
  - Imports: sacar `useSession`, `useSearchParams`, `useState/useMemo` que ya no se usan, `useEdificios/useTareas`, `filterTareas`, `SuccessDialog`, `Edificio`. Sumar `useListaTareas`, `Combobox`, `ORDENES`, `useToast`, `Search` de lucide.
  - `const { filtros, setFiltro, tareas, tareasQ, edificiosQ, hayFiltrosAvanzados, isAdmin } = useListaTareas();` y `const [showFilters, setShowFilters] = useState(hayFiltrosAvanzados);`.
  - Eliminar: `const toast = useToast();` en el hook `eliminar.onSuccess`: `toast.success("Tarea eliminada")` y `setToDelete(null)`; sacar `deleteDone` y el `<SuccessDialog>`.
  - Debajo del header, antes de los chips:
    ```tsx
    <div className="mt-3 flex flex-col gap-2 md:flex-row">
      <div className="relative flex-1">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          aria-label="Buscar tareas"
          placeholder="Buscar por objetivo, edificio, dpto…"
          value={filtros.q}
          onChange={(e) => setFiltro("q", e.target.value)}
          className="input pl-9"
        />
      </div>
      <select
        aria-label="Ordenar por"
        value={filtros.orden}
        onChange={(e) => setFiltro("orden", e.target.value as OrdenTareas)}
        className="input md:w-48"
      >
        {ORDENES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
    ```
  - Chips: `filtros.mias` / `setFiltro("mias", !filtros.mias)`; ídem `sinAsignar`.
  - Panel: Edificio → `<Combobox strict value={filtros.edificio} onChange={(v) => setFiltro("edificio", v)} options={(edificiosQ.data ?? []).map((e) => e.nombre)} placeholder="Todos" id="filtro-edificio" />` con `<label htmlFor="filtro-edificio">`; Estado/Prioridad: `value={filtros.estado || "Todos"}` → `setFiltro("estado", v === "Todos" ? "" : v)` (mantener las listas `ESTADOS`/`PRIORIDADES` con «Todos/Todas» como primer ítem para no cambiar el markup que testea `getByLabelText("Estado")`).
  - Vacío: `filtros.q ? \`No hay tareas que coincidan con "${filtros.q}"\` : "No hay tareas con esos filtros."`.

- [ ] **Adaptar `app/(app)/tareas/page.test.tsx`:** los 4 casos siguen (el `<select>` de Estado se mantiene). Sumar:
  ```tsx
  it("buscar reduce la lista en memoria", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("3 resultados");
    await user.type(screen.getByLabelText("Buscar tareas"), "plom");
    expect(await screen.findByText("1 resultado")).toBeInTheDocument();
    expect(screen.getByText("Plomería")).toBeInTheDocument();
    expect(api.tareas.list).toHaveBeenCalledTimes(1);
  });

  it("orden por defecto abiertas primero; 'Más antiguas' invierte", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("3 resultados");
    const titulos = () => screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(titulos()[titulos().length - 1]).toBe("Plomería"); // la Realizada al final
    await user.selectOptions(screen.getByLabelText("Ordenar por"), "antiguas");
    expect(titulos()[0]).toBe("Pintar");
  });
  ```
  Las fixtures del test tienen `rowId: "1"|"2"|"3"` (no parseables): para «antiguas» darles rowIds ISO crecientes (`2026-09-0{1,2,3}T…`).

- [ ] **Correr** `npx vitest run components/tareas/hooks/useListaTareas.test.tsx "app/(app)/tareas"` → PASS. **Checkpoint.**

---

### Task 5: Combobox en los otros 5 lugares + toasts en formularios

- [ ] **`TareaForm.tsx`:** reemplazar el `<select {...f.register("edificio")}>` por
  ```tsx
  <Controller
    control={f.control}
    name="edificio"
    render={({ field }) => (
      <Combobox
        strict
        id="edificio"
        value={field.value}
        onChange={field.onChange}
        options={(f.edificiosQ.data ?? []).map((e) => e.nombre)}
        placeholder="Elegí un edificio"
      />
    )}
  />
  ```
  (`Field` ya envuelve en `<label>`; si `Field` no pasa `htmlFor`, dejar `id` igual: el test usa `getByRole("combobox")` por placeholder). Sacar `<SuccessDialog>` y su import.

- [ ] **`useTareaForm.ts`:** `const toast = useToast();` (import de `@/components/ui/Toaster`). En `onSubmit` crear: `toast.success("Tarea creada"); onSubmitSuccess?.(result); router.push(\`/tareas/${encodeURIComponent(result.rowId)}\`); router.refresh(); return;`. Editar: `toast.success("Tarea editada"); onSubmitSuccess?.(result); return;`. Offline: antes del `router.push("/tareas")`, `toast.success("Guardada en el teléfono: se sube al volver la conexión")`. Borrar `successMsg`, `successResult`, `handleSuccessClose` y sus exports.

- [ ] **`useTareaForm.test.tsx`:** mock local `vi.mock("next/navigation", () => ({ useRouter: () => ({ push, back: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }))` con `push` hoisted; crear: `expect(push).toHaveBeenCalledWith(\`/tareas/${encodeURIComponent(validInitial.rowId)}\`)` en vez de `successMsg`; editar: `onSubmitSuccess` mock llamado con la tarea.

- [ ] **`VisitaForm.tsx`:** `<select>` → `<Combobox strict id="visita-edificio" value={edificio} onChange={setEdificio} options={edificios.map((e) => e.nombre)} placeholder="Elegí un edificio…" />`, con `<label htmlFor="visita-edificio">` (hoy el `<label>` envuelve; cambiar a `htmlFor` + `id` para que `getByLabelText("Edificio")` siga apuntando al input). `VisitaForm.test` `elegirEdificio`: `await user.click(screen.getByLabelText("Edificio")); await user.click(await screen.findByRole("option", { name: "Castro Barros 1310" }));`.

- [ ] **`InformeEdificio.tsx`:** igual, `id="informe-edificio"`, placeholder «Elegí un edificio…». `InformeEdificio.test` `elegirEdificio`: mismo patrón.

- [ ] **`Dashboard.tsx`:** el `FiltroSelect` de Edificio → `<label className="text-sm"><span className="mb-1 block text-slate-600">Edificio</span><Combobox strict value={edificio} onChange={setEdificio} options={(edificiosQ.data ?? []).map((e) => e.nombre)} placeholder="Todos" /></label>`. Sacar el import de `Edificio` si queda sin uso.

- [ ] **`IntegranteCard.tsx`:** `<select>` → `<div className="flex-1"><Combobox strict value={nuevoEdificio} onChange={setNuevoEdificio} options={sinAsignarQ.data ?? []} placeholder="Agregar edificio…" aria-label="Agregar edificio" /></div>`. Ojo: el botón «+» ya tiene `aria-label="Agregar edificio"` → el combobox usa `aria-label="Edificio a agregar"` para no duplicar. `IntegranteCard.test`: reemplazar `waitFor(option)` + `selectOptions` por `await user.click(screen.getByRole("combobox", { name: "Edificio a agregar" })); await user.click(await screen.findByRole("option", { name: "Belgrano 1429" }));`.

- [ ] **Correr** `npx vitest run components/tareas components/visitas components/informes components/edificios components/dashboard` → PASS. **Checkpoint.**

---

### Task 6: Reporte al cerrar (`after()` + polling) y toast al eliminar en el detalle

- [ ] **Ruta:** en `app/api/tareas/[id]/route.ts`, `import { NextResponse } from "next/server";` → `import { NextResponse, after } from "next/server";` y reemplazar el bloque `generateAndUploadReporte(updated).then(...).catch(...)` por:
  ```ts
  // Auto-reporte al cerrar: after() garantiza que corre después de responder, dentro del
  // maxDuration. Si falla, queda cerrada sin reporte; el admin puede generarlo a mano.
  after(async () => {
    try {
      const r = await generateAndUploadReporte(updated);
      await updateTarea({ rowId: updated.rowId, reporteUrl: r.url });
    } catch (err) {
      console.error("[reporte-auto] error:", err);
    }
  });
  ```
- [ ] **`tests/api/tareas-transiciones.test.ts`:** agregar arriba `vi.mock("next/server", async (orig) => { const real = await orig<typeof import("next/server")>(); return { ...real, after: (fn: () => unknown) => { void fn(); } }; });`. Correr `npx vitest run tests/api/tareas-transiciones.test.ts` → PASS.

- [ ] **`useTareaDetalle.ts`:**
  ```ts
  const toast = useToast();
  const [intentosReporte, setIntentosReporte] = useState(0);
  const tareaQ = useQuery({
    …,
    // Tras cerrar, el reporte se genera en el server: repollar cada 3 s hasta que llegue
    // reporteUrl, con tope (si la generación falló, el admin ve "Generar reporte").
    refetchInterval: (query) => {
      const t = query.state.data;
      if (t?.estado !== "Realizada" || t.reporteUrl) return false;
      return intentosReporte < MAX_INTENTOS_REPORTE ? 3000 : false;
    },
  });
  const t = tareaQ.data;
  const esperandoReporte = t?.estado === "Realizada" && !t.reporteUrl && intentosReporte < MAX_INTENTOS_REPORTE;
  // Cuenta refetches mientras se espera; se resetea al cambiar de tarea o al llegar el reporte.
  useEffect(() => { setIntentosReporte(0); }, [rowId]);
  useEffect(() => {
    if (t?.estado === "Realizada" && !t.reporteUrl) setIntentosReporte((n) => n + 1);
    else setIntentosReporte(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tareaQ.dataUpdatedAt]);
  ```
  con `const MAX_INTENTOS_REPORTE = 20;` a nivel módulo. Eliminar: `onSuccess: () => { toast.success("Tarea eliminada"); qc.invalidateQueries(["tareas"]); qc.removeQueries(["tarea", rowId]); router.push("/tareas"); router.refresh(); }`; borrar `deleteDone`, `onDeleteDoneClose`, `setConfirmDelete(false)` innecesario. Exportar `esperandoReporte`.

- [ ] **`TareaDetalle.tsx`:** sacar `deleteDone`, `onDeleteDoneClose`, el `<SuccessDialog>` y su import; reemplazar el `<p>` «El reporte se genera automáticamente…» por:
  ```tsx
  {isAdmin && t.estado === "Realizada" && !t.reporteUrl && (
    esperandoReporte ? (
      <p className="mt-2 flex items-center gap-2 text-xs text-slate-500">
        <Loader2 size={12} className="animate-spin" /> Generando el reporte…
      </p>
    ) : (
      <p className="mt-2 text-xs text-slate-500">El reporte no se generó. Podés generarlo con el botón.</p>
    )
  )}
  ```

- [ ] **`useTareaDetalle.test.tsx`:** agregar (fake timers):
  ```ts
  it("Realizada sin reporte: repolla cada 3 s y para cuando llega reporteUrl", async () => {
    vi.useFakeTimers();
    const realizada = { ...tarea, estado: "Realizada" as const };
    vi.mocked(api.tareas.get)
      .mockResolvedValueOnce(realizada)
      .mockResolvedValueOnce(realizada)
      .mockResolvedValue({ ...realizada, reporteUrl: "http://x/r.pdf" });
    const { result } = renderHook(() => useTareaDetalle("r1"), { wrapper: createWrapper() });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.esperandoReporte).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(api.tareas.get).toHaveBeenCalledTimes(3);
    expect(result.current.esperandoReporte).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(9000); });
    expect(api.tareas.get).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it("no Realizada: sin polling", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useTareaDetalle("r1"), { wrapper: createWrapper() });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(api.tareas.get).toHaveBeenCalledTimes(1);
    expect(result.current.esperandoReporte).toBe(false);
    vi.useRealTimers();
  });
  ```
  El caso del tope (20) se cubre sin timers: renderizar con `intentosReporte` no es accesible → se verifica indirectamente: con `get` devolviendo siempre `realizada` sin reporte, avanzar 21 × 3 s y afirmar `get` llamado ≤ 21 veces y `esperandoReporte === false`.

- [ ] **Correr** `npx vitest run components/tareas tests/components tests/api` → PASS. **Checkpoint.**

---

### Task 7: Verificación final

- [ ] `npm test` → PASS.
- [ ] `npx tsc --noEmit` → sin salida.
- [ ] `npm run lint` → 0 errores.
- [ ] `npm run build` → OK.
- [ ] `grep -rn "SuccessDialog" components app --include=*.tsx | grep -v test | grep -v "ui/SuccessDialog"` → solo `VisitaForm.tsx`.
- [ ] `grep -rn "<select" components app --include=*.tsx | grep -v test | grep -i edificio` → sin salida (los 6 migrados).
- [ ] Reporte: verde, listo para commitear.
