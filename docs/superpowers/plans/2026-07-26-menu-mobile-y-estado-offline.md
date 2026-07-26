# Menú mobile (hamburguesa) + indicador de estado offline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Commits:** los hace Jony con GitLens. NO ejecutar `git commit`. Cada task deja el árbol
> compilando; la verificación completa (tsc + lint + tests + build) va en la Task 4.

**Goal:** Reorganizar la navegación mobile del shell (hamburguesa + drawer, bottom nav de 3
destinos con selección por pill, barra un poco más alta) y agregar un indicador de estado de
conexión (verde/ámbar/rojo) con modal informativo, visible en mobile y desktop.

**Architecture:** Todo el cambio vive en `components/layout/`. Se crean dos componentes
(`OfflineIndicator`, `MobileDrawer`), se reescribe el bloque `md:hidden` de `AppShell` y se
reemplaza el `OfflineBadge` por `OfflineIndicator` en ambos lugares. El sidebar `md:flex` de
desktop no cambia salvo ese reemplazo. La lógica de sincronización offline no se toca.

**Tech Stack:** Next 16 (App Router), React 19, TypeScript, Tailwind, lucide-react, next-auth
(`useSession`/`signOut`), Vitest + Testing Library. Hooks existentes: `useOnlineStatus`,
`usePendingCount`.

**Spec:** [`../specs/2026-07-26-menu-mobile-y-estado-offline-design.md`](../specs/2026-07-26-menu-mobile-y-estado-offline-design.md)

---

## Estructura de archivos

- **Crear** `components/layout/OfflineIndicator.tsx` — punto de estado + modal informativo. Mobile y desktop.
- **Crear** `components/layout/OfflineIndicator.test.tsx`
- **Crear** `components/layout/MobileDrawer.tsx` — drawer lateral + overlay (solo mobile).
- **Crear** `components/layout/MobileDrawer.test.tsx`
- **Crear** `components/layout/AppShell.test.tsx`
- **Modificar** `components/layout/AppShell.tsx` — header mobile, drawer, bottom nav, indicador en desktop.
- **Eliminar** `components/layout/OfflineBadge.tsx` (reemplazado por `OfflineIndicator`).

---

## Task 1: OfflineIndicator (punto de estado + modal)

**Files:**
- Create: `components/layout/OfflineIndicator.tsx`
- Test: `components/layout/OfflineIndicator.test.tsx`

- [ ] **Step 1: Escribir el test que falla**

`components/layout/OfflineIndicator.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OfflineIndicator } from "./OfflineIndicator";

vi.mock("@/hooks/useOnlineStatus", () => ({ useOnlineStatus: vi.fn() }));
vi.mock("@/hooks/usePendingTareas", () => ({ usePendingCount: vi.fn() }));

import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { usePendingCount } from "@/hooks/usePendingTareas";

const mockOnline = (v: boolean) => vi.mocked(useOnlineStatus).mockReturnValue(v);
const mockPending = (n: number) => vi.mocked(usePendingCount).mockReturnValue(n);

beforeEach(() => vi.clearAllMocks());

describe("OfflineIndicator", () => {
  it("online sin pendientes: punto verde, sin número", () => {
    mockOnline(true);
    mockPending(0);
    render(<OfflineIndicator />);
    const btn = screen.getByRole("button", { name: /conexión|conectado|al día/i });
    expect(btn.querySelector(".bg-emerald-500")).toBeTruthy();
    expect(screen.queryByText(/^\d+$/)).not.toBeInTheDocument();
  });

  it("online con pendientes: punto ámbar con el número", () => {
    mockOnline(true);
    mockPending(3);
    render(<OfflineIndicator />);
    expect(screen.getByText("3")).toBeInTheDocument();
    const btn = screen.getByRole("button");
    expect(btn.querySelector(".bg-amber-500")).toBeTruthy();
  });

  it("offline: punto rojo y el modal se abre automáticamente", () => {
    mockOnline(false);
    mockPending(0);
    render(<OfflineIndicator />);
    const btn = screen.getByRole("button");
    expect(btn.querySelector(".bg-red-500")).toBeTruthy();
    // Auto-open al primer offline de la sesión:
    expect(screen.getByText(/modo sin conexión/i)).toBeInTheDocument();
  });

  it("tocar el punto abre el modal (estando online)", () => {
    mockOnline(true);
    mockPending(0);
    render(<OfflineIndicator />);
    expect(screen.queryByText(/modo sin conexión/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText(/modo sin conexión/i)).toBeInTheDocument();
    // Cierra con "Entendido"
    fireEvent.click(screen.getByRole("button", { name: /entendido/i }));
    expect(screen.queryByText(/modo sin conexión/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run components/layout/OfflineIndicator.test.tsx`
Expected: FAIL (no existe `./OfflineIndicator`).

