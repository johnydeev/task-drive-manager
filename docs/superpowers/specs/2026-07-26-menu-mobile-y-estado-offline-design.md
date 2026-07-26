# SPEC — Menú mobile (hamburguesa) + indicador de estado offline

**Fecha:** 2026-07-26
**Estado:** Propuesto (rev. 1)
**Autor:** equipo task-drive-manager
**Plan asociado:** [`../plans/2026-07-26-menu-mobile-y-estado-offline.md`](../plans/2026-07-26-menu-mobile-y-estado-offline.md)

Reorganización de la navegación **mobile** del shell (`components/layout/AppShell.tsx`) más
un **indicador de estado de conexión** visible (mobile **y** desktop). El sidebar de escritorio
no cambia, salvo por el reemplazo del badge offline por el nuevo indicador.

---

## Contexto

`AppShell.tsx` arma dos navegaciones: un **sidebar** en desktop (`md:flex`) y, en mobile
(`md:hidden`), un **header sticky** + una **bottom nav** de 5 destinos (Tareas, Edificios,
Dashboard, Usuarios, Config) más el botón "Nueva". El botón "Cerrar sesión" está hoy en el
header mobile. La bottom nav de 6 celdas queda apretada.

Existe además `OfflineBadge` (usado en el sidebar desktop y en el header mobile) que **solo se
renderiza cuando hay algo que avisar** (offline, o tareas en cola de sincronización). Con
conexión y sin pendientes devuelve `null`, así que en la operación normal es invisible — el
usuario no sabía que existía la capacidad de trabajar offline. La sincronización en sí ya
funciona (`OfflineSyncProvider` + cola local en Dexie + `useOnlineStatus` / `usePendingCount`);
esto es **solo un cambio de visibilidad/UX**, no toca la lógica de sync.

## Problema

1. En mobile la bottom nav mezcla navegación frecuente (Tareas/Edificios/Dashboard) con
   destinos de admin poco usados (Usuarios/Config) y queda con 6 celdas apretadas.
2. La selección del ítem activo en la bottom nav se nota poco (solo cambia el color del texto).
3. El estado de conexión / la capacidad de trabajar offline no son visibles para el usuario.

## Alcance

- **#1, #2, #3 → solo mobile** (`md:hidden`). El sidebar desktop (`md:flex`) queda **igual**.
- **#4 (indicador de estado) → mobile y desktop.** En desktop reemplaza al `OfflineBadge` en
  el sidebar; en mobile va en el header.

Fuera de alcance: la lógica de sincronización offline (`OfflineSyncProvider`, `offline-sync`,
Dexie), cualquier página, y todo el resto del sidebar desktop.

---

## #1 — Header mobile con hamburguesa + drawer

