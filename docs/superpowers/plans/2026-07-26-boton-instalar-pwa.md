# Botón "Instalar app" (PWA) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.
>
> **Commits:** los hace Jony con GitLens. NO ejecutar `git commit`. La verificación completa
> (tsc + lint + tests + build) va en la Task 4.

**Goal:** Agregar un botón "Instalar app" en el drawer mobile y en el sidebar desktop, que dispara
el prompt de instalación nativo de la PWA, visible solo cuando el navegador reporta que la app es
instalable (Chromium: Chrome/Edge en Android y desktop).

**Architecture:** Un hook `useInstallPrompt` (montado en `AppShell`, siempre presente) captura el
evento `beforeinstallprompt` y expone `{ canInstall, promptInstall }`. `AppShell` renderiza la
entrada en el sidebar desktop y pasa `canInstall`/`promptInstall` a `MobileDrawer` para la entrada
mobile. No se toca manifest, service worker, ni la navegación previa.

**Tech Stack:** React 19 (hooks + `useEffect`), TypeScript, lucide-react (`Download`), Vitest +
Testing Library (`renderHook`, `act`). APIs del navegador: `beforeinstallprompt`, `appinstalled`,
`matchMedia("(display-mode: standalone)")`.

**Spec:** [`../specs/2026-07-26-boton-instalar-pwa-design.md`](../specs/2026-07-26-boton-instalar-pwa-design.md)

---

## Estructura de archivos

- **Crear** `hooks/useInstallPrompt.ts` — captura del evento + estado + `promptInstall`.
- **Crear** `hooks/useInstallPrompt.test.tsx`
- **Modificar** `components/layout/MobileDrawer.tsx` — props `canInstall`/`onInstall` + entrada.
- **Modificar** `components/layout/MobileDrawer.test.tsx` — 2 casos nuevos.
- **Modificar** `components/layout/AppShell.tsx` — usa el hook, entrada en sidebar, props al drawer.
- **Modificar** `components/layout/AppShell.test.tsx` — 1 caso nuevo (sidebar instalable).

---

## Task 1: Hook useInstallPrompt

**Files:**
- Create: `hooks/useInstallPrompt.ts`
- Test: `hooks/useInstallPrompt.test.tsx`

- [ ] **Step 1: Escribir el test que falla**

`hooks/useInstallPrompt.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useInstallPrompt } from "./useInstallPrompt";

function makePromptEvent() {
  const evt = new Event("beforeinstallprompt") as Event & {
    prompt: ReturnType<typeof vi.fn>;
    userChoice: Promise<{ outcome: string; platform: string }>;
  };
  evt.prompt = vi.fn().mockResolvedValue(undefined);
  evt.userChoice = Promise.resolve({ outcome: "accepted", platform: "web" });
  return evt;
}

function mockMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches,
    media: q,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => mockMatchMedia(false));

describe("useInstallPrompt", () => {
  it("canInstall arranca en false sin evento", () => {
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.canInstall).toBe(false);
  });

  it("tras beforeinstallprompt, canInstall pasa a true", () => {
    const { result } = renderHook(() => useInstallPrompt());
    act(() => {
      window.dispatchEvent(makePromptEvent());
    });
    expect(result.current.canInstall).toBe(true);
  });

  it("promptInstall dispara prompt() y luego canInstall vuelve a false", async () => {
    const { result } = renderHook(() => useInstallPrompt());
    const evt = makePromptEvent();
    act(() => {
      window.dispatchEvent(evt);
    });
    expect(result.current.canInstall).toBe(true);
    await act(async () => {
      await result.current.promptInstall();
    });
    expect(evt.prompt).toHaveBeenCalled();
    expect(result.current.canInstall).toBe(false);
  });

  it("si ya está en standalone, canInstall es false aunque llegue el evento", () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useInstallPrompt());
    act(() => {
      window.dispatchEvent(makePromptEvent());
    });
    expect(result.current.canInstall).toBe(false);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run hooks/useInstallPrompt.test.tsx`
