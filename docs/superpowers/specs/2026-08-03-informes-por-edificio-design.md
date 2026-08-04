# SPEC — Informes por edificio (vista + PDF con membrete)

**Fecha:** 2026-08-03
**Estado:** Propuesto (rev. 1)
**Autor:** equipo task-drive-manager
**Plan asociado:** [`../plans/2026-08-03-informes-por-edificio.md`](../plans/2026-08-03-informes-por-edificio.md)

Sección nueva **Informes**: se elige un edificio y un rango de fechas, y la app arma un informe
con membrete de la administración y las tareas agrupadas en tres bloques, exportable a PDF.

---

## Contexto

Hoy la administradora arma a mano, en una planilla aparte, un informe mensual por consorcio
("Trabajos Pendientes"): membrete con logo y datos de contacto, el nombre del consorcio, el mes,
y una tabla `Dpto | Prioridad | Informe | Comentario en Proceso | Estado` con las filas pintadas
según el estado. Ese informe es lo que se le rinde al consorcio.

La app ya tiene todos esos datos —cada `Tarea` guarda edificio, dpto, prioridad, informe,
comentarios y estado— pero no hay ninguna vista que los presente por edificio en formato de
rendición. El listado `/tareas` es operativo (filtros, acciones, detalle), no presentable.

Existe ya un pipeline de PDF: `@react-pdf/renderer` + `components/pdf/TareaReportePdf.tsx` +
`lib/pdf-generator.tsx`, que genera el reporte **de una tarea** al cerrarla y lo sube a Drive.
Este informe es otra cosa: **agregado por edificio** y **efímero** (se descarga, no se archiva).

## Problema

1. No hay forma de sacar de la app el informe que se le entrega al consorcio; se rehace a mano
   en una planilla, duplicando datos que ya están cargados.
2. Al duplicar a mano, el informe queda desactualizado apenas cambia el estado de una tarea.
3. El membrete (logo, nombre, contacto) vive solo en esa planilla suelta.

## Alcance

**Dentro:**
- Sección `/informes` en el sidebar, visible para **todos los usuarios** (admin y supervisor).
- Selector de edificio + rango de fechas desde/hasta.
- Informe en pantalla: membrete + tres tablas agrupadas por estado.
- Exportación a **PDF descargable** (no se guarda en Drive).
- Membrete **configurable** desde la hoja `Configuracion` + su UI en `/configuracion`.

**Fuera:**
- Cambios en el ciclo de estados de la Tarea o en sus permisos.
- Informe multi-edificio (uno solo por vez) y envío por email.
- Archivar informes emitidos / historial de informes.
- El reporte por tarea existente (`TareaReportePdf`) y su subida a Drive: no se tocan.
- La migración de las tareas legacy de `Ingreso de Pendiente`.

---

## Decisiones

| # | Decisión | Alternativa descartada |
|---|---|---|
| 1 | Entran **todas** las tareas del edificio, incluidas las Realizadas | Solo las no terminadas |
| 2 | Filtro por **rango desde/hasta** contra `fechaInicio` | Selector de mes; sin filtro |
| 3 | **Una página** `/informes` con selector de edificio (sin query params) | Lista de edificios + ruta por edificio |
| 4 | Membrete en la hoja **`Configuracion`** | Variables de entorno; hardcodeado |
| 5 | PDF de **descarga directa**, sin pasar por Drive | Guardar en Drive con historial |
| 6 | **3 grupos consolidados** (Pendientes / En Proceso / Realizadas) | 7 grupos; sin encabezados |
| 7 | Visible para **todos los usuarios** | Solo admin |
| 8 | En mobile va en el **drawer**, no en la bottom nav | Bottom nav de 5 celdas |
| 9 | La columna de comentario muestra el **más reciente** (cascada) | Solo `comentarioEnProceso` |

---

## #1 — Agrupado (lógica pura)

