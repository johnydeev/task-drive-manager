# SPEC — Botón "Instalar app" (PWA) en drawer mobile + sidebar desktop

**Fecha:** 2026-07-26
**Estado:** Propuesto (rev. 1)
**Autor:** equipo task-drive-manager
**Plan asociado:** [`../plans/2026-07-26-boton-instalar-pwa.md`](../plans/2026-07-26-boton-instalar-pwa.md)

Agrega un botón propio **"Instalar app"** dentro de la interfaz para que el usuario no dependa
del menú escondido del navegador. Aparece solo cuando la app es realmente instalable
(Android/Chrome y Chrome desktop), en el drawer mobile y en el sidebar desktop.

---

## Contexto

La app ya es una **PWA** (manifest en `app/manifest.ts`, service worker vía `@serwist/next`,
registrado en `RegisterPWA.tsx`). Hoy **no hay botón propio de instalación**: en Android/Chrome
el usuario tiene que ir al menú ⋮ del navegador → "Instalar aplicación", que queda oculto.

Los navegadores basados en Chromium disparan el evento **`beforeinstallprompt`** cuando la app
cumple los criterios de instalación. Ese evento permite: (a) evitar el mini-cartel automático
del navegador y (b) disparar el diálogo de instalación nativo desde nuestro propio botón, una
sola vez, vía `evento.prompt()`.

## Problema

El acceso a "instalar la app" está escondido en el menú del navegador. Se quiere un botón claro
dentro de la propia app (mobile y desktop).

## Alcance

- **Mobile:** entrada "Instalar app" en el drawer (`MobileDrawer`).
- **Desktop:** entrada "Instalar app" en el sidebar (`AppShell`, bloque `md:flex`).
- Solo navegadores que soportan `beforeinstallprompt` (Chromium: Chrome/Edge en Android y
  desktop). **iOS/Safari queda fuera** (no soporta el evento; sin instrucciones manuales por
  ahora).

**Fuera de alcance:** instrucciones manuales para iOS/Safari; tocar el manifest o el service
worker (ya están OK); cualquier cambio de la lógica de navegación previa.

## Decisiones

- **Un solo hook, montado en el shell.** `useInstallPrompt` se usa en `AppShell` (que está
  siempre montado en mobile y desktop) para no perder el evento `beforeinstallprompt`, que
  puede dispararse antes de abrir el drawer. El drawer recibe el estado por props.
- **`canInstall` es la única condición de visibilidad.** Si no hay evento capturado (iOS, o ya
  instalada) o la app corre en modo instalado, el botón no se renderiza en ningún lado.
- **Sin spinner.** La acción abre el diálogo nativo del navegador, que toma el control de la
  pantalla; un spinner en el botón no se vería. (No contradice la regla de spinners del
  proyecto, que aplica a acciones async con feedback en la propia UI.)

## Requisitos funcionales

- **FR1 — Captura del evento.** Al recibir `beforeinstallprompt`, el hook llama
  `preventDefault()`, guarda el evento y pasa `canInstall` a `true`.
- **FR2 — Ya instalada / no instalable.** `canInstall` es `false` si: nunca llegó el evento; la
  app corre en `display-mode: standalone` (o `navigator.standalone` en iOS); o llegó el evento
  `appinstalled`.
- **FR3 — Disparar instalación.** `promptInstall()` llama a `evento.prompt()`, espera
  `evento.userChoice`, y descarta el evento guardado (un `beforeinstallprompt` sirve una sola
  vez) → `canInstall` pasa a `false` después de usarlo.
- **FR4 — Entrada mobile.** En `MobileDrawer`, si `canInstall`, se muestra "Instalar app" (ícono
  de descarga) **arriba de "Cerrar sesión"**; al tocarla cierra el drawer y llama `onInstall`.
- **FR5 — Entrada desktop.** En el sidebar (`md:flex`), si `canInstall`, se muestra "Instalar
  app" **arriba de "Cerrar sesión"**, con el estilo de los ítems del sidebar; al tocarla llama
  `promptInstall`.
- **FR6 — Ocultar tras instalar.** Después de una instalación exitosa (`appinstalled` o
  `userChoice.outcome === "accepted"`), la entrada desaparece de ambos lados.

## Requisitos no funcionales

- **NFR1 — SSR-safe:** el hook no toca `window`/`matchMedia` durante el render del server;
  registra listeners en `useEffect`. En el primer render devuelve `canInstall = false`.
- **NFR2 — Sin dependencias nuevas.** Solo APIs del navegador y lo ya instalado.
- **NFR3 — Tipado:** definir una interfaz mínima `BeforeInstallPromptEvent` (no está en la lib
  estándar de TS) con `prompt()` y `userChoice`.

## Componentes

- **Nuevo** `hooks/useInstallPrompt.ts` — captura del evento + estado + `promptInstall`. Devuelve
  `{ canInstall: boolean; promptInstall: () => Promise<void> }`.
- **Nuevo** `hooks/useInstallPrompt.test.tsx`.
- **Modificado** `components/layout/MobileDrawer.tsx` — props `canInstall?`, `onInstall?`;
  render de la entrada.
- **Modificado** `components/layout/MobileDrawer.test.tsx` — casos con/sin `canInstall`.
- **Modificado** `components/layout/AppShell.tsx` — usa el hook, pasa props al drawer, agrega la
  entrada en el sidebar desktop.

## Criterios de aceptación

- En Chrome (Android o desktop), cuando la app es instalable, aparece "Instalar app" en el
  drawer (mobile) y en el sidebar (desktop); al tocarla se abre el diálogo nativo de instalación.
- Tras instalar (o si la app ya está instalada / display-mode standalone), la entrada no aparece.
- En un navegador sin `beforeinstallprompt` (ej. Safari), la entrada no aparece y nada se rompe.
- Árbol verde: `vitest` + `tsc` + `lint` + `build`.

## Riesgos

- **Timing del evento:** `beforeinstallprompt` puede dispararse muy temprano. Montar el hook en
  `AppShell` (primer render de cliente) cubre el caso normal; si en algún navegador dispara antes
  del montaje, simplemente no se captura y el usuario sigue teniendo el menú del navegador
  (degradación aceptable).
- **`matchMedia` en tests:** jsdom no implementa `matchMedia`; el test debe mockearlo.

## Definición de hecho

- "Instalar app" visible en drawer mobile y sidebar desktop solo cuando `canInstall`, arriba de
  "Cerrar sesión"; dispara el prompt nativo; desaparece tras instalar / si ya está instalada.
- iOS/Safari y desktop-no-instalable: sin entrada, sin errores.
- Árbol verde (tests + tsc + lint + build).
