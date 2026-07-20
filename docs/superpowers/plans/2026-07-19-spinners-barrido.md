# Barrido de spinners (Ítem 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps con checkbox `- [ ]`.

> **⚠️ Convención de commits (regla global):** Claude NUNCA ejecuta `git commit` ni prepara staging ni sugiere mensajes. Al cerrar cada task se deja el árbol verde y se frena; commitea el usuario en GitLens. "Commit" → **"Checkpoint"**.

**Spec asociado:** [`docs/superpowers/specs/2026-07-19-pendientes-mantenimiento.md`](../specs/2026-07-19-pendientes-mantenimiento.md) (Ítem 1).

**Goal:** Que todo botón que dispara una acción asíncrona muestre spinner (`Loader2` animado) + `disabled` mientras está en curso, según la regla global.

**Architecture:** Cambios visuales locales. Para botones que se repiten por fila/opción (una misma mutation para varios ítems), el spinner se muestra **solo en el ítem en curso** usando `mutation.variables`.

**Gaps detectados (audit):**
1. `TareaDetalle` — botones "Cambiar estado" (`patchEstado`): `disabled` pero sin spinner.
2. `UsuariosManager` — botón activar/desactivar (`toggleM`): `disabled` global, sin spinner.
3. `login` — botón Google (`signIn`): indica carga con texto "Conectando…" pero sin spinner.

**Ya OK (no tocar):** `TareaForm`, `FileUploader`, `ConfiguracionForm`, `DirectivaForm`, `IntegranteCard`, `DirectivaItem`, `UsuariosManager` (crear usuario), `TareaDetalle` (generar reporte / eliminar).

---

## Task 1: `TareaDetalle` — spinner en "Cambiar estado"

**Files:** Modify `components/tareas/TareaDetalle.tsx` (`Loader2` ya está importado).

- [ ] **Step 1: Reemplazar el botón de estado**

Buscar el `{ESTADOS.map((e) => (` … `))}` y reemplazar el `<button>` por:
```tsx
<button
  key={e}
  disabled={patchEstado.isPending || e === t.estado}
  onClick={() => patchEstado.mutate(e)}
  className={cn(
    "flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm transition",
    e === t.estado
      ? "border-slate-900 bg-slate-900 text-white"
      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
  )}
>
  {patchEstado.isPending && patchEstado.variables === e && (
    <Loader2 size={14} className="animate-spin" />
  )}
  {e}
</button>
```

- [ ] **Step 2: Verificar** — `npx vitest run tests/components/TareaDetalle.test.tsx` (sigue verde) + `npx tsc --noEmit`.
- [ ] **Step 3: Checkpoint** — frenar.

---

## Task 2: `UsuariosManager` — spinner en activar/desactivar

**Files:** Modify `components/usuarios/UsuariosManager.tsx` (`Loader2` ya está importado).

- [ ] **Step 1: Reemplazar el botón toggle**

Reemplazar el `<button disabled={toggleM.isPending} onClick={() => toggleM.mutate(...)}>` por (spinner + disabled **por fila**, usando `toggleM.variables`):
```tsx
<button
  disabled={toggleM.isPending && toggleM.variables?.email === u.email}
  onClick={() => toggleM.mutate({ email: u.email, activo: !u.activo })}
  className={cn(
    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition",
    u.activo
      ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
      : "border-slate-300 bg-slate-100 text-slate-600 hover:bg-slate-200"
  )}
>
  {toggleM.isPending && toggleM.variables?.email === u.email && (
    <Loader2 size={12} className="animate-spin" />
  )}
  {u.activo ? "Activo" : "Inactivo"}
</button>
```

- [ ] **Step 2: Verificar** — `npm test` (suite) + `npx tsc --noEmit`.
- [ ] **Step 3: Checkpoint** — frenar.

---

## Task 3: `login` — spinner en el botón de Google

**Files:** Modify `app/(auth)/login/page.tsx`.

- [ ] **Step 1: Importar `Loader2`**

```tsx
import { Loader2 } from "lucide-react";
```

- [ ] **Step 2: Mostrar el spinner cuando `loading`**

En el `<button>` de Google, reemplazar el `<svg>` de Google por un condicional (spinner mientras carga):
```tsx
{loading ? (
  <Loader2 size={18} className="animate-spin" />
) : (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
    {/* …paths del ícono de Google, sin cambios… */}
  </svg>
)}
{loading ? "Conectando…" : "Continuar con Google"}
```
(El `disabled={loading}` ya está.)

- [ ] **Step 3: Verificar** — `npx tsc --noEmit`.
- [ ] **Step 4: Checkpoint** — frenar.

---

## Task 4: Verificación integral

- [ ] **Step 1:** `npm test` → verde.
- [ ] **Step 2:** `npx tsc --noEmit` → sin errores.
- [ ] **Step 3:** `npm run lint` → sin errores.
- [ ] **Step 4:** `SERWIST_SUPPRESS_TURBOPACK_WARNING=1 npm run build` → compila.
- [ ] **Step 5: Checkpoint final** — todo verde. Frenar (commit del usuario).

---

## Self-Review
- Cobertura del spec (Ítem 1): AC-1 → Tasks 1-3 (los 3 gaps); AC-2 → Task 4; AC-3 → los tests existentes de esos componentes siguen verdes (no se agregan asserts de spinner por bajo valor).
- Consistencia: patrón `mutation.variables` para spinners por-fila/opción (igual que en `IntegranteCard` con `removeM.variables`).

## Estimación
~45 min con verificación.