- [ ] **Step 3: Implementar el componente**

`components/layout/OfflineIndicator.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { usePendingCount } from "@/hooks/usePendingTareas";
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
}

// Punto de estado de conexión (mobile + desktop). Verde = online y al día;
// ámbar + número = online con cola por subir; rojo = offline. Al tocarlo abre un
// modal explicando el modo sin conexión. Se abre solo una vez al primer offline
// de la sesión.
export function OfflineIndicator({ className }: Props) {
  // Mount guard: el server render devuelve null (el estado de red vive solo en cliente).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const online = useOnlineStatus();
  const pending = usePendingCount();
  const [modalOpen, setModalOpen] = useState(false);
  const autoShownRef = useRef(false);

  // Apertura automática única al primer offline de la sesión.
  useEffect(() => {
    if (!mounted) return;
    if (!online && !autoShownRef.current) {
      autoShownRef.current = true;
      setModalOpen(true);
    }
  }, [mounted, online]);

  if (!mounted) return null;

  const color = !online
    ? "bg-red-500"
    : pending > 0
      ? "bg-amber-500"
      : "bg-emerald-500";

  const label = !online
    ? "Sin conexión"
    : pending > 0
      ? `${pending} tarea${pending !== 1 ? "s" : ""} pendiente${pending !== 1 ? "s" : ""} de subir — conexión al día`
      : "Conectado — todo al día";

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        aria-label={label}
        title={label}
        className={cn("flex items-center gap-1.5", className)}
      >
        <span className={cn("inline-block h-2.5 w-2.5 rounded-full", color)} />
        {online && pending > 0 && (
          <span className="text-xs font-semibold text-amber-700">{pending}</span>
        )}
      </button>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-slate-900">Modo sin conexión</h3>
            <p className="mt-2 text-sm text-slate-600">
              Podés crear tareas aunque no tengas internet: se guardan en tu teléfono y se suben
              solas apenas vuelva la conexión.
            </p>
            <ul className="mt-3 space-y-1 text-sm text-slate-600">
              <li className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" /> Verde: todo al día
              </li>
              <li className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" /> Ámbar: subiendo pendientes
              </li>
              <li className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" /> Rojo: sin conexión
              </li>
            </ul>
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="mt-5 w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run components/layout/OfflineIndicator.test.tsx`
Expected: PASS (4 tests).

---

## Task 2: MobileDrawer (drawer lateral)

**Files:**
- Create: `components/layout/MobileDrawer.tsx`
- Test: `components/layout/MobileDrawer.test.tsx`

- [ ] **Step 1: Escribir el test que falla**

`components/layout/MobileDrawer.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Users, Settings } from "lucide-react";
import { MobileDrawer } from "./MobileDrawer";

const signOut = vi.fn();
vi.mock("next-auth/react", () => ({ signOut: (...a: unknown[]) => signOut(...a) }));

const adminItems = [
  { href: "/usuarios", label: "Usuarios", Icon: Users },
  { href: "/configuracion", label: "Config", Icon: Settings },
];

beforeEach(() => vi.clearAllMocks());

describe("MobileDrawer", () => {
  it("cerrado (open=false): no renderiza nada", () => {
    const { container } = render(
      <MobileDrawer open={false} onClose={() => {}} email="a@x.com" items={adminItems} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("abierto: muestra email, items y Cerrar sesión", () => {
    render(<MobileDrawer open onClose={() => {}} email="a@x.com" items={adminItems} />);
    expect(screen.getByText("a@x.com")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /usuarios/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /config/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cerrar sesión/i })).toBeInTheDocument();
  });

  it("sin items admin: igual muestra Cerrar sesión (rol no-admin)", () => {
    render(<MobileDrawer open onClose={() => {}} email="op@x.com" items={[]} />);
    expect(screen.queryByRole("link", { name: /usuarios/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cerrar sesión/i })).toBeInTheDocument();
  });

  it("cierra al tocar el overlay", () => {
    const onClose = vi.fn();
    render(<MobileDrawer open onClose={onClose} email="a@x.com" items={adminItems} />);
    fireEvent.click(screen.getByTestId("drawer-overlay"));
    expect(onClose).toHaveBeenCalled();
  });

  it("cierra con la X", () => {
    const onClose = vi.fn();
    render(<MobileDrawer open onClose={onClose} email="a@x.com" items={adminItems} />);
    fireEvent.click(screen.getByRole("button", { name: /cerrar menú/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("cierra con Escape", () => {
    const onClose = vi.fn();
    render(<MobileDrawer open onClose={onClose} email="a@x.com" items={adminItems} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("Cerrar sesión llama a signOut", () => {
    render(<MobileDrawer open onClose={() => {}} email="a@x.com" items={adminItems} />);
    fireEvent.click(screen.getByRole("button", { name: /cerrar sesión/i }));
    expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" });
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run components/layout/MobileDrawer.test.tsx`
Expected: FAIL (no existe `./MobileDrawer`).

