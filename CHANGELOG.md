# Changelog

Todos los cambios notables a este proyecto se documentan en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/),
y este proyecto adhiere a [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
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