Módulo nuevo `lib/informes.ts`, **sin IO**: recibe `Tarea[]` y devuelve los grupos listos para
renderizar. Es la única fuente de verdad del orden y la agrupación, y la comparten la vista y el
PDF, así no pueden divergir.

**Grupos, en orden fijo:**

| Grupo | Estados que incluye |
|---|---|
| Pendientes | `Sin asignar`, `Asignada`, `Aceptada` |
| En Proceso | `En Proceso`, `En Revisión`, `Objetada` |
| Realizadas | `Realizada` |

Los tres grupos se emiten **siempre**, aun vacíos; quien renderiza decide si oculta los vacíos
(la vista y el PDF los omiten).

**Orden dentro de cada grupo:** prioridad descendente (`Alta` → `Media` → `Baja`) y, a igual
prioridad, `fechaInicio` ascendente (lo más viejo primero).

**Estado por fila:** se usa `tarea.estado` tal como viene de `getTareas`, que **ya aplica el
cierre derivado a 72 h** (`estadoEfectivoTarea`, [`lib/sheets/tareas.ts`](../../../lib/sheets/tareas.ts)).
No se recalcula nada acá.

**Comentario por fila** (decisión 9), en cascada, primero no vacío gana:
`notaObjecion` → `comentarioRevision` → `comentarioEnProceso` → `""`.
La función expone también de cuál se trata, para que la celda pueda etiquetarlo
(p. ej. "Objeción: …"). Esto es una función aparte, `comentarioMasReciente(tarea)`.

**Criterio:** dadas tareas de los 7 estados, la función devuelve 3 grupos en el orden fijado, con
cada tarea en el grupo que le corresponde y ordenadas por prioridad y fecha.

## #2 — Vista `/informes`

Página nueva en el grupo `(app)`, siguiendo el patrón del repo: lógica en un hook fino
(`useInforme`) y el JSX en componentes.

**Controles (arriba):**
- Selector de **edificio** (`useEdificios`, mismos consorcios activos que el alta de tareas).
- Inputs **desde** y **hasta** (`type="date"`). Por defecto: primer día del mes actual y hoy.
- Botón **Exportar PDF** con spinner y `disabled` mientras genera, deshabilitado si no hay
  edificio elegido.