- [ ] **Step 3: Implementar el componente**

`components/layout/MobileDrawer.tsx`:

```tsx
"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { useEffect } from "react";
import { LogOut, X } from "lucide-react";
import type { ComponentType } from "react";

interface DrawerItem {
  href: string;
  label: string;
  Icon: ComponentType<{ size?: number }>;
}

interface Props {
  open: boolean;
  onClose: () => void;
  email?: string | null;
  items: DrawerItem[];
}

// Drawer lateral mobile (desde la izquierda). Contiene los destinos de admin
// (Usuarios/Config, ya filtrados por el shell) y "Cerrar sesión" para todos los roles.
export function MobileDrawer({ open, onClose, email, items }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true">
      <div
        data-testid="drawer-overlay"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div className="absolute left-0 top-0 flex h-full w-72 max-w-[80%] flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4">
          <span className="text-sm font-semibold text-slate-900">Menú</span>
          <button type="button" onClick={onClose} aria-label="Cerrar menú" className="text-slate-600">
            <X size={20} />
          </button>
        </div>
        {email && (
          <p className="truncate border-b border-slate-200 px-4 py-3 text-xs text-slate-500">
            {email}
          </p>
        )}
        <nav className="flex-1 px-2 py-2">
          {items.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              <Icon size={18} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-slate-200 px-2 py-2">
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
          >
            <LogOut size={18} />
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run components/layout/MobileDrawer.test.tsx`
Expected: PASS (7 tests).

---

## Task 3: Integrar en AppShell (header, drawer, bottom nav, indicador)

**Files:**
- Modify: `components/layout/AppShell.tsx`
- Delete: `components/layout/OfflineBadge.tsx`
- Test: `components/layout/AppShell.test.tsx`

- [ ] **Step 1: Escribir el test que falla**

`components/layout/AppShell.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("next-auth/react", () => ({ useSession: vi.fn(), signOut: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/tareas" }));
vi.mock("@/hooks/useOnlineStatus", () => ({ useOnlineStatus: () => true }));
vi.mock("@/hooks/usePendingTareas", () => ({ usePendingCount: () => 0 }));

import { useSession } from "next-auth/react";
import { AppShell } from "./AppShell";

const asAdmin = () =>
  vi.mocked(useSession).mockReturnValue({
    data: { user: { email: "admin@x.com", rol: "admin" } },
  } as never);

beforeEach(() => vi.clearAllMocks());

describe("AppShell — bottom nav mobile", () => {
  it("la bottom nav mobile lista Tareas/Edificios/Dashboard + Nueva, sin Usuarios/Config", () => {
    asAdmin();
    render(<AppShell><div>contenido</div></AppShell>);
    const bottom = screen.getByTestId("bottom-nav");
    expect(screen.getByText("contenido")).toBeInTheDocument();
    expect(bottom).toHaveTextContent("Tareas");
    expect(bottom).toHaveTextContent("Edificios");
    expect(bottom).toHaveTextContent("Dashboard");
    expect(bottom).toHaveTextContent("Nueva");
    expect(bottom).not.toHaveTextContent("Usuarios");
    expect(bottom).not.toHaveTextContent("Config");
  });

  it("la hamburguesa abre el drawer con Usuarios y Config (admin)", () => {
    asAdmin();
    render(<AppShell><div>c</div></AppShell>);
    // Drawer cerrado: los ítems admin no están visibles todavía.
    expect(screen.queryByRole("link", { name: /usuarios/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /abrir menú/i }));
    expect(screen.getByRole("link", { name: /usuarios/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /config/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run components/layout/AppShell.test.tsx`
Expected: FAIL (no existe `data-testid="bottom-nav"` ni el botón "Abrir menú").

- [ ] **Step 3: Reescribir `AppShell.tsx`**

Reemplazar el archivo completo por:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { ReactNode, useState } from "react";
import { cn } from "@/lib/utils";
import { OfflineIndicator } from "./OfflineIndicator";
import { MobileDrawer } from "./MobileDrawer";
import {
  ClipboardList,
  LayoutDashboard,
  Users,
  Settings,
  LogOut,
  Plus,
  Building2,
  Menu,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  Icon: typeof ClipboardList;
  adminOnly?: boolean;
}