**Header mobile** (`md:hidden`), tres zonas en una línea:
- **Izquierda:** botón **hamburguesa** (☰, `aria-label="Abrir menú"`) que abre el drawer.
- **Centro:** título **"Gestión Morinigo"** centrado.
- **Derecha:** el **indicador de estado** (ver #4).

Se **quita** el botón "Cerrar sesión" del header (pasa al drawer).

**Drawer lateral** (componente nuevo `components/layout/MobileDrawer.tsx`):
- Se desliza **desde la izquierda** sobre un **overlay** oscuro semitransparente.
- **Cierra** al: tocar el overlay, presionar **Escape**, o el botón **X** del drawer. También
  al navegar a un ítem.
- Contenido, de arriba hacia abajo:
  1. Email del usuario (como en el sidebar desktop).
  2. **Usuarios** y **Config** — **solo admin** (`adminOnly`, mismos ítems que hoy filtra la
     bottom nav). Navegan y cierran el drawer.
  3. Separador.
  4. **Cerrar sesión** (`signOut`) — **visible para todos los roles**.
- La hamburguesa se muestra **siempre** (todos los roles); un no-admin verá dentro solo su
  email + "Cerrar sesión".

**Criterio:** en mobile, el header muestra ☰ (izq) / título (centro) / indicador (der). Al tocar
☰ se abre el drawer desde la izquierda con Usuarios+Config (si admin) y Cerrar sesión; cierra por
overlay/Escape/X/navegación. Ya no hay botón de cerrar sesión en el header.

## #2 — Bottom nav mobile: 3 destinos + selección con pill

- La bottom nav mobile deja **Tareas · Edificios · Dashboard** + el botón **Nueva** (negro,
  en la misma posición y estilo que hoy). **Usuarios y Config salen** de la bottom nav (pasan
  al drawer).
- **Ítem activo:** además del color más oscuro, se agrega un **pill de fondo** gris claro
  redondeado detrás del ícono+texto del ítem activo. Los inactivos quedan en gris sin fondo.
- **Altura:** la barra se hace **apenas más alta** (más padding vertical) y respeta el
  **safe-area inferior** del dispositivo (`env(safe-area-inset-bottom)`), para que no quede
  pegada al borde en teléfonos con gesto de home.

**Criterio:** la bottom nav mobile muestra 3 destinos + Nueva; el activo tiene pill de fondo
visible; la barra es levemente más alta y no queda tapada por el borde inferior del teléfono.

## #3 — (incluido en #2)

## #4 — Indicador de estado de conexión (mobile + desktop)

Componente nuevo `components/layout/OfflineIndicator.tsx` que **reemplaza** a `OfflineBadge` en
**ambos** lugares (header mobile y sidebar desktop). Reusa `useOnlineStatus()` y
`usePendingCount()`. Mismo guard de montaje que el badge actual (server render → `null` para
evitar hydration mismatch).

**Punto de estado (siempre visible tras montar):**
- 🟢 **verde** — online y sin pendientes (`online && pending === 0`).
- 🟡 **ámbar con número** — online con cola por subir (`online && pending > 0`): muestra el
  número de pendientes.
- 🔴 **rojo** — offline (`!online`).

El punto es un **botón** (`aria-label` según estado). Al **tocarlo** abre un **modal
informativo** con un solo botón ("Entendido"), siguiendo el patrón visual de
`components/ui/SuccessDialog.tsx`. Texto aproximado:

> **Modo sin conexión**
> Podés crear tareas aunque no tengas internet: se guardan en tu teléfono y se suben solas
> apenas vuelva la conexión. El punto muestra el estado — verde: todo al día · ámbar: subiendo
> pendientes · rojo: sin conexión.

**Apertura automática:** la **primera vez** que el estado cambia a offline dentro de la sesión,
el modal se abre **solo una vez** (flag en memoria del componente; no persiste entre recargas).
No se vuelve a abrir solo mientras siga offline ni en offlines posteriores de la misma sesión.

**Criterio:** con conexión y sin pendientes se ve un punto verde; con cola, ámbar con número;
sin conexión, rojo, y el modal se abrió automáticamente esa primera vez. Tocar el punto abre el
modal en cualquier estado. El mismo indicador aparece en el sidebar desktop en lugar del badge.

`OfflineBadge` queda sin uso → se elimina (verificando que no lo importe nadie más).

---

## Componentes

- **Nuevo** `components/layout/MobileDrawer.tsx` — drawer + overlay, recibe los ítems admin, el
  email y `onClose`; dispara `signOut`. Solo mobile.
- **Nuevo** `components/layout/OfflineIndicator.tsx` — punto de estado + modal. Mobile y desktop.
- **Modificado** `components/layout/AppShell.tsx` — header mobile (hamburguesa/título/indicador),
  estado abierto/cerrado del drawer, bottom nav a 3+Nueva con pill, sidebar desktop usa
  `OfflineIndicator`. Sidebar desktop sin otros cambios.
- **Eliminado** `components/layout/OfflineBadge.tsx` (reemplazado por `OfflineIndicator`).

## Testing (tests colocados, árbol verde)

- `OfflineIndicator.test.tsx`: verde sin pendientes / ámbar+número con pendientes / rojo offline;
  tocar el punto abre el modal; apertura automática única al primer offline de la sesión.
- `MobileDrawer.test.tsx`: muestra Usuarios/Config solo si admin; Cerrar sesión siempre; cierra
  por overlay/Escape/X.
- `AppShell.test.tsx` (nuevo): bottom nav mobile lista exactamente Tareas/Edificios/Dashboard +
  Nueva (sin Usuarios/Config); marca el activo; la hamburguesa abre el drawer.
- Verde: `vitest` + `npx tsc --noEmit` + `npm run lint` + `npm run build`.

## Accesibilidad / UI

- Hamburguesa y punto de estado con `aria-label`; drawer con `role="dialog"` + `aria-modal`,
  cierre con Escape y foco manejable; overlay clickeable.
- Botones que disparan acción async con spinner/`disabled` según regla del proyecto —
  aquí `signOut` y la navegación no aplican (togglean estado local / navegan), así que sin
  spinner.

## Riesgos

- **Hydration/SSR del indicador:** mantener el guard de montaje del badge actual para no romper
  la hidratación.
- **z-index / superposición:** el drawer y el modal deben quedar por encima del header sticky y
  la bottom nav (revisar capas `z-*`).
- **Safe-area:** validar el `env(safe-area-inset-bottom)` para que no rompa el layout en
  navegadores que no lo soportan (fallback a 0).

## Definición de hecho

- En mobile: header ☰/título/indicador; drawer con Usuarios+Config (admin) + Cerrar sesión;
  bottom nav de 3 + Nueva con pill de activo y barra un poco más alta.
- Indicador de estado verde/ámbar/rojo con modal informativo, en mobile **y** desktop; modal
  auto una vez al primer offline.
- Desktop (fuera del indicador) sin cambios visibles.
- `OfflineBadge` eliminado y sin referencias.
- Árbol verde (tests + tsc + lint + build).