**Cuerpo:**
- **Membrete** (ver #3): logo, nombre de la administración, contacto, el edificio elegido y el
  rango de fechas.
- Las **tres tablas**, cada una con su encabezado de grupo y el conteo de filas. Columnas:
  `Dpto | Prioridad | Informe | Comentario | Estado`. Los grupos sin filas no se dibujan.
- Cada fila enlaza al detalle de la tarea (`/tareas/[id]`) — esto existe solo en pantalla, no en
  el PDF.

**Estados de la vista:** sin edificio elegido, un vacío que invita a elegir uno; cargando,
el patrón de carga que ya usan las otras vistas; sin resultados en el rango, un aviso de que no
hay tareas en ese período.

**Datos:** reusa `GET /api/tareas?edificio=&desde=&hasta=` vía `api.tareas.list`. **No se agrega
ni se modifica ningún endpoint de tareas.**

**Criterio:** eligiendo un edificio con tareas en el rango, la vista muestra el membrete y hasta
tres tablas agrupadas, con las columnas indicadas y el estado exacto de cada tarea.

## #3 — Membrete configurable

Cinco claves nuevas en la hoja `Configuracion` (que ya es clave/valor en `A2:B`):

| Clave | Contenido |
|---|---|
| `membrete_nombre` | Nombre de la administración |
| `membrete_email` | Email de contacto |
| `membrete_direccion` | Dirección |
| `membrete_telefono` | Teléfono y horario de atención |
| `membrete_logo_url` | URL pública de la imagen del logo |

Se agregan al tipo `Configuracion` como **strings opcionales** (default `""`) y se leen en el
mismo `getConfiguracion` (cache de 5 min ya existente). Se editan desde `/configuracion`, en una
sección propia separada de los límites de subida.

**Fallbacks:** cualquier campo vacío simplemente no se dibuja. Sin `membrete_logo_url` el informe
sale sin logo; sin `membrete_nombre` cae a `APP_NAME`. El informe nunca se rompe por membrete
incompleto.

⚠️ **Cambio obligatorio en `updateConfiguracion`.** Hoy arma un array `entries` con las 6 claves
numéricas y reescribe `Configuracion!A2:B{entries.length + 1}` (el rango ya se deriva del largo,
no es una constante). Si no se suman las claves del membrete a ese array, guardar desde
`/configuracion` reescribiría solo las 6 primeras filas y **los cambios del membrete no se
persistirían**. Pasa a escribir las 11 entradas juntas, en orden fijo, de modo que el bloque
completo quede determinado por el código y la lectura por clave siga funcionando igual.

**Criterio:** cargados los 5 valores en la hoja, aparecen en el membrete de la vista y del PDF; al
guardar los límites de subida desde `/configuracion`, los valores del membrete siguen intactos.

## #4 — Exportación a PDF

**Componente:** `components/pdf/InformeEdificioPdf.tsx` (`@react-pdf/renderer`), hermano del
`TareaReportePdf` existente. Membrete arriba, las tres tablas debajo, cada fila marcada para no
cortarse entre páginas, y pie fijo con la fecha de generación en hora de Buenos Aires
(`lib/fecha-ar.ts`).
Fondo por grupo, como la planilla actual: rosado en Pendientes, amarillo en En Proceso, verde en
Realizadas.

**Endpoint:** `GET /api/informes/pdf?edificio=&desde=&hasta=`, con `withAuth` (todos los roles) y
`runtime = "nodejs"`. Lee las tareas y la configuración, arma los grupos con `lib/informes.ts`,
renderiza con `renderToBuffer` y responde:

```
Content-Type: application/pdf
Content-Disposition: attachment; filename="informe-<edificio>-<desde>-<hasta>.pdf"
```

El nombre de archivo se normaliza (sin acentos ni espacios). Falta `edificio` → 400.
**No toca Drive ni la planilla.** En `DEMO_MODE` genera igual (los datos ya son fake, no hay IO
externo que evitar).

**Criterio:** con edificio y rango válidos, el endpoint devuelve un PDF descargable cuyo contenido
coincide con lo que muestra la pantalla.

## #5 — Entrada en el sidebar

Ítem nuevo en `NAV` de `components/layout/AppShell.tsx`:
`{ href: "/informes", label: "Informes", Icon: FileText }`.

`NavItem` gana un flag **`drawerOnly?: boolean`**, que hoy no existe: la separación entre bottom
nav y drawer se deriva de `adminOnly`, y "Informes" es visible para todos pero **no** debe ocupar
una celda de la bottom nav (quedaría en 5 celdas, decisión 8). Queda así:

- `bottomItems` = ítems **sin** `adminOnly` y **sin** `drawerOnly` → Tareas, Edificios, Dashboard.
- `drawerItems` = ítems con `adminOnly` **o** `drawerOnly` → Informes, y Usuarios/Config si es admin.
- Desktop sigue usando `items` completo: Informes aparece en el sidebar entre Edificios y Dashboard.

**Criterio:** en desktop, Informes está en el sidebar para cualquier rol; en mobile está en el
drawer y la bottom nav sigue con 3 celdas + Nueva.

---

## Requisitos funcionales

- **FR-1** Elegir un edificio de los consorcios activos y un rango desde/hasta.
- **FR-2** Ver las tareas de ese edificio y rango, agrupadas en Pendientes / En Proceso / Realizadas.
- **FR-3** Cada fila muestra dpto, prioridad, informe, el comentario más reciente y el estado exacto.
- **FR-4** Ver el membrete de la administración, tomado de la hoja `Configuracion`.
- **FR-5** Descargar el informe como PDF con el mismo contenido que la pantalla.
- **FR-6** Editar los datos del membrete desde `/configuracion` (admin).
- **FR-7** La sección es accesible para admin y supervisor.

## Requisitos no funcionales

- **NFR-1** Sin cambios de schema en la hoja `Tareas`; solo se **agregan filas** a `Configuracion`.
- **NFR-2** El agrupado es una función pura y testeable, sin IO.
- **NFR-3** El árbol queda verde: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- **NFR-4** TypeScript estricto, sin `any`; validación con Zod en el endpoint.
- **NFR-5** El botón de exportar cumple la regla de UI del repo: spinner + `disabled` mientras corre.
- **NFR-6** La vista es usable en mobile (las tablas scrollean en horizontal si no entran).

## Criterios de aceptación

1. `/informes` aparece en el sidebar desktop para admin y supervisor, y en el drawer en mobile;
   la bottom nav sigue con 3 celdas + Nueva.
2. Al elegir un edificio y un rango, se listan sus tareas agrupadas en los tres bloques, en el
   orden por prioridad y fecha definido, y los grupos vacíos no se dibujan.
3. El estado que se muestra por fila es el efectivo (una tarea En Revisión con más de 72 h aparece
   como Realizada, igual que en el resto de la app).
4. El membrete muestra los valores cargados en la hoja `Configuracion`, y con campos vacíos el
   informe se dibuja igual, sin huecos rotos.
5. "Exportar PDF" descarga un archivo cuyo contenido coincide con la pantalla, y el botón muestra
   spinner mientras genera.
6. Guardar los límites de subida en `/configuracion` no pisa los valores del membrete.
7. Suite verde: tests, `tsc`, lint y build.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| `updateConfiguracion` pisa las claves nuevas del membrete | Se reescribe para cubrir las 11 entradas; test que guarde límites y verifique que el membrete sobrevive |
| Informes muy largos: un edificio con muchas tareas genera un PDF pesado y lento | El rango de fechas acota; el encabezado se repite por página. Si aparece un caso extremo, se evalúa paginar |
| El logo por URL puede fallar (link roto, no público) | `membrete_logo_url` vacío o inaccesible ⇒ el PDF se genera sin logo, no falla |
| La columna Informe puede ser texto largo y romper el layout del PDF | Ancho de columna fijo con wrap; el texto fluye en varias líneas |
| Textos con acentos en el nombre de archivo | El filename se normaliza a ASCII |

## Definición de hecho

- [ ] `lib/informes.ts` con su test colocado (agrupado, orden y cascada de comentario).
- [ ] Vista `/informes` con selector, rango, membrete y las tres tablas, con su test.
- [ ] Claves del membrete leídas en `getConfiguracion` y editables en `/configuracion`.
- [ ] `updateConfiguracion` escribe todas las entradas sin pisar el membrete, con test.
- [ ] `InformeEdificioPdf` + `GET /api/informes/pdf`, con test de endpoint.
- [ ] Ítem "Informes" en el sidebar y en el drawer, con `drawerOnly` cubierto por test.
- [ ] `CHANGELOG.md` actualizado.
- [ ] Verde: `npm test` + `npx tsc --noEmit` + `npm run lint` + `npm run build`.

## Prerrequisito manual (lo hace Jony)

Agregar en la hoja **`Configuracion`**, debajo de las 6 filas existentes, 5 filas nuevas con la
clave en la columna A y el valor en la B:

```
membrete_nombre      Administración Morinigo
membrete_email       contacto@morinigoadm.com
membrete_direccion   Colombres 528 C.A.B.A
membrete_telefono    Tel: 4957-1938 de 13 a 17hs
membrete_logo_url    <URL pública de la imagen del logo>
```

Si las filas no existen, el informe igual se genera: sale sin membrete (o con `APP_NAME` como
nombre). También se pueden cargar después desde `/configuracion`.