const NAV: NavItem[] = [
  { href: "/tareas", label: "Tareas", Icon: ClipboardList },
  { href: "/edificios", label: "Edificios", Icon: Building2 },
  { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/usuarios", label: "Usuarios", Icon: Users, adminOnly: true },
  { href: "/configuracion", label: "Config", Icon: Settings, adminOnly: true },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isAdmin = session?.user?.rol === "admin";
  const [drawerOpen, setDrawerOpen] = useState(false);

  const items = NAV.filter((n) => !n.adminOnly || isAdmin);
  const bottomItems = items.filter((n) => !n.adminOnly); // Tareas, Edificios, Dashboard
  const drawerItems = items.filter((n) => n.adminOnly); // Usuarios, Config (solo admin)

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Sidebar desktop (sin cambios salvo el indicador) */}
      <aside className="hidden md:flex md:w-60 md:flex-col md:border-r md:border-slate-200 md:bg-white">
        <div className="px-6 py-5">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-lg font-semibold text-slate-900">Gestión Morinigo</h1>
            <OfflineIndicator />
          </div>
          {session?.user?.email && (
            <p className="mt-1 truncate text-xs text-slate-500">{session.user.email}</p>
          )}
        </div>
        <nav className="flex-1 px-3">
          {items.map(({ href, label, Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                  active
                    ? "bg-slate-900 text-white"
                    : "text-slate-700 hover:bg-slate-100"
                )}
              >
                <Icon size={18} />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="px-3 pb-5">
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
          >
            <LogOut size={18} />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Contenido + header/bottom nav mobile */}
      <main className="flex-1 pb-24 md:pb-0">
        <header className="sticky top-0 z-30 grid grid-cols-3 items-center border-b border-slate-200 bg-white px-4 py-3 md:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Abrir menú"
            className="justify-self-start text-slate-700"
          >
            <Menu size={22} />
          </button>
          <h1 className="text-center text-base font-semibold text-slate-900">Gestión Morinigo</h1>
          <div className="justify-self-end">
            <OfflineIndicator />
          </div>
        </header>
        {children}
      </main>

      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        email={session?.user?.email}
        items={drawerItems}
      />

      {/* Bottom nav mobile */}
      <nav
        data-testid="bottom-nav"
        className="fixed bottom-0 left-0 right-0 z-20 flex items-stretch border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {bottomItems.map(({ href, label, Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className="flex flex-1 flex-col items-center justify-center py-2.5 text-xs"
            >
              <span
                className={cn(
                  "flex flex-col items-center gap-1 rounded-xl px-4 py-1.5 transition",
                  active ? "bg-slate-100 font-medium text-slate-900" : "text-slate-500"
                )}
              >
                <Icon size={20} />
                {label}
              </span>
            </Link>
          );
        })}
        <Link
          href="/tareas/nueva"
          className="flex flex-1 flex-col items-center justify-center gap-1 bg-slate-900 py-2.5 text-xs text-white"
        >
          <Plus size={20} />
          Nueva
        </Link>
      </nav>
    </div>
  );
}
```

- [ ] **Step 4: Eliminar `OfflineBadge.tsx`**

```bash
rm components/layout/OfflineBadge.tsx
```

- [ ] **Step 5: Verificar que nadie más importa `OfflineBadge`**

Run: `grep -rn "OfflineBadge" components app lib hooks`
Expected: sin resultados (solo el archivo eliminado; si aparece otro import, reemplazarlo por `OfflineIndicator`).

- [ ] **Step 6: Correr los tests de layout**

Run: `npx vitest run components/layout/`
Expected: PASS (AppShell 2 + MobileDrawer 7 + OfflineIndicator 4).

---

## Task 4: Verificación integral (árbol verde)

**Files:** ninguno (solo verificación).

- [ ] **Step 1: Types**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: 0 errores.

- [ ] **Step 3: Test suite completa**

Run: `npm test`
Expected: todos verdes (los ~337 previos + los nuevos de layout).

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build OK.

- [ ] **Step 5: Avisar "listo para commitear"** — Jony commitea con GitLens.

---

## Self-review (cobertura del spec)

- **#1 Header mobile (☰ izq / título centro / indicador der):** Task 3 Step 3 (header `grid grid-cols-3`). ✅
- **#1 Drawer (Usuarios/Config admin + Cerrar sesión todos; overlay/Escape/X/navegación):** Task 2 (componente + 7 tests). ✅
- **#2 Bottom nav 3 + Nueva, pill de activo, más alta + safe-area:** Task 3 Step 3 (bottomItems, pill `bg-slate-100`, `py-2.5`, `pb-[env(safe-area-inset-bottom)]`, `main pb-24`). ✅
- **#4 Indicador verde/ámbar+número/rojo + modal + auto una vez, mobile y desktop:** Task 1 (componente + 4 tests), Task 3 (header mobile + sidebar desktop). ✅
- **OfflineBadge eliminado y sin referencias:** Task 3 Steps 4-5. ✅
- **Desktop sin otros cambios:** Task 3 mantiene el `<aside>` idéntico salvo `OfflineBadge`→`OfflineIndicator`. ✅
- **Árbol verde:** Task 4. ✅
```
