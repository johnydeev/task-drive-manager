# SPEC — UX de campo: filtros en URL, búsqueda y orden, Combobox estricto, reporte al cerrar, toasts

**Fecha:** 2026-09-19
**Estado:** Propuesto (rev. 1)
**Autor:** equipo task-drive-manager
**Plan asociado:** [`../plans/2026-09-19-ux-de-campo-lista-combobox-reporte-toasts.md`](../plans/2026-09-19-ux-de-campo-lista-combobox-reporte-toasts.md)

Bloque 3 de la auditoría del 2026-09-19. Cinco mejoras chicas e independientes, todas del lado
del uso diario en la calle. Ninguna toca la Sheet ni el deploy.

| # | Problema | Corrección |
|---|---|---|
| 1 | Los filtros de `/tareas` viven en `useState`: volver del detalle los resetea; un filtro no se puede compartir por link. | Filtros, búsqueda y orden en la URL (`router.replace`). |
| 2 | No hay búsqueda ni orden. El README promete «buscable». Con 21 tareas no se nota; con 200 la lista no sirve. | Input de búsqueda (sin acentos) + select «Ordenar»; default: abiertas primero, por prioridad. |
| 3 | Edificio se elige con `<select>` nativo en 6 lugares; con decenas de consorcios en el celular es scroll largo y error de dedo. | `Combobox` con modo `strict` en los 6. |
| 4 | Al cerrar una tarea el reporte se genera fire-and-forget sin garantía y la UI no se entera: hay que refrescar a mano. | `after()` de `next/server` + polling del detalle mientras falta el `reporteUrl`. |
| 5 | Cada éxito (crear, editar, eliminar) es un modal con «Entendido»: un tap extra por acción. | Toasts propios; el modal queda solo para «visita guardada» (tiene acciones). |

---

## Contexto

**Lista.** `app/(app)/tareas/page.tsx` (bloque 2A): `useTareas()` + `filterTareas` en memoria.
Estado local: `edificio` (semilla desde `?edificio=`), `estado`, `prioridad`, `soloMias`,
`soloSinAsignar`, `showFilters`. Sin búsqueda; el orden es el de la Sheet (inserción). El
`vitest.setup.ts` mockea `next/navigation` con `useSearchParams: () => new URLSearchParams()` y
`useRouter` con `push/back/refresh` (sin `replace`) y `usePathname: () => "/"`.

**Combobox.** `components/ui/Combobox.tsx`: input controlado donde `value` **es** el texto; filtra
opciones por `normalize` (sin acentos) y permite valor libre. Usado solo para proveedor. Sin test
propio. Los 6 selectores de edificio: `TareaForm` (`register("edificio")`), `VisitaForm`,
`InformeEdificio`, `Dashboard` (`FiltroSelect` genérico), filtros de la lista, `IntegranteCard`
(«Agregar edificio…», opciones = `sinAsignarQ`). Tests que hoy hacen `selectOptions` sobre
Edificio: `InformeEdificio.test` (`elegirEdificio`), `VisitaForm.test`, `IntegranteCard.test`
(`getByRole("combobox")`).

**Reporte.** `PATCH cerrar` en `app/api/tareas/[id]/route.ts` hace
`generateAndUploadReporte(updated).then(updateTarea(reporteUrl)).catch(log)` sin `await` ni
`after()`. `TareaDetalle` muestra «El reporte se genera automáticamente… puede tardar unos
segundos» y no repolla. `next/server` exporta `after` (verificado en `node_modules/next/server.d.ts`;
docs en `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md`): corre tras
enviar la respuesta, dentro del `maxDuration` de la ruta (60 s acá). **Fuera de un request lanza**
`"after was called outside a request scope"` → en tests hay que mockearlo.

**Éxito.** `SuccessDialog` en 4 lugares: `TareaForm` (crear/editar; al cerrar navega al detalle
o cierra la edición), `TareaDetalle` (eliminar → navega a la lista), lista (eliminar), `VisitaForm`
(guardada, **con** `children`: Ver / Descargar / Compartir el PDF). `useTareaForm` guarda
`successMsg`/`successResult` y `handleSuccessClose` hace la navegación diferida.
`useTareaForm.test` afirma `successMsg === "Tarea creada exitosamente"` / `"…editada…"`.

