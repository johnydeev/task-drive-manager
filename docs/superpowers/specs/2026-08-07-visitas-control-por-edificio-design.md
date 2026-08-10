# SPEC — Visita / Control por edificio (formulario → PDF archivado)

**Fecha:** 2026-08-07 · **rev. 2** (2026-08-08, tras consulta con el cliente)
**Estado:** Propuesto
**Autor:** equipo task-drive-manager
**Plan asociado:** [`../plans/2026-08-07-visitas-control-por-edificio.md`](../plans/2026-08-07-visitas-control-por-edificio.md)

Registro de las **visitas de control** a cada consorcio. Se completa un formulario específico
(heredado de un formulario en papel), la app **genera un PDF y lo archiva** en Drive, y en la
planilla queda el **historial de links por edificio**.

> **Cambio respecto de la rev. 1:** el cliente decidió **no persistir los datos del formulario**.
> No hay columnas por ítem de control ni tabla de archivos: el formulario se vuelca al PDF y lo
> único que persiste es el **link del PDF con su fecha**. Se conserva una tabla chica con los datos
> del edificio, para no reescribirlos en cada visita.

---

## Contexto

La administración recorre periódicamente cada consorcio y completa a mano un formulario titulado
**"VISITA/CONTROL SEMANAL"**: datos del edificio (seguros, proveedores, personal), dos grillas de
control por sector marcadas *Realizada / No realizada*, un informe general y la firma del
supervisor. Hoy ese papel no vive en ningún sistema.

La frecuencia **no es estricta** —una o dos veces por mes, lo decide el administrador—, así que
pese al título del papel no hay nada semanal que modelar.

La app ya tiene las piezas necesarias: acceso a Sheets por header (`lib/sheets/*`), subida a Drive
(`lib/google-drive.ts`), generación de PDF con membrete configurable (`@react-pdf/renderer`, hecho
para los Informes) y un uploader con cámara/galería (`components/tareas/FileUploader.tsx`).

## Problema

1. El formulario de visita vive en papel: no queda constancia archivada ni consultable.
2. No hay forma de ver **cuánto hace que no se visita** un consorcio.
3. Los datos fijos de cada edificio se reescriben a mano en cada visita.

## Alcance

**Dentro:**
- Formulario de visita con los campos exactos del papel.
- **Generación del PDF** con membrete, fotos embebidas y firma del supervisor, **archivado en Drive**.
- Hoja `Visitas` **mínima**: una fila por PDF emitido (edificio, fecha, link).
- Hoja `EdificioFicha`: los 9 datos del edificio, para precargar el formulario.
- Historial de links por edificio y panel con la última visita de todos los consorcios.
- Columna `firma_url` en `Usuarios` y carga de la firma desde la pantalla de Usuarios.
- La sección `/informes` pasa a llamarse **Informes/Visitas** y gana dos pestañas.

**Fuera:**
- **Persistir los datos del formulario** (controles, informe general, cabecera de esa visita):
  viven solo dentro del PDF.
- Editar una visita ya registrada (no hay datos que editar: se carga de nuevo y se borra la vieja).
- Programar visitas o mandar recordatorios.
- Configurar los ítems de control por edificio (la lista es fija).
- Pantalla propia para editar la ficha del edificio (se mantiene desde el formulario de visita).
- El informe de tareas existente y su PDF: no se tocan, solo se mueven a una pestaña.

---

## Decisiones

| # | Decisión | Alternativa descartada |
|---|---|---|
| 1 | Lo único que persiste de la visita es el **link del PDF + fecha + edificio** | Guardar todo el formulario en columnas |
| 2 | La cabecera se **precarga** de `EdificioFicha` y es **editable** en cada visita | Cargarla a mano siempre; sacarla del formulario |
| 3 | Al guardar, la visita **sobrescribe** `EdificioFicha` con lo cargado | Que el cambio quede solo en esa visita |
| 4 | Los **15 ítems** de control son una **lista fija en el código** | Editables en `Configuracion`; configurables por edificio |
| 5 | Dos estados por ítem: **Realizada / No realizada** | Sumar "No aplica"; observación por ítem |
| 6 | **Fotos embebidas en el PDF**, sin link propio en la planilla | Sin fotos; fotos listadas aparte |
| 7 | Cargar visita: cualquier usuario. **Eliminar: solo admin** | Solo admin para todo |
| 8 | **No existe editar una visita**: se carga de nuevo y el admin borra la errónea | Editar la fila o regenerar el PDF |
| 9 | El PDF es **inmutable**: cada carga produce un archivo nuevo | Pisar el PDF de la visita |
| 10 | Sección renombrada a **Informes/Visitas**, con pestañas Tareas y Visitas | Sección nueva propia; dentro de Edificios |
| 11 | Sin programación. **Panel con la última visita de todos** los consorcios | Recordatorios de visitas vencidas |
| 12 | Firma **por usuario**, cargada por el **admin en Usuarios**, dibujándola **o** subiendo imagen | Firmar en cada visita; que cada uno cargue la suya |
| 13 | Título: **"Visita / Control"** (sin "Semanal", que ya no aplica) | Copiar el título del papel |
| 14 | Se permiten **varias visitas del mismo edificio en la misma fecha** | Bloquear o advertir duplicados |
| 15 | La **fecha la pone el sistema** (día de la carga), no se elige | Que el supervisor cargue visitas con fecha pasada |
| 16 | Los PDF van a **`Visitas/{Edificio}/`**, rama propia hermana de `Tareas` (rev. 3) | Dentro de `Tareas/{Edificio}/`; subcarpeta por año |
| 17 | Nombre del archivo: **`VISITA - DD-MM-AAAA - Edificio.pdf`** | Formato ISO en el nombre; nombre con id |