Expected: FAIL (no existe `./useInstallPrompt`).

- [ ] **Step 3: Implementar el hook**

`hooks/useInstallPrompt.ts`:

```tsx
"use client";

import { useEffect, useState } from "react";

// El evento `beforeinstallprompt` no está tipado en la lib estándar de TS.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

// La app ya corre instalada (standalone) → no ofrecer instalar.
function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

// Captura el evento `beforeinstallprompt` (Chromium) y expone si la app es instalable
// y una función para disparar el prompt nativo. `canInstall` es false en iOS/Safari,
// si la app ya está instalada, o después de instalarla (el evento sirve una sola vez).
export function useInstallPrompt(): {
  canInstall: boolean;
  promptInstall: () => Promise<void>;
} {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (isStandalone()) {
      setInstalled(true);
      return;
    }
    const onPrompt = (e: Event) => {
      e.preventDefault(); // Evita el mini-cartel automático del navegador.
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const promptInstall = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null); // Un beforeinstallprompt sirve una sola vez.
  };

  return { canInstall: !installed && deferred !== null, promptInstall };
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run hooks/useInstallPrompt.test.tsx`
Expected: PASS (4 tests).

---

## Task 2: Entrada "Instalar app" en el drawer

**Files:**
- Modify: `components/layout/MobileDrawer.tsx`
- Test: `components/layout/MobileDrawer.test.tsx`

- [ ] **Step 1: Agregar los tests que fallan**

Agregar dentro del `describe("MobileDrawer", ...)` de `components/layout/MobileDrawer.test.tsx`:

```tsx
  it("con canInstall muestra 'Instalar app' y al tocar llama onInstall + onClose", () => {
    const onInstall = vi.fn();
    const onClose = vi.fn();
    render(
      <MobileDrawer
        open
        onClose={onClose}
        email="a@x.com"
        items={adminItems}
        canInstall
        onInstall={onInstall}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /instalar app/i }));
    expect(onInstall).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("sin canInstall no muestra 'Instalar app'", () => {
    render(<MobileDrawer open onClose={() => {}} email="a@x.com" items={adminItems} />);
    expect(screen.queryByRole("button", { name: /instalar app/i })).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run components/layout/MobileDrawer.test.tsx`
Expected: FAIL (no existe el botón "Instalar app").

- [ ] **Step 3: Modificar `MobileDrawer.tsx`**

Cambiar el import de iconos (agregar `Download`):

```tsx
import { Download, LogOut, X } from "lucide-react";
```

Extender la interfaz `Props`:

```tsx
interface Props {
  open: boolean;
  onClose: () => void;
  email?: string | null;
  items: DrawerItem[];
  canInstall?: boolean;
  onInstall?: () => void;
}
```

Cambiar la firma de la función:

```tsx
export function MobileDrawer({ open, onClose, email, items, canInstall, onInstall }: Props) {
```

Reemplazar el bloque final (el `div` con solo "Cerrar sesión") por:

```tsx
        <div className="border-t border-slate-200 px-2 py-2">
          {canInstall && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onInstall?.();
              }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              <Download size={18} />
              Instalar app
            </button>
          )}
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
          >
            <LogOut size={18} />
            Cerrar sesión
          </button>
        </div>
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run components/layout/MobileDrawer.test.tsx`
Expected: PASS (9 tests: 7 previos + 2 nuevos).

---

## Task 3: Cablear en AppShell (sidebar desktop + props al drawer)

**Files:**
- Modify: `components/layout/AppShell.tsx`
- Test: `components/layout/AppShell.test.tsx`

- [ ] **Step 1: Agregar el test que falla**

En `components/layout/AppShell.test.tsx`, cambiar el import de Testing Library para incluir `act`:

```tsx
import { render, screen, fireEvent, within, act } from "@testing-library/react";
```

Agregar dentro del `describe(...)`:

```tsx
  it("muestra 'Instalar app' en el sidebar cuando la app es instalable", () => {
    asAdmin();
    window.matchMedia = vi.fn().mockImplementation((q: string) => ({
      matches: false,
      media: q,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    render(
      <AppShell>
        <div>c</div>
      </AppShell>
    );
    expect(screen.queryByRole("button", { name: /instalar app/i })).not.toBeInTheDocument();
    act(() => {
      const evt = new Event("beforeinstallprompt");
      window.dispatchEvent(evt);
    });
    // Drawer cerrado → el único "Instalar app" es el del sidebar desktop.
    expect(screen.getByRole("button", { name: /instalar app/i })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run components/layout/AppShell.test.tsx`
Expected: FAIL (no existe el botón "Instalar app").

- [ ] **Step 3: Modificar `AppShell.tsx`**

Agregar `Download` al import de lucide-react (junto a `Menu`):

```tsx
import {
  ClipboardList,
  LayoutDashboard,
  Users,
  Settings,
  LogOut,
  Plus,
  Building2,
  Menu,
  Download,
} from "lucide-react";
```

Agregar el import del hook (debajo del import de `MobileDrawer`):

```tsx
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
```

Dentro de `AppShell`, después de `const [drawerOpen, setDrawerOpen] = useState(false);`:

```tsx
  const { canInstall, promptInstall } = useInstallPrompt();
```

En el sidebar desktop, reemplazar el `div` de "Cerrar sesión" (`<div className="px-3 pb-5">…`)
por:

```tsx
        <div className="px-3 pb-5">
          {canInstall && (
            <button
              onClick={() => promptInstall()}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
            >
              <Download size={18} />
              Instalar app
            </button>
          )}
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
          >
            <LogOut size={18} />
            Cerrar sesión
          </button>
        </div>
```

Pasar las props al `MobileDrawer`:

```tsx
      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        email={session?.user?.email}
        items={drawerItems}
        canInstall={canInstall}
        onInstall={promptInstall}
      />
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run components/layout/AppShell.test.tsx`
Expected: PASS (3 tests: 2 previos + 1 nuevo).

- [ ] **Step 5: Correr todos los tests de layout + el hook**

Run: `npx vitest run components/layout/ hooks/useInstallPrompt.test.tsx`
Expected: PASS.

---

## Task 4: Verificación integral (árbol verde)

**Files:** ninguno.

- [ ] **Step 1: Types** — Run: `npx tsc --noEmit` → sin errores.
- [ ] **Step 2: Lint** — Run: `npm run lint` → 0 errores.
- [ ] **Step 3: Tests** — Run: `npm test` → todos verdes.
- [ ] **Step 4: Build** — Run: `npm run build` → build OK.
- [ ] **Step 5: Avisar "listo para commitear"** — Jony commitea con GitLens.

---

## Self-review (cobertura del spec)

- **FR1 captura del evento (`preventDefault` + guardar):** Task 1 `onPrompt`. ✅
- **FR2 ya instalada / no instalable (`canInstall` false):** Task 1 `isStandalone` + `installed`. ✅
- **FR3 disparar instalación + descartar evento:** Task 1 `promptInstall`. ✅
- **FR4 entrada mobile arriba de Cerrar sesión + cierra drawer:** Task 2. ✅
- **FR5 entrada desktop arriba de Cerrar sesión:** Task 3 Step 3. ✅
- **FR6 ocultar tras instalar (`appinstalled` / `userChoice`):** Task 1 `onInstalled` + `setDeferred(null)`. ✅
- **NFR1 SSR-safe (listeners en effect, false en primer render):** Task 1. ✅
- **NFR3 tipado `BeforeInstallPromptEvent`:** Task 1. ✅
- **Árbol verde:** Task 4. ✅
```