## Decisiones

- **`router.replace`, no `push`.** Cada cambio de filtro no debe ser una entrada en el historial:
  «atrás» desde la lista tiene que salir de la lista, no deshacer un select.
- **Búsqueda y orden también en la URL.** Mismo mecanismo; un link `?q=terraza&orden=estimada`
  es útil para mandar por WhatsApp.
- **Orden por defecto `prioridad`** = abiertas primero (estado ≠ `Realizada`) → Alta → Media →
  Baja → más reciente. Elegido por Jony sobre «más recientes» y «fecha estimada».
- **La búsqueda es en memoria** sobre objetivo, edificio, dpto, proveedor e informe. Con la query
  única (2A) los datos ya están; server-side no aporta nada.
- **`normalizar` sale a `lib/texto.ts`** y lo usan búsqueda y `Combobox`. Una sola definición de
  «sin acentos ni mayúsculas».
- **`Combobox strict` en los 6 lugares**, no solo en formularios: un solo comportamiento para
  «elegir edificio» en toda la app. El `<select>` de **dpto** no cambia (pocas opciones).
- **En modo `strict` el texto del input es estado interno**, distinto del `value`. `onChange`
  dispara solo al elegir o al vaciar. Lo tipeado que no coincide se descarta al salir del campo.
  Al enfocar se muestran **todas** las opciones aunque haya un valor elegido.
- **`after()` en vez del fire-and-forget suelto.** Next garantiza que el callback corre después
  de responder y dentro del `maxDuration`; el `.then/.catch` suelto depende de que el proceso no
  recicle el request. Costo: mockear `after` en el test de transiciones.
- **Polling con tope** (20 × 3 s = 1 min). Si la generación falló, no se repolla para siempre; el
  admin ve el botón «Generar reporte» de siempre.
- **Polling solo para cierres recientes** (`realizadaEn` < 10 min). El cierre manual setea
  `realizadaEn = now`; una tarea cerrada por la derivación de 72 h no lo tiene, y una cuyo reporte
  falló hace días no debe disparar 20 GETs cada vez que alguien la abre. (Hallazgo de la
  verificación final; no estaba en la rev. 1.)
- **Toast propio, sin dependencia.** ~60 líneas; `aria-live`; éxito y error. Se descartó `sonner`
  (dependencia + estilos a integrar) porque la necesidad es «un aviso de 4 s».
- **`useToast()` sin provider es no-op.** Los hooks y componentes que lo usan se testean sin
  envolverlos en `ToastProvider`; solo el test del `Toaster` lo monta.
- **Crear tarea navega al detalle al instante** y el toast aparece sobre el detalle. Antes: modal
  → «Entendido» → navegar. El modal existía para «confirmar que se guardó»; el toast lo hace sin
  frenar.
- **Visita guardada sigue como modal**: sus botones (Ver / Descargar / Compartir) son la razón de
  ser de esa pantalla. `SuccessDialog` queda solo para eso; no se borra el componente.

---

## #1 — Filtros en la URL

### `components/tareas/hooks/useListaTareas.ts` (nuevo)

Toda la lógica de la página. La página queda en JSX.

```ts
export type OrdenTareas = "prioridad" | "recientes" | "antiguas" | "estimada";

export interface FiltrosLista {
  edificio: string;          // "" = todos
  estado: EstadoTarea | "";  // "" = todos
  prioridad: Prioridad | ""; // "" = todas
  mias: boolean;
  sinAsignar: boolean;
  q: string;
  orden: OrdenTareas;
}

export function useListaTareas(): {
  filtros: FiltrosLista;
  setFiltro: <K extends keyof FiltrosLista>(k: K, v: FiltrosLista[K]) => void;
  tareas: Tarea[];          // filtradas + buscadas + ordenadas
  tareasQ: ReturnType<typeof useTareas>;
  edificiosQ: ReturnType<typeof useEdificios>;
  hayFiltrosAvanzados: boolean; // edificio || estado || prioridad → panel abierto al cargar
  isAdmin: boolean;
  myEmail: string;
};
```