---

## Modelo de datos

### Hoja `Visitas` (nueva, mínima)

Una fila por PDF emitido. **6 columnas:**

| Columna | Contenido |
|---|---|
| `id` | timestamp ISO, id estable (columna A) |
| `edificio` | nombre del consorcio |
| `fecha` | fecha de la visita (ISO date) — **la pone el sistema**, es el día de la carga |
| `pdf_url` | link público del PDF en Drive |
| `supervisor` | email de quien la cargó |
| `creado_en` | ISO datetime de emisión |

No hay columnas de controles, ni de cabecera, ni de informe general: **todo eso vive dentro del
PDF**. Esta hoja es el índice del historial.

### Hoja `EdificioFicha` (nueva, chica)

Una fila por consorcio: `edificio` + los 9 datos + `actualizado_en`. **11 columnas.**

`seguro_poliza` · `ascensores` · `fumigacion` · `empresa_matafuego_venc` · `encargado` ·
`caldera_termotanque` · `empresa_limpieza` · `horario_trabajo` · `encargado_limpieza_hs`

Se crea la primera vez que se carga una visita de ese edificio y **se sobrescribe en cada visita
posterior** con lo que quedó en el formulario (decisión 3). Es la fuente de la precarga.

### Hoja `Usuarios`

Suma la columna **`firma_url`**; el rango del data-layer pasa de `A:F` a **`A:G`**.

### Ítems de control

Los 15 ítems y sus etiquetas viven **una sola vez** en `lib/visitas-items.ts`, en los dos bloques
del papel:

- **Sectores:** Hall · Vereda · Palieres · Sótano · Terraza · Ascensores · Escaleras · Cochera
- **Instalaciones:** Sala de Medidores · Amenities · Luz de Palieres · Luces de Emergencia ·
  Matafuegos · Termotanque · Obleas

### Drive

Hoy los archivos de tareas viven en `{raíz}/Tareas/{Edificio}/{Año}/{Mes}/{carpeta de la tarea}/`.
Los PDFs de visitas van a una **rama propia `Visitas`, hermana de `Tareas`**, con una carpeta por
consorcio adentro:

```
{raíz}/
  ├── Tareas/{Edificio}/{Año}/{Mes}/…   ← archivos de tareas
  └── Visitas/{Edificio}/               ← todos los PDF de visitas del consorcio
```

Todos los PDFs del edificio quedan juntos en su carpeta, sin subdividir por año.

> **rev. 3 (2026-08-10):** la rev. 2 los ponía en `Tareas/{Edificio}/Visitas/`, junto a las
> carpetas de año. Se movió a rama propia tras probarlo: las visitas no siguen la lógica de
> año/mes de las tareas y quedaban escondidas dentro de su árbol. Los PDFs ya emitidos con la
> estructura vieja **siguen funcionando** — el historial los referencia por link de archivo, no
> por ruta.

**Nombre del archivo:** `VISITA - {DD-MM-AAAA} - {Edificio}.pdf`
(ejemplo: `VISITA - 08-08-2026 - Castro Barros 1310.pdf`). El nombre pasa por `sanitizeSegment`,
que ya limpia los caracteres que Drive no acepta. Como puede haber **varias visitas el mismo día**
(decisión 14) y Drive admite nombres repetidos, se agrega un sufijo ` (2)`, ` (3)`… cuando ya
existe un archivo con ese nombre en la carpeta, para poder distinguirlos.

