# Changelog

Todos los cambios notables a este proyecto se documentan en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/),
y este proyecto adhiere a [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- **La app instalada no rotaba en tablets.** Quedaba trabada en vertical aunque se girara el
  dispositivo (en el navegador sí rotaba). Ahora la orientación la decide la tablet. En iPad hay
  que desinstalar y volver a instalar la app para que tome el cambio
- **La app quedaba caída si se caía el túnel de Cloudflare.** El chequeo de salud del contenedor
  salía a internet en vez de validarse adentro: con el túnel caído, la app se declaraba enferma y
  el túnel esperaba a que la app estuviera sana — ninguno de los dos levantaba. Ahora el chequeo
  no sale del contenedor — [`bd7851c`](https://github.com/johnydeev/task-drive-manager/commit/bd7851c)

## [1.2.0] - 2026-09-20

Auditoría UX + código de septiembre 2026. Detalle técnico en `docs/AUDITORIA-2026-09.md`.
Cada entrada lleva el commit que la introdujo.

### Added
- **Avisos en el celular (push).** Menú → «Activar avisos». En iPhone hay que instalar la app en
  la pantalla de inicio primero — [`b70db4e`](https://github.com/johnydeev/task-drive-manager/commit/b70db4e)
- **Avisos inmediatos.** Al asignar una tarea le llega al asignado; al enviarla a revisión, a los
  administradores; al objetarla, vuelve al asignado — [`b70db4e`](https://github.com/johnydeev/task-drive-manager/commit/b70db4e)
- **Recordatorios diarios.** Lunes a sábado 08:00: resumen de lo trabado hace más de un día,
  tareas por revisar (administradores) o por avanzar (supervisores) — [`b70db4e`](https://github.com/johnydeev/task-drive-manager/commit/b70db4e)
- **Campana de avisos.** Arriba a la derecha, con contador de no leídos; guarda los avisos de los
  últimos 30 días para consultarlos aunque se haya perdido la notificación — [`d9365e2`](https://github.com/johnydeev/task-drive-manager/commit/d9365e2)
- **Búsqueda y orden en la lista de tareas.** Búsqueda por texto sin importar acentos, orden por
  prioridad/fecha, y los filtros quedan en el enlace: al volver atrás o compartirlo se mantienen — [`245889f`](https://github.com/johnydeev/task-drive-manager/commit/245889f)
- **Selector de edificio con buscador** en todos los formularios (tareas, visitas, informes,
  dashboard): se escribe parte del nombre y aparece — [`245889f`](https://github.com/johnydeev/task-drive-manager/commit/245889f)
- **Pendientes de subir.** Sección arriba de la lista con las tareas creadas sin conexión,
  con Reintentar/Descartar, y botón «Sincronizar ahora» en el indicador de conexión — [`3804478`](https://github.com/johnydeev/task-drive-manager/commit/3804478)

### Changed
- **Las tareas ya no se cierran solas.** Una tarea en revisión queda así hasta que un
  administrador la cierre u objete; los recordatorios insisten hasta que se resuelva — [`b70db4e`](https://github.com/johnydeev/task-drive-manager/commit/b70db4e)
- **Confirmaciones más livianas.** Los mensajes de guardado aparecen como aviso breve en vez de
  una ventana que hay que cerrar (el modal queda solo para «visita guardada», que tiene acciones) — [`245889f`](https://github.com/johnydeev/task-drive-manager/commit/245889f)
- **Informe PDF al cerrar.** Aparece solo en la tarea a los pocos segundos, sin recargar — [`245889f`](https://github.com/johnydeev/task-drive-manager/commit/245889f)
- **Más rápido y estable.** Menos llamadas a la planilla de Google: la lista carga más rápido y
  desaparecen los errores por cuota excedida cuando varios usan la app a la vez — [`ae12525`](https://github.com/johnydeev/task-drive-manager/commit/ae12525)

### Fixed
- **Sin señal, sin duplicados.** Las tareas creadas sin conexión no se duplican al sincronizar;
  una tarea rechazada por el server queda marcada en vez de reintentarse para siempre — [`3804478`](https://github.com/johnydeev/task-drive-manager/commit/3804478)

### Security
- **Usuario desactivado pierde el acceso en menos de 15 minutos** (antes seguía entrando hasta
  7 días). Si la sesión vence, la app lleva al inicio de sesión en vez de mostrar errores — [`796228e`](https://github.com/johnydeev/task-drive-manager/commit/796228e)
- **Papelera de Drive restringida**: solo se pueden papelear archivos de la carpeta de la app y
  que ninguna tarea/visita/firma use. Los errores internos ya no exponen detalles, solo una
  referencia para buscar en el log — [`796228e`](https://github.com/johnydeev/task-drive-manager/commit/796228e)

## [1.1.0] - 2026-09-08

Todo lo deployado entre la 1.0.0 (junio) y septiembre. Commits principales por feature:

| Feature | Commits |
|---|---|
| Edificios: vista de todo el equipo + contador de pendientes | [`cbe05d7`](https://github.com/johnydeev/task-drive-manager/commit/cbe05d7) |
| Tipografía Big John en el membrete | [`e2dcf18`](https://github.com/johnydeev/task-drive-manager/commit/e2dcf18) |
| Visitas de control (formulario → PDF archivado, ficha del edificio, compartir) | [`ece97cf`](https://github.com/johnydeev/task-drive-manager/commit/ece97cf) · [`40d7c79`](https://github.com/johnydeev/task-drive-manager/commit/40d7c79) · [`de6bc70`](https://github.com/johnydeev/task-drive-manager/commit/de6bc70) · [`a3d053e`](https://github.com/johnydeev/task-drive-manager/commit/a3d053e) |
| Informes por edificio con PDF y membrete configurable | [`991a51b`](https://github.com/johnydeev/task-drive-manager/commit/991a51b) · [`37c1331`](https://github.com/johnydeev/task-drive-manager/commit/37c1331) · [`ae24c0b`](https://github.com/johnydeev/task-drive-manager/commit/ae24c0b) |
| Instalar app (PWA) e indicador de conexión | [`677c391`](https://github.com/johnydeev/task-drive-manager/commit/677c391) · [`605e1f0`](https://github.com/johnydeev/task-drive-manager/commit/605e1f0) |
| Agregar archivos y editar comentarios desde el detalle | [`8c97934`](https://github.com/johnydeev/task-drive-manager/commit/8c97934) · [`fd153c0`](https://github.com/johnydeev/task-drive-manager/commit/fd153c0) |
| Ciclo de asignación: aceptar / en proceso / revisión / objeción / cierre con nota | [`3d0116f`](https://github.com/johnydeev/task-drive-manager/commit/3d0116f) · [`a83c354`](https://github.com/johnydeev/task-drive-manager/commit/a83c354) · [`6e2bc4c`](https://github.com/johnydeev/task-drive-manager/commit/6e2bc4c) · [`71cd6ee`](https://github.com/johnydeev/task-drive-manager/commit/71cd6ee) |
| Partes comunes | [`9017ccc`](https://github.com/johnydeev/task-drive-manager/commit/9017ccc) |
| Límites y mensajes claros al subir archivos | [`2522a18`](https://github.com/johnydeev/task-drive-manager/commit/2522a18) |
| Vista Edificios con asignaciones y directivas | [`3d9d621`](https://github.com/johnydeev/task-drive-manager/commit/3d9d621) · [`4baf7fd`](https://github.com/johnydeev/task-drive-manager/commit/4baf7fd) |
| Reestructura de tablas (headers por nombre, consorcios, backfill CUIT) | [`72effc6`](https://github.com/johnydeev/task-drive-manager/commit/72effc6) · [`26a6439`](https://github.com/johnydeev/task-drive-manager/commit/26a6439) · [`2f3dbd4`](https://github.com/johnydeev/task-drive-manager/commit/2f3dbd4) |
| Proveedores, adjuntos, carpetas de Drive, eliminar tarea, modales | [`56e0366`](https://github.com/johnydeev/task-drive-manager/commit/56e0366) |
| Pipeline CI/CD de 3 fases (Test → Build → Deploy) | [`2cc2355`](https://github.com/johnydeev/task-drive-manager/commit/2cc2355) |

### Added
- **Edificios a la vista de todo el equipo**: el supervisor ahora ve en **Edificios** los
  consorcios y las tareas asignadas de **todos** los integrantes, en solo lectura — sin poder
  asignar, quitar ni crear directivas. Las **directivas ajenas siguen siendo privadas**: el
  bloque solo aparece en la tarjeta propia (o para el admin). Además, cada consorcio muestra
  al lado un **contador de tareas pendientes** (todo lo que no está *Realizada*): en rojo si
  hay trabajo abierto, apagado en `0`. El número es del **edificio**, no del integrante, y
  tocar el pill abre el listado de tareas de ese consorcio
- **Visitas de control por edificio**: formulario con los campos del parte en papel (datos del
  consorcio, 15 controles por sector marcados *Realizada / No realizada*, informe general y
  fotos) que al guardar **genera un PDF y lo archiva** en Drive, en
  `Tareas/{Edificio}/Visitas/`, con el nombre `VISITA - DD-MM-AAAA - Edificio.pdf`. Los datos del
  formulario **no se guardan en la planilla**: viven en el PDF. En la hoja `Visitas` queda el
  índice del historial (edificio, fecha y link), y los 9 datos fijos del consorcio se recuerdan en
  `EdificioFicha` para precargar la visita siguiente. Nueva pestaña **Visitas** dentro de
  **Informes/Visitas**, con el panel de todos los consorcios ordenados por antigüedad de la última
  visita (se resaltan los de más de 45 días) y el historial de PDFs de cada uno. Los PDF son
  inmutables: para corregir una visita se carga de nuevo y **solo el admin** puede eliminar la
  errónea. La **firma del supervisor** se carga desde Usuarios (dibujándola o subiendo una imagen)
  y se estampa en el PDF
- **Sección Informes**: informe de tareas por edificio y rango de fechas, con el membrete de la
  administración y las tareas agrupadas en **Pendientes / En Proceso / Realizadas** (columnas
  Dpto, Prioridad, Informe, Comentario y Estado). Botón **Exportar PDF** que descarga el informe
  armado con `@react-pdf/renderer` — no se guarda en Drive, se regenera cuando haga falta.
  Accesible para admin y supervisor: en desktop está en el sidebar, en mobile en el menú
  hamburguesa. El membrete (nombre, email, dirección, teléfono y logo) se carga en la hoja
  `Configuracion` y se edita desde **Config**, así cada despliegue usa su propia marca. El logo
  acepta tanto una **URL pública** (Drive) como una **ruta del propio sitio** (`/mi-logo.png`,
  archivo en `public/`), que el generador de PDF resuelve contra el disco
- **El responsable puede agregar archivos** (imágenes, videos, PDFs) desde el detalle de la
  tarea, mientras está **En Proceso** u **Objetada** (típicamente para sumar evidencia al
  corregir una objeción del admin). Nueva sección "Agregar archivos" (reusa el uploader con
  cámara/galería/grabar/PDF) visible solo para el asignado en esos estados; los archivos van a
  la misma carpeta de Drive de la tarea. Backend: acción `agregarArchivos` en
  `PATCH /api/tareas/[id]` (asignado-only, **append** con dedup, 409 en otros estados). Es solo
  **agregar**: no puede borrar la media ya guardada
- **Editar comentarios de la tarea** desde el detalle: el **responsable** (asignado) puede
  corregir sus comentarios **En proceso** y **Revisión** con un botón chico de editar,
  **mientras la tarea siga activa** (una vez Realizada quedan fijos, para no desincronizar
  el reporte ya emitido). Nuevo `components/tareas/ComentarioEditable.tsx` y dos acciones en
  `PATCH /api/tareas/[id]` (`editarComentarioProceso` / `editarComentarioRevision`,
  asignado-only, 409 si la tarea está cerrada). Objeción y Cierre siguen siendo de solo lectura
- **Modales de éxito** tras crear ("Tarea creada exitosamente"), editar ("Tarea editada
  exitosamente") y eliminar ("Tarea eliminada exitosamente") una tarea. Nuevo
  `components/ui/SuccessDialog.tsx`. Al cerrarlo, crear/eliminar navegan y editar cierra la edición
- **Eliminar tarea**: botón en el listado (por fila) y en el detalle, con confirmación.
  Al eliminar, la carpeta de la tarea en Drive se **mueve a la papelera** (recuperable ~30 días)
  y la fila se borra de la planilla. Solo pueden eliminar el **admin** o **quien creó** la tarea
  (validado en el server, `DELETE /api/tareas/[id]`). Nuevo `components/ui/ConfirmDialog.tsx`
- Dropdown de **Parte Común** en el alta/edición de tareas: al tildar "Parte común del
  edificio" aparece la lista de partes comunes del "edificio" virtual `Parte Común` de la
  hoja `Dptos` (columna C = `Parte Común`, tolerante a acentos/mayúsculas). Si la hoja aún
  no tiene esas filas, cae con gracia al valor genérico `"Parte Común"`
- Dropdown de **proveedores** alimentado desde la hoja externa `_Proveedores` (columna A)
  del archivo de consorcios (`lib/proveedores.ts`, cache SWR 5 min + cache offline). Usa un
  combobox propio (`components/ui/Combobox.tsx`) estilado como los selects del form: se
  despliega debajo del input, filtra mientras se escribe y permite tipear un proveedor nuevo
- Endpoint `GET /api/proveedores`
- `components/ui/Combobox.tsx`: combobox reutilizable (input + dropdown estilado con
  filtrado por acentos/mayúsculas y navegación por teclado)
- `FileUploader`: la **imagen** ahora ofrece dos opciones ("Tomar foto" con cámara / "Galería"),
  y el **video** ofrece "Grabar" (cámara) y "Buscar" (archivos del teléfono)

### Changed
- **Tipografía de la marca en el membrete**: el nombre de la administración se dibuja con
  **Big John** (`public/fonts/BigJohn.otf`) en el informe en pantalla, el PDF de informe por
  edificio y el PDF de visita. La fuente cubre solo ASCII básico —**no tiene vocales acentuadas,
  ñ, arroba ni punto medio**, y `@react-pdf/renderer` no hace fallback por glifo faltante—, así
  que se usa **únicamente en el título**: `lib/membrete-titulo.ts` lo normaliza a mayúsculas sin
  diacríticos (`Administración Morinigo` → `ADMINISTRACION MORINIGO`) y, si aun así queda algún
  carácter fuera de su cobertura, el título entero cae a la fuente de respaldo antes que salir
  con un hueco. El resto del membrete y el cuerpo de los PDFs siguen en Helvetica. La hoja
  `Configuracion` no se toca: el nombre se sigue guardando con su tilde. Si falta el archivo de
  la fuente, los PDFs se generan igual (`lib/pdf-fonts.ts` devuelve `false`)
- **Comentarios de trabajo nunca quedan en blanco**: al guardar vacío un comentario **en
  proceso** o de **revisión**, se persiste el texto **"Sin comentarios"** (visible para el admin
  y editable después). El default lo aplica el server (`PATCH /api/tareas/[id]`). La **nota de
  cierre** y la **objeción** del admin **siguen siendo obligatorias** (no usan el default): para
  cerrar u objetar tiene que haber un comentario
- **Detalle de tarea con secciones colapsables** (menos ruido visual): los **archivos
  multimedia** (imágenes, videos, documentos) ahora van en **una sola barra colapsable**
  ("Archivos multimedia (N)"), colapsada por defecto; se expande para ver la evidencia. La
  sección **"Agregar archivos"** del asignado también es colapsable. Nuevo
  `components/ui/CollapsibleSection.tsx`
- **Flujo del asignado unificado y simétrico** (`AccionesTarea`): los dos saltos de etapa
  (Aceptada→En Proceso y En Proceso→En Revisión) usan **el mismo patrón**: un botón inicial
  (**"Comenzar en Proceso"** / **"Pasar a revisión"**) que abre un textarea de comentario con
  **"Guardar y pasar a {etapa}"** + **"Cancelar"**. Si el textarea queda vacío, un modal
  pregunta si se avanza **sin comentario**. El **comentario en proceso ahora se carga al
  entrar** a En Proceso (la acción `empezar` lo guarda) y sigue editándose desde la card de
  Comentarios. Reemplaza el flujo anterior de dos botones ("Guardar comentario" + pasar a
  revisión), que confundía
- **Lista de tareas**: si la tarea **no tiene fecha estimada**, ya no se muestra la palabra
  "Estimada" colgada sin fecha (queda solo `Inicio {fecha}`)
- **CI/CD unificado en 3 fases encadenadas** (`ci-cd.yml`): Test → Build → Deploy, en un solo
  workflow. Reemplaza `ci.yml` + `release.yml`, que corrían sueltos y en paralelo (la imagen
  se buildeaba aunque los tests fallaran). El deploy automático corre en un self-hosted runner
  y requiere el alta del runner + la variable de repo `DEPLOY_DIR` (ver `docs/DEPLOY.md`)
- **PDF de reporte**: la ubicación (dpto o parte común) ahora va en el encabezado junto al
  edificio (ej. `ALMIRANTE BROWN 706 - HALL`). Se quitaron del cuerpo las filas Dpto,
  Prioridad y Fecha estimada
- **Reestructuración de carpetas en Drive.** Nueva jerarquía legible y escalable:
  `Tareas/{Edificio}/{Año}/{Mes en nombre}/{fecha · ubicación · objetivo}/` con subcarpetas
  `Imagenes/`, `Videos/`, `Documentos/` y `Reporte/`. Los archivos se renombran a
  `imagen-01.jpg`, `video-01.mp4`, `documento-01.pdf`, `reporte-01.pdf` (con índice
  incremental). La "ubicación" es el valor del dpto (`3A`) o de la parte común (`HALL`)
- El cliente genera el `rowId` de la tarea (timestamp ISO) y lo manda en cada subida y al
  crear la tarea: vincula la carpeta de Drive con la fila de Sheets 1:1 y garantiza que todos
  los archivos de una tarea caigan en la MISMA carpeta
- La subida de archivos ahora requiere elegir la ubicación (dpto/parte común) además de
  edificio y objetivo, porque forma parte del nombre de la carpeta
- `offline-db`: nueva tabla Dexie `cacheProveedores` (schema v2) para poblar el dropdown de
  proveedores sin conexión

### Added
- **Errores de subida que se entienden.** El `FileUploader` avisa el peso máximo por
  archivo al lado de cada contador (ej. `Videos (0/2) · máx 95 MB c/u`), y si el archivo
  se pasa dice exactamente por qué: *"El video no puede pesar más de 95 MB — este pesa
  187 MB"*. Si la subida se cae sin respuesta (el `Failed to fetch` pelado del navegador),
  el mensaje explica que se cortó la conexión y cuánto pesaba el archivo. Límites y textos
  viven una sola vez en `lib/upload-limits.ts` y los comparten el cliente y `/api/upload`
- **Techo de subida por infraestructura** (`LIMITE_INFRA_MB = 95`): el máximo real es el
  menor entre lo que dice la hoja `Configuracion` y lo que la infra soporta. Cloudflare
  (plan Free) rechaza todo request de más de 100 MB **cortando la conexión mientras el
  celular sube**, así que el navegador nunca ve el 413 y el `fetch` falla sin explicación.
  Ahora se corta antes, del lado del cliente, con un mensaje claro

### Fixed
- **Subir un video desde el celular fallaba con "Failed to parse body as FormData".**
  Next 16 clona y bufferea en memoria el body de todo request no-GET que pase por el
  proxy (ex middleware), con un tope de **10 MB** (`experimental.proxyClientMaxBodySize`).
  Al pasarse **corta el stream sin devolver error**: `POST /api/upload` recibía un multipart
  incompleto y `req.formData()` explotaba. Las imágenes zafaban porque se comprimen a
  ~1 MB; los videos del celular nunca. Ahora `/api/upload` queda **fuera del matcher del
  proxy** (la auth la sigue haciendo el handler con `requireSession`), así el body va
  derecho al handler sin buffer ni tope. Además, si el multipart llega cortado por
  cualquier otro motivo (mala señal, límite del CDN), la ruta responde **400 con un
  mensaje entendible** en vez del error crudo de undici
- **Editar una tarea sin fecha estimada tiraba "Datos inválidos".** El form manda siempre
  todos los campos y un `<input type="date">` vacío manda `""`; `tareaUpdateSchema` aceptaba
  solo fechas ISO (el schema de alta sí aceptaba el vacío). Las fechas opcionales ahora
  comparten una única definición (`isoDateOpcional`) entre alta y edición
- **Hoja de Configuración nunca se leía** (400 en los logs): el código apuntaba a la pestaña
  `Configuración` (con tilde) pero la real es `Configuracion` (sin tilde). Google devolvía
  `Unable to parse range` en cada lectura y la app caía a los límites por defecto; además el
  guardado de config desde el admin fallaba. Corregido en `SHEETS.configuracion` y en el seed
- **Una tarea generaba varias carpetas en Drive.** El nombre de la carpeta dependía del
  momento de cada subida (`spreadsheets.values` con timestamp por request), y como cada
  archivo es un request que tarda varios segundos, cada uno caía en una carpeta distinta.
  Ahora la carpeta se deriva del `rowId` estable de la tarea → una sola carpeta por tarea
- El **reporte** también creaba su propia carpeta aparte; ahora va a la subcarpeta `Reporte/`
  de la tarea y admite varios (`reporte-01`, `reporte-02`, …)
- **Fechas corridas un día en la app** (`formatFecha`): las fechas "solas" (`YYYY-MM-DD`)
  se parseaban con `new Date()` como medianoche UTC y al mostrarlas en horario Argentina
  (UTC-3) retrocedían un día (ej. `2026-07-13` se veía `12/07/2026`). Los datos en Sheets
  siempre estuvieron bien; era solo el formateo. Ahora las fechas calendario se formatean por
  string, sin timezone. Afecta al detalle, listado y dashboard
- **Parte común ahora es obligatoria**: al tildar "Parte común del edificio" hay que elegir
  una parte común de la lista, igual que el dpto es obligatorio cuando está destildado. Antes
  dejaba crear la tarea sin seleccionar ninguna (caía al genérico "Parte Común"). Validado en
  cliente (`formSchema`) y servidor (`tareaNuevaSchema`/`tareaUpdateSchema`) con mensajes
  contextuales ("Seleccioná una parte común" / "Seleccioná un dpto")
- **Alta de tareas rota** (`appendTarea`): se dejaba de usar `spreadsheets.values.append`.
  La pestaña `Tareas` tiene tablas auxiliares en columnas altas y el "table detection" de
  `append` escribía la fila nueva corrida a la columna U en vez de la A. Como el `rowId`
  no quedaba en la columna A, el detalle no encontraba la tarea recién creada
  (404 "No se pudo cargar la tarea"). Ahora se calcula la próxima fila libre por la columna A
  y se escribe con `values.update` en el rango exacto `A:V`
- `dpto` de parte común: se preservaba mal. El valor específico elegido (ej. "Terraza") se
  pisaba con el marcador genérico "Parte Común" en la ruta POST, en `appendTarea` y en
  `updateTarea`. Ahora los tres conservan la parte común específica y solo caen a "Parte Común"
  si no se eligió ninguna
- `TareaForm`: el reset de `dpto` al cambiar de edificio/Parte Común ya no pisa el valor
  inicial en modo edición (se saltea el primer render)

## [1.0.0] - 2026-06-23

> El tag `v1.0.0` de git apunta a este estado (commit `3e09f32`), que incluye tanto el trabajo
> de deploy Docker/CI-CD del 2026-06-16 (ver detalle en [1.0.0-rc1] más abajo) como los ajustes
> post-deploy que siguieron hasta quedar estable en producción.

### Added
- Soporte de Unidades Compartidas (Shared Drives) en el cliente de Drive (`supportsAllDrives`)
  — necesario porque el Service Account no tiene cuota de almacenamiento propia
- `parseTareasRows`: lectura robusta de la hoja `Tareas` por contenido (detecta filas por
  rowId válido), tolera hoja sin header y filas vacías intercaladas
- `edificioMatches`: match de dptos por edificio insensible a mayúsculas/acentos/espacios
  (los nombres difieren entre `_Consorcios` canónico y la hoja `Dptos` legacy)
- `trustHost: true` en NextAuth — fix del `ERR_TOO_MANY_REDIRECTS` detrás de Cloudflare Tunnel

### Changed
- Variable de entorno `GOOGLE_MASTER_SHEET_ID` renombrada a `GOOGLE_CONSORCIOS_SHEET_ID`
  (y la función `getMasterSheetId` → `getConsorciosSheetId`)
- Normalización del rol de usuario a minúscula (acepta `ADMIN`/`Admin`/`admin` en la hoja)
- Puerto de dev/start fijado en `4000` (`next dev/start -p 4000`)
- ESLint: ignora el service worker generado (`public/sw.js`) y baja `react-hooks/set-state-in-effect`
  a warning (falsos positivos en patrones SSR-safe)

### Removed
- Feature "Visitas por edificio" del dashboard y endpoint `/api/respuestas`
  (leía la hoja `Respuestas de Trabajadores`, no se usa). La hoja en Sheets queda intacta.

### Deployed
- App en producción vía Docker self-hosted + Cloudflare Tunnel en `https://task.pdf-doc-processor.com`

## [1.0.0-rc1] - 2026-06-16

### Added
- Lectura de edificios desde archivo Sheets externo `_Consorcios` (SOT de ia-drive-doc-processor)
- Cache SWR de 5 min para `_Consorcios`
- Filtrado de consorcios inactivos (columna `ACTIVO=FALSE`)
- Validación estricta de edificio canónico en POST /api/tareas
- Endpoint `/api/health` para Docker healthcheck
- Dockerfile multi-stage con Next.js standalone
- `docker-compose.yml` con web + Cloudflare Tunnel
- GitHub Actions CI: lint + typecheck + tests + build
- GitHub Actions Release: build + push a GHCR
- Script de seed idempotente para hojas Usuarios y Configuración
- Documentación de deploy paso a paso en `docs/DEPLOY.md`

### Changed
- App escribe en hoja `Tareas` nueva, no en `Ingreso de Pendiente` legacy
- Cliente Sheets refactorizado a multi-spreadsheet
- `next.config.ts` con `output: "standalone"`

### Deprecated
- Hoja `Edificios` del archivo principal (queda como histórico, la app la ignora)
- Función `getEdificios()` en `lib/google-sheets.ts` (reemplazada por `getConsorciosActivos` en `lib/consorcios.ts`)

## [0.1.0] - 2026-06-14

### Added
- Feature PDFs adjuntos + reportes generados (ver `docs/superpowers/plans/2026-06-14-pdf-reportes-y-adjuntos.md`)
- Suite de tests con Vitest (33 tests)

## [0.0.1] - 2026-06-01

### Added
- Implementación inicial: tareas, dashboard, usuarios, configuración, PWA, offline mode

[Unreleased]: https://github.com/johnydeev/task-drive-manager/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/johnydeev/task-drive-manager/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/johnydeev/task-drive-manager/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/johnydeev/task-drive-manager/releases/tag/v1.0.0