- **Fuente de verdad: estado local (`useState`) sembrado desde la URL al montar;** cada cambio
  hace `router.replace`. La URL es persistencia (volver del detalle remonta la página y relee),
  no la fuente en vivo. Razón: con `replace` no hay «atrás» que deshacer, así que no hace falta
  reaccionar a cambios externos de la URL; y en tests el mock global de `useSearchParams`
  devuelve siempre un `URLSearchParams` vacío, con lo que un estado derivado solo de la URL no
  cambiaría nunca al tocar un filtro.
- Lectura al montar: `leerFiltros(useSearchParams())` (pura). `estado`/`prioridad` se validan
  contra los enums de `lib/schemas.ts`; un valor inválido en la URL cuenta como `""`. `orden`
  inválido → `"prioridad"`. `mias`/`sinAsignar`: presencia de `=1`.
- Escritura: `setFiltro` actualiza el estado y hace
  `router.replace(`${pathname}${qs ? "?" + qs : ""}`, { scroll: false })` con
  `escribirFiltros(filtros)` (pura: omite defaults, así la URL limpia es `/tareas`). `mias` y
  `sinAsignar` se excluyen mutuamente (como hoy): setear uno apaga el otro.
- Derivación: `filterTareas` (existente) → `buscarTareas` → `ordenarTareas` (#2), en `useMemo`.
- `showFilters` se queda en la página como `useState(hayFiltrosAvanzados)`.

### Página

- Input de búsqueda (`type="search"`, placeholder «Buscar por objetivo, edificio, dpto…»,
  `aria-label="Buscar tareas"`) a lo ancho, arriba de los chips. Debounce **no**: es en memoria.
- Select «Ordenar» (`aria-label="Ordenar por"`) a la derecha del input en desktop, debajo en
  mobile. Opciones: Prioridad · Más recientes · Más antiguas · Fecha estimada.
- Los chips y el panel de filtros llaman `setFiltro`. El `Combobox` de edificio (#3) reemplaza al
  `<select>` del panel.
- El contador «N resultados» y el vacío usan `tareas`. El vacío distingue: «No hay tareas con esos
  filtros» vs «No hay tareas que coincidan con "…"» si hay `q`.

---

## #2 — Búsqueda y orden (puro)

### `lib/texto.ts` (nuevo)

```ts
// Sin acentos ni mayúsculas, para comparar y buscar. Compartida por Combobox y la lista.
export function normalizar(s: string): string;
```

Misma implementación que el `normalize` privado del `Combobox` (que pasa a importarla).

### `lib/tareas-orden.ts` (nuevo)

```ts
export function buscarTareas(tareas: Tarea[], q: string): Tarea[];
// q vacío → mismas tareas. Coincide si normalizar(q) está incluido en normalizar(objetivo |
// edificio | dpto | proveedor | informe).

export function ordenarTareas(tareas: Tarea[], orden: OrdenTareas): Tarea[];
// Devuelve copia. Estable (Array.prototype.sort lo es en V8).
// prioridad: abiertas (estado !== "Realizada") antes que cerradas → Alta < Media < Baja →
//            rowId desc (creación más reciente arriba).
// recientes: rowId desc.   antiguas: rowId asc.
// estimada:  con fechaEstimada primero, ascendente (vence antes arriba); sin fecha al final,
//            entre ellas rowId desc.
```

`rowId` es un ISO con offset (`-03:00` o `Z` en filas viejas): se compara por `Date.parse`; si
no parsea, va al final.

---

## #3 — `Combobox` estricto

### `components/ui/Combobox.tsx`

```ts
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
```

- `strict` falso → comportamiento actual, intacto (proveedor).
- `strict` verdadero:
  - `texto` (estado interno) se inicializa con `value` y se resincroniza cuando `value` cambia
    desde afuera (`useEffect`).
  - Al tipear: solo cambia `texto` y abre la lista. La lista filtra por `texto` **salvo** que
    `texto === value` (recién enfocado): ahí muestra todas.
  - Elegir (click/Enter): `onChange(opt)`, `texto = opt`, cierra.
  - Blur / Escape: si `texto.trim() === ""` → `onChange("")`; si `normalizar(texto)` coincide
    exactamente con una opción → `onChange(esa opción)`; si no → `texto = value` (revierte).
  - Botón «✕» visible cuando hay `value` y no está `disabled`: `onChange("")`. Para filtros.
- Los 6 reemplazos:

| Lugar | Antes | Después |
|---|---|---|
| `TareaForm` | `<select {...register("edificio")}>` | `<Controller name="edificio" render={({ field }) => <Combobox strict value={field.value} onChange={field.onChange} options={nombres} placeholder="Elegí un edificio" />} />` |
| `VisitaForm` | `<select>` | `Combobox strict` |
| `InformeEdificio` | `<select>` con label «Edificio» | `Combobox strict` con `id` ligado al `<label>` |
| `Dashboard` | `FiltroSelect` Edificio | `Combobox strict placeholder="Todos"`; los otros `FiltroSelect` (estado, prioridad) no cambian |
| Lista (`/tareas`) | `<select>` del panel | `Combobox strict placeholder="Todos"` |
| `IntegranteCard` | `<select>` «Agregar edificio…» | `Combobox strict placeholder="Agregar edificio…"` con `options = sinAsignarQ.data` |

- `TareaForm`: `useTareaForm` ya resetea `dpto` al cambiar `edificio` (efecto sobre `watch`):
  no cambia.

---

## #4 — Reporte al cerrar

### Server (`app/api/tareas/[id]/route.ts`, rama `cerrar`)

```ts
import { after } from "next/server";
// …
after(async () => {
  try {
    const r = await generateAndUploadReporte(updated);
    await updateTarea({ rowId: updated.rowId, reporteUrl: r.url });
  } catch (err) {
    console.error("[reporte-auto] error:", err);
  }
});
return NextResponse.json(updated);
```

### Cliente

- `useTareaDetalle`: `const [intentosReporte, setIntentosReporte] = useState(0)`; la query gana
  ```ts
  refetchInterval: (query) => {
    const t = query.state.data;
    if (t?.estado !== "Realizada" || t.reporteUrl) return false;
    if (!cierreReciente(t.realizadaEn, Date.now())) return false; // < 10 min
    return intentosReporte < 20 ? 3000 : false;
  },
  ```
  El contador **no** se incrementa dentro de `refetchInterval` (TanStack recomputa esa función en
  cada `setOptions`/cambio de estado, no una vez por tick): se incrementa en un `useEffect` sobre
  `tareaQ.dataUpdatedAt` mientras `Realizada && !reporteUrl`, y se resetea a 0 al cambiar `rowId`
  o al llegar `reporteUrl`. Como es `useState`, el closure de `refetchInterval` se renueva en el
  render siguiente y TanStack lo recomputa vía `setOptions`. Expone
  `esperandoReporte: boolean` = `Realizada && !reporteUrl && intentosReporte < 20`.
- `TareaDetalle`: reemplaza el texto «El reporte se genera automáticamente…» por
  `esperandoReporte ? <Loader2 spin /> "Generando el reporte…" : "El reporte no se generó. Podés generarlo con el botón."` (este último solo admin, como hoy).
- `refresh()` tras `cerrar` ya hace `setQueryData(["tarea", id], updated)` → el polling arranca
  solo porque `updated.estado === "Realizada"` y sin `reporteUrl`.

---

## #5 — Toasts

### `components/ui/Toaster.tsx` (nuevo)

```ts
type Tipo = "success" | "error";
interface Toast { id: number; tipo: Tipo; mensaje: string }

export function ToastProvider({ children }): JSX.Element; // estado + <Toaster/> al final del body
export function useToast(): { success: (m: string) => void; error: (m: string) => void };
```

- Contexto con default **no-op** (sin provider, `success/error` no hacen nada): hooks y
  componentes se testean sin envolver.
- Render: `div` fijo `bottom-24 md:bottom-6` (sobre el bottom nav mobile), centrado, `z-50`,
  `role="status" aria-live="polite"`. Cada toast: pill blanca con borde, ícono `CheckCircle2`
  verde o `XCircle` rojo, texto; se cierra a los **4 s** (`setTimeout`) o al tocarlo. Máximo 3
  apilados (se descarta el más viejo).
- `ToastProvider` se monta en `app/layout.tsx` adentro de `QueryProvider`, envolviendo
  `{children}`.

### Reemplazos

| Lugar | Antes | Después |
|---|---|---|
| `useTareaForm` crear | `successMsg` → modal → al cerrar `router.push(detalle)` | `toast.success("Tarea creada")` + `router.push(detalle)` inmediato; `onSubmitSuccess?.(r)` igual |
| `useTareaForm` editar | modal → `onSubmitSuccess` | `toast.success("Tarea editada")` + `onSubmitSuccess?.(r)` |
| `useTareaForm` offline | `router.push("/tareas")` sin aviso | + `toast.success("Guardada en el teléfono: se sube al volver la conexión")` |
| `TareaDetalle` eliminar | `deleteDone` → modal → `onDeleteDoneClose` (remove query + push) | `toast.success("Tarea eliminada")` + lo que hacía `onDeleteDoneClose`, directo en `onSuccess` |
| Lista eliminar | `deleteDone` → modal | `toast.success("Tarea eliminada")` en `onSuccess` |
| `VisitaForm` | `SuccessDialog` con acciones | **sin cambios** |

- `useTareaForm` pierde `successMsg`, `successResult`, `handleSuccessClose`; `TareaForm` pierde el
  `<SuccessDialog>`. `useTareaDetalle` pierde `deleteDone`/`onDeleteDoneClose`. La página pierde
  `deleteDone`.
- Errores: donde hoy hay banner inline (`submitError`, `eliminar.isError`) **se mantiene el
  banner**; el toast no reemplaza errores (fuera de alcance).

---

## Tests

| Archivo | Casos |
|---|---|
| `lib/texto.test.ts` (nuevo) | acentos, mayúsculas, ñ, vacío |
| `lib/tareas-orden.test.ts` (nuevo) | `buscarTareas`: q vacío devuelve todo · coincide por cada campo · sin acentos · sin coincidencia → [] · `ordenarTareas`: `prioridad` (abierta Baja antes que cerrada Alta; Alta antes que Media; a igual prioridad la más reciente) · `recientes`/`antiguas` · `estimada` (con fecha asc, sin fecha al final) · rowId no parseable al final · no muta el array |
| `vitest.setup.ts` | el mock global de `useRouter` suma `replace: vi.fn()` (hoy solo `push/back/refresh`; sin esto `useListaTareas` tira `TypeError` en cualquier test que monte la lista) |
| `components/tareas/hooks/useListaTareas.test.tsx` (nuevo; mockea `next/navigation` en el archivo con `useSearchParams`/`useRouter.replace`/`usePathname` controlables, y `@/hooks/queries`) | lee filtros de la URL (valores válidos) · valor inválido de estado → "" · `setFiltro("estado","En Proceso")` → `replace("/tareas?estado=En+Proceso", {scroll:false})` · `setFiltro` a default omite el param · `mias` apaga `sinAsignar` · `hayFiltrosAvanzados` |
| `app/(app)/tareas/page.test.tsx` (adaptar) | los 4 casos existentes: el `selectOptions` de Estado sigue (es `<select>`); el panel «Filtros» sigue; se suma: tipear en «Buscar tareas» reduce la lista · cambiar «Ordenar por» a «Más antiguas» invierte el orden |
| `components/ui/Combobox.test.tsx` (nuevo) | no-strict: tipear dispara `onChange` con el texto (comportamiento actual) · strict: elegir opción → `onChange(opt)` · tipear coincidencia exacta y blur → `onChange(opt)` · tipear inválido y blur → revierte al `value`, sin `onChange` · vaciar y blur → `onChange("")` · ✕ → `onChange("")` · al enfocar con valor elegido muestra todas las opciones |
| `InformeEdificio.test`, `VisitaForm.test`, `IntegranteCard.test` (adaptar) | `elegirEdificio` pasa a: `user.click(input)` → `user.click(getByRole("option", { name }))` (helper compartido en cada archivo) |
| `tests/api/tareas-transiciones.test.ts` (adaptar) | `vi.mock("next/server", async (orig) => ({ ...await orig(), after: (fn) => fn() }))` — el `after` mockeado ejecuta el callback en el acto y el caso «cerrar genera el reporte» sigue afirmando `generateAndUploadReporte` |
| `components/tareas/hooks/useTareaDetalle.test.tsx` (extender, fake timers) | Realizada sin reporte → refetch cada 3 s · llega `reporteUrl` → deja de repollar · 20 intentos → deja de repollar, `esperandoReporte` false · no Realizada → sin polling |
| `components/ui/Toaster.test.tsx` (nuevo) | `success` renderiza con `role="status"` · desaparece a los 4 s (fake timers) · click cierra · más de 3 descarta el más viejo · `useToast` sin provider no lanza |
| `useTareaForm.test` (adaptar) | crear: `router.push` al detalle inmediato (mock **local** de `next/navigation` con un `push` estable; el global crea un `vi.fn()` nuevo por llamada y no se puede afirmar) y sin `successMsg` · editar: `onSubmitSuccess` llamado |
| `tests/components/TareaDetalle.test.tsx` | sin cambios: verificado que no afirma el modal de eliminado |

## Criterios de aceptación

1. Filtrar por edificio + «Mis tareas», abrir una tarea, volver: los filtros siguen. La URL
   `/tareas?edificio=X&mias=1` abierta en otro dispositivo muestra lo mismo.
2. Tipear «terraza» en Buscar reduce la lista al instante, sin request; la búsqueda ignora
   acentos y mayúsculas.
3. Orden por defecto: una tarea Baja abierta aparece antes que una Alta realizada; entre abiertas,
   Alta antes que Media; «Fecha estimada» pone las que vencen antes arriba y las sin fecha al final.
4. En los 6 selectores de edificio se puede tipear para filtrar; lo tipeado que no coincide se
   descarta al salir; en filtros se puede limpiar con ✕.
5. Cerrar una tarea: el detalle muestra «Generando el reporte…» y en ≤ 1 min aparece «Descargar
   reporte» sin refrescar. Si la generación falla, a los 20 intentos deja de repollar y el admin
   ve «Generar reporte».
6. Crear una tarea lleva al detalle de inmediato con un toast «Tarea creada»; editar y eliminar
   muestran su toast; guardar una visita sigue mostrando el modal con Ver/Descargar/Compartir.
7. `npm test` + `npx tsc --noEmit` + `npm run lint` + `npm run build` verdes.

## Riesgos

- **`router.replace` en cada tecla de búsqueda.** Es una navegación de Next por tecla; con
  `scroll: false` y sin fetch (todo en memoria) es barato, pero si se nota lag en celulares
  viejos, el fix es un debounce de 150 ms solo para `q`. Se decide al probar.
- **`after()` y el 60 s.** La generación del PDF + subida a Drive tarda segundos; queda dentro del
  `maxDuration`. Igual que antes en la práctica.
- **Combobox en `IntegranteCard`**: las opciones son «edificios sin asignar a nadie»; si el admin
  tipea uno ya asignado, no aparece y se descarta al salir. Correcto, pero puede confundir:
  el placeholder dice «Agregar edificio…» y la lista vacía muestra «Sin opciones».
- **Toast sobre el bottom nav.** `bottom-24` coincide con el `pb-24` del `main`; en desktop
  `md:bottom-6`. Verificar en iOS con `safe-area-inset-bottom` (el bottom nav ya lo usa).

## Definición de hecho

- `useListaTareas`, `lib/texto.ts`, `lib/tareas-orden.ts`, `Combobox strict` en los 6 lugares,
  `after()` + polling con tope, `Toaster` en el layout raíz y los 5 reemplazos de éxito.
- Tests de la tabla; árbol verde. Sin setup manual.