Las fotos se suben a esa misma carpeta para poder embeberlas en el PDF. Las firmas van a
`{raíz}/_Firmas/{email}`.

---

## #1 Formulario de visita

Ruta `/visitas/nueva`. Campos, en el orden del papel:

- **Edificio** (obligatorio, consorcios activos). **La fecha no se carga**: la pone el sistema con
  el día de la emisión (hora de Buenos Aires, `lib/fecha-ar.ts`). El formulario la muestra como
  dato, no como campo editable. Consecuencia asumida: una visita hecha ayer y cargada hoy queda
  fechada hoy.
- **Cabecera**: los 9 campos de texto, **precargados** desde `EdificioFicha` al elegir el edificio.
  Todos opcionales: la primera visita de un consorcio arranca vacía.
- **Control**: los 15 ítems en dos bloques, cada uno con *Realizada* / *No realizada*. Se pueden
  dejar sin marcar.
- **Informe general**: texto largo, opcional.
- **Fotos**: opcionales, con el `FileUploader` existente. Se embeben en el PDF.

El supervisor **no se elige**: sale de la sesión.

**Al guardar**, en un solo paso: se genera el PDF, se sube a Drive, se escribe la fila en `Visitas`
y se sobrescribe `EdificioFicha`. Si la generación del PDF falla, no se escribe nada y el error se
muestra al usuario — no queda una fila apuntando a un PDF inexistente.

**Criterio:** completar y guardar produce un PDF descargable y una entrada nueva en el historial
del edificio; la siguiente visita de ese consorcio trae la cabecera precargada.

## #2 El PDF

`components/pdf/VisitaPdf.tsx` reproduce el formulario en papel: membrete de la administración
(el mismo configurable de los Informes), título **"Visita / Control"**, consorcio y fecha, los 9
datos de cabecera, las dos grillas con lo marcado en cada ítem, el informe general, las fotos, y el
nombre del supervisor con su **firma** si la tiene cargada (si no, solo el nombre — no falla).

Cada carga produce **un archivo nuevo**; nunca se pisa ni se modifica uno existente.

## #3 Historial y panel

`/informes` gana dos pestañas y el ítem del sidebar se renombra a **Informes/Visitas**:

- **Tareas** — el informe actual, sin cambios de comportamiento.
- **Visitas** — sin edificio elegido, muestra el **panel de todos los consorcios activos** con la
  fecha de su última visita y los **días transcurridos**, ordenado del más atrasado al más reciente
  y resaltando los que superan **45 días** (constante del código: la app señala, no exige). Los
  consorcios sin ninguna visita aparecen primero, marcados como "Sin visitas". Al elegir un
  edificio se ve su **historial**: la lista de PDFs con su fecha, del más nuevo al más viejo, cada
  uno enlazado al archivo en Drive.

**Criterio:** de un vistazo se ve qué consorcios hace más tiempo que no se visitan, y desde el
historial se abre cualquier PDF emitido.

## #4 Corrección de una visita

No hay edición. Si una visita se cargó mal, se **carga de nuevo** (produce un PDF nuevo con su
fila) y el **admin elimina la entrada errónea**: se borra la fila de `Visitas` y su PDF va a la
papelera de Drive (recuperable ~30 días). Un no-admin que intente eliminar recibe 403 del servidor.

## #5 Firma del supervisor

En la pantalla de **Usuarios**, el admin carga la firma de cada integrante: la **dibuja** en un
recuadro táctil (componente nuevo `components/ui/FirmaCanvas.tsx`, `<canvas>` + Pointer Events, sin
dependencias externas) **o sube una imagen**. Se guarda en Drive y la URL queda en
`Usuarios.firma_url`. Se puede reemplazar; el archivo anterior va a la papelera.

**Criterio:** cargada la firma de un usuario, sus visitas la muestran en el PDF sin que tenga que
firmar cada vez.

---

## Requisitos funcionales

- **FR-1** Completar el formulario de visita de un edificio; la fecha la asigna el sistema.
- **FR-2** Precargar los 9 datos del edificio y sobrescribirlos con lo cargado al guardar.
- **FR-3** Marcar cada uno de los 15 controles como Realizada o No realizada, o dejarlo sin marcar.
- **FR-4** Adjuntar fotos, que se embeben en el PDF.
- **FR-5** Generar el PDF con membrete y firma, y archivarlo en Drive.
- **FR-6** Guardar en la planilla el link del PDF con su fecha, edificio y supervisor.
- **FR-7** Ver el historial de PDFs de un edificio, del más nuevo al más viejo.
- **FR-8** Ver, para todos los consorcios, la última visita y los días transcurridos.
- **FR-9** Eliminar una visita: fila + PDF a la papelera (solo admin).
- **FR-10** Cargar la firma de un usuario dibujándola o subiendo una imagen (solo admin).

## Requisitos no funcionales

- **NFR-1** Lectura y escritura por header; agregar columnas no rompe nada.
- **NFR-2** La lista de ítems vive una sola vez y la comparten formulario y PDF.
- **NFR-3** TypeScript estricto sin `any`; validación con Zod en cliente y servidor.
- **NFR-4** Permisos validados en el servidor, no solo escondiendo botones.
- **NFR-5** Los botones de acción muestran spinner y quedan deshabilitados mientras corren.
- **NFR-6** El formulario es usable en el celular: es lo que se completa caminando el edificio.
- **NFR-7** Nunca queda una fila apuntando a un PDF que no se generó.
- **NFR-8** Árbol verde en cada checkpoint: `npm test`, `npx tsc --noEmit`, `npm run lint`,
  `npm run build`.

## Criterios de aceptación

1. Se completa una visita desde el celular y queda un PDF archivado más su entrada en el historial.
2. La segunda visita de ese consorcio trae los 9 datos precargados con lo cargado en la primera, y
   son editables.
3. El PDF reproduce el formulario del papel, con membrete, los controles marcados, las fotos y la
   firma del supervisor.
4. Sin firma cargada, el PDF sale con el nombre del supervisor y no falla.
5. La pestaña Visitas lista todos los consorcios con su última visita y los días transcurridos, con
   los más atrasados arriba y los que nunca se visitaron marcados como tales.
6. Un supervisor no puede eliminar una visita: el servidor responde 403.
7. Si falla la generación del PDF, no se escribe ninguna fila.
8. Suite verde: tests, `tsc`, lint y build.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Los datos del formulario solo viven en el PDF: no se pueden buscar ni reportar | Es la decisión del cliente. Si más adelante quiere estadísticas, se suman columnas sin romper lo existente (lectura por header) |
| Corregir una visita obliga a completar todo el formulario de nuevo | Aceptado: los PDF son constancias inmutables. La precarga de la cabecera reduce el retrabajo |
| Formulario largo de completar en el celular | Bloques colapsables; el único campo obligatorio es el edificio |
| Con la fecha automática, una visita cargada al día siguiente queda mal fechada | Decisión explícita del cliente (nº 15). Si más adelante molesta, se habilita editar la fecha sin tocar el modelo |
| La ficha del edificio se ensucia con un tipeo errado y se propaga | Es editable en cada visita: el siguiente que la vea la corrige |
| El canvas de firma se comporta distinto entre mouse y touch | Pointer Events (un solo camino para ambos) y prueba en el celular |
| Generar el PDF con fotos puede tardar | `maxDuration` en la route, como el reporte de tarea; spinner en el botón |

## Definición de hecho

- [ ] `lib/visitas-items.ts` con los 15 ítems y sus etiquetas, con test.
- [ ] Data-layer `lib/sheets/visitas.ts` y `lib/sheets/edificio-ficha.ts`, con tests.
- [ ] `components/pdf/VisitaPdf.tsx` + generación y archivado en Drive, con tests.
- [ ] API: crear visita (genera PDF + fila + ficha), listar, eliminar admin-only; con tests.
- [ ] Formulario `/visitas/nueva`, con test.
- [ ] Pestañas en `/informes` + panel de consorcios + historial de links, con test.
- [ ] `firma_url` en `Usuarios` (rango `A:G`) + `FirmaCanvas` y subida de imagen, con tests.
- [ ] Ítem del sidebar renombrado a "Informes/Visitas".
- [ ] `CHANGELOG.md` actualizado.
- [ ] Verde: `npm test` + `npx tsc --noEmit` + `npm run lint` + `npm run build`.

## Prerrequisito manual (lo hace Jony)

Crear en la planilla **dos hojas nuevas**, con la fila 1 de headers exactos en snake_case:

- **`Visitas`** — `id`, `edificio`, `fecha`, `pdf_url`, `supervisor`, `creado_en` (con `id` en la
  columna A).
- **`EdificioFicha`** — `edificio`, `seguro_poliza`, `ascensores`, `fumigacion`,
  `empresa_matafuego_venc`, `encargado`, `caldera_termotanque`, `empresa_limpieza`,
  `horario_trabajo`, `encargado_limpieza_hs`, `actualizado_en`.

Y en la hoja **`Usuarios`**, agregar la columna **`firma_url`**.

Sin las hojas, la sección Visitas queda vacía y guardar una visita falla con un error claro.
