# Gestión Morinigo — Task Drive Manager

App web mobile-first (PWA) para la administración de ~50 consorcios en Buenos Aires. Reemplaza a AppSheet usando una **Google Sheet existente** como fuente de verdad y Google Drive para almacenar imágenes y videos de cada tarea.

## Stack

- **Next.js 16** (App Router) + React 19 + TypeScript estricto
- **Tailwind CSS v4**
- **NextAuth v5** con Google OAuth
- **TanStack Query v5** para data fetching
- **Dexie.js** (IndexedDB) + Service Worker (serwist) para modo offline + PWA
- **googleapis** (Sheets + Drive con Service Account)
- **Zod** para validación

## Scripts

```bash
npm run dev    # servidor de desarrollo en http://localhost:4000
npm run build  # build de producción (webpack)
npm start      # servir el build (puerto 4000)
npm run lint   # ESLint
npm test       # suite de tests (Vitest)
npm run seed   # llena hojas Usuarios y Configuración (requiere .env.local)
npm run icons  # genera íconos PWA desde public/logo-source.png
```

## Setup paso a paso

### 1. Configurar Google Cloud

1. Crear un proyecto en https://console.cloud.google.com
2. Habilitar las APIs:
   - **Google Sheets API**
   - **Google Drive API**
3. Crear una **Service Account**:
   - IAM & Admin → Service Accounts → Create
   - Generar una **key JSON** y descargarla
4. Crear credenciales **OAuth 2.0 Client ID** (para el login de usuarios):
   - APIs & Services → Credentials → Create credentials → OAuth client ID
   - Application type: Web application
   - Authorized redirect URI: `http://localhost:4000/api/auth/callback/google` (y agregar el de producción)
   - Pantalla de consentimiento "Externo": agregar los emails como **Usuarios de prueba**

### 2. Preparar las Google Sheets

**Archivo principal** (`GOOGLE_SHEET_ID`) — tabs:

- `Tareas` — hoja nueva donde escribe la app (mapping de columnas en `rowToTarea`, `lib/google-sheets.ts`)
- `Dptos` — A=ID dpto, B=DPTO, C=Edificio ref
- `Usuarios` — A=email, B=nombre, C=rol (admin/supervisor), D=activo, E=creado_en
- `Configuración` — A=clave, B=valor
- `Dptos` — incluye además un "edificio" virtual con `Edificio ref = Parte Común`: sus filas
  son las partes comunes posibles (Hall, Palier, Terraza, etc.) que se ofrecen en el dropdown
  cuando la tarea es de parte común
- `Ingreso de Pendiente` — hoja legacy (la app NO la toca; queda como histórico)
- `Edificios` — hoja legacy deprecada (los edificios ahora salen de `_Consorcios`, ver abajo)

**Archivo de consorcios** (`GOOGLE_CONSORCIOS_SHEET_ID`, externo) — tabs:

- `_Consorcios` — A=NOMBRE CANÓNICO, B=CUIT, E=ACTIVO. Listado de edificios (solo lectura)
- `_Proveedores` — A=nombre del proveedor. Alimenta el dropdown de proveedores (solo lectura)

**Compartir** el archivo principal con el SA como **Editor**, y el de consorcios/proveedores como **Lector**.

**Crear el primer admin** (o usar `npm run seed`): agregar una fila en `Usuarios`:

```
tu-email@gmail.com | Tu Nombre | admin | TRUE | 2026-06-19T00:00:00.000Z
```

Sin esa fila, nadie puede iniciar sesión.

### 3. Preparar Google Drive

1. Crear una **Unidad Compartida** (Drive → Unidades compartidas → Nueva)
2. Agregar el email del SA como **Administrador de contenido**
3. Copiar el ID de la URL: `drive.google.com/drive/folders/{ESTE_ID}`

> Debe ser **Unidad Compartida**, no carpeta de "Mi unidad": el SA no tiene cuota propia.

La app crea las carpetas automáticamente:
```
Tareas/{Edificio}/{Año}/{Mes}/{fecha · ubicación · objetivo}/
  Imagenes/    imagen-01.jpg, imagen-02.jpg, …
  Videos/      video-01.mp4, …
  Documentos/  documento-01.pdf, …
  Reporte/     reporte-01.pdf, …   (si se generó reporte)
```
El "Mes" es el nombre en español (ej. `Julio`) y la "ubicación" es el valor del dpto (`3A`) o de la parte común (`HALL`). La carpeta se deriva del `rowId` de la tarea, así todos los archivos caen en una sola carpeta.

### 4. Variables de entorno

Copiar `.env.example` a `.env.local` y completar:

```env
GOOGLE_SHEET_ID=...                  # archivo principal (Tareas/Dptos/Usuarios/Configuración)
GOOGLE_CONSORCIOS_SHEET_ID=...       # archivo externo con el tab _Consorcios
GOOGLE_SERVICE_ACCOUNT_EMAIL=...     # del JSON descargado, campo client_email
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_DRIVE_ROOT_FOLDER_ID=...      # ID de la Unidad Compartida

NEXTAUTH_URL=http://localhost:4000
NEXTAUTH_SECRET=...                  # generar con: openssl rand -base64 32

GOOGLE_CLIENT_ID=...                 # OAuth client ID
GOOGLE_CLIENT_SECRET=...
```

> ⚠ `GOOGLE_PRIVATE_KEY` debe contener los `\n` literales (no saltos de línea reales). Si lo pegás del JSON, las comillas y los `\n` ya vienen correctos.
>
> Para producción (Docker) ver `docs/DEPLOY.md`.

### 5. Correr en dev

```bash
npm run dev   # http://localhost:4000
```

Abrir http://localhost:4000 → redirige a `/tareas`. Sin sesión, redirige a `/login`.

## Estructura

```
app/
  (auth)/login/        # página de login (Google)
  (app)/               # layout protegido con shell mobile/desktop
    tareas/            # lista, nueva, detalle
    dashboard/
    usuarios/          # solo admin
    configuracion/     # solo admin
  api/
    auth/[...nextauth] # NextAuth handler
    health/            # healthcheck para Docker
    tareas/            # GET (list), POST (create)
    tareas/[id]/       # GET, PUT, PATCH (cambio de estado)
    tareas/[id]/reporte/ # POST genera PDF de reporte y lo sube a Drive
    edificios/         # GET (lee _Consorcios externo)
    dptos/             # GET (incluye el "edificio" virtual Parte Común)
    proveedores/       # GET (lee _Proveedores externo)
    usuarios/          # solo admin
    configuracion/     # GET público, PUT solo admin
    upload/            # POST imagen/video/PDF → Drive
components/
  layout/AppShell.tsx  # bottom nav mobile / sidebar desktop
  providers/           # SessionProvider + QueryProvider + PWA + offline sync
  pdf/TareaReportePdf.tsx # template del PDF de reporte (@react-pdf/renderer)
lib/
  google-auth.ts       # JWT del Service Account + getSheetId/getConsorciosSheetId
  sheets-client.ts     # cliente Sheets genérico multi-spreadsheet
  google-sheets.ts     # CRUD de Tareas/Dptos/Usuarios/Configuración (hoja principal)
  consorcios.ts        # lee edificios de _Consorcios externo (cache SWR)
  proveedores.ts       # lee proveedores de _Proveedores externo (cache SWR)
  google-drive.ts      # upload + ensureFolder + Shared Drives + permisos públicos
  pdf-generator.tsx    # renderiza el PDF de reporte y lo sube a Drive
  auth.ts              # NextAuth v5 (trustHost) + role check contra hoja Usuarios
  demo-mode.ts         # bypass DEMO_MODE  ·  demo-data.ts # datos fake
  offline-db.ts        # Dexie  ·  offline-sync.ts  ·  background-sync.ts
  api-client.ts        # fetcher tipado (browser)  ·  dashboard.ts # agregaciones + CSV
  schemas.ts           # validación Zod  ·  api-utils.ts  ·  utils.ts
types/
  index.ts             # Tarea, Edificio, Dpto, Usuario, Configuracion
  next-auth.d.ts       # extiende Session con rol/activo
proxy.ts               # (Next 16, ex middleware.ts) redirección a /login si no hay sesión
```

## Estado de implementación

✅ Scaffolding + dependencias + tipos
✅ Cliente Google Sheets (CRUD por hoja, cache de configuración 5 min)
✅ Cliente Google Drive (ensureFolder anidado, upload con permiso público, sanitización del path)
✅ NextAuth v5 + validación de rol contra hoja Usuarios
✅ Proxy (Next 16 — antes "middleware") de redirección a /login
✅ API routes: edificios, dptos, tareas (GET/POST/PUT/PATCH), usuarios (CRUD), configuracion, upload
✅ UI login con Google
✅ Shell con bottom-nav mobile y sidebar desktop
✅ Lista de tareas con filtros (edificio/estado/prioridad)
✅ Formulario nueva tarea: selector edificio + dpto filtrado, toggle Parte Común, validación Zod
✅ FileUploader con compresión cliente (1200px/q80) + límites de la hoja Configuración
✅ Detalle de tarea + galería + cambio rápido de estado + modo edición inline
✅ Gestión de usuarios (admin): crear, activar/desactivar
✅ Configuración (admin): editar límites de archivos
✅ Dexie schema (cola pendingSync + cache local de edificios/dptos/config)
✅ Dashboard con KPIs, charts (recharts), tabla analítica con sort, export CSV
✅ Hook useOnlineStatus + badge en header con contador de pendientes
✅ syncPendingTareas con retries (máx 3) — se dispara al cargar la app, al volver online, y cada 5 min
✅ Fallback offline en TareaForm: encola tareas en IndexedDB cuando no hay red + cache local de edificios/dptos/config
✅ Adjuntar PDFs externos (facturas, presupuestos, planos) a una tarea — columna `documentos` en Sheet
✅ Generación de PDF de reporte por tarea con `@react-pdf/renderer` — incluye datos, informe, comentarios, thumbnails de imágenes
✅ Auto-generación del reporte al cerrar tarea (estado=Realizado dispara fire-and-forget)
✅ Botón "Generar/Descargar reporte" en detalle con regeneración manual
✅ Demo bypass en pdf-generator — no toca Drive real en DEMO_MODE
✅ Suite de tests con Vitest + RTL: schemas, mapping Sheets, demo data, API endpoints, componentes (60 tests)
✅ Hoja `Tareas` nueva paralela a `Ingreso de Pendiente` legacy
✅ Integración con archivo externo `_Consorcios` (read-only, cache SWR)
✅ Filtrado de consorcios inactivos (columna `ACTIVO`)
✅ Validación estricta de edificio canónico
✅ Endpoint `/api/health` para Docker
✅ Dockerfile multi-stage con Next.js standalone
✅ `docker-compose.yml` con Cloudflare Tunnel
✅ CI/CD con GitHub Actions (build + push a GHCR)
✅ Service Worker (serwist) para precache de páginas y assets
✅ PWA manifest + meta tags (íconos pendientes: subir `public/logo-source.png` y correr `npm run icons`)
✅ Soporte de Unidades Compartidas (Shared Drives) en uploads a Drive
✅ Lectura robusta de la hoja Tareas (tolera sin header / filas vacías) y match de dptos por nombre normalizado
✅ Deploy en producción: Docker self-hosted + Cloudflare Tunnel en `https://task.pdf-doc-processor.com`
✅ NextAuth con `trustHost` (funciona detrás del tunnel sin loops de redirect)
✅ Tag `v1.0.0` pusheado — versiona la release en GHCR
✅ Dropdown de partes comunes (edificio virtual `Parte Común` en la hoja `Dptos`)
✅ Dropdown de proveedores desde la hoja externa `_Proveedores` (datalist: elegir o escribir)
✅ FileUploader: imagen con cámara/galería y video con grabar/buscar

🔲 Íconos PWA reales (subir `public/logo-source.png` + `npm run icons`)
🔲 Migración de las ~1134 tareas legacy de `Ingreso de Pendiente` (pendiente de aprobación del cliente)

Ver `docs/DEPLOY.md` para el deploy y `docs/superpowers/plans/EXECUTION_STATE.md` para el historial de ejecución.

## Convenciones

- TypeScript estricto, no usar `any`
- Validación de inputs con Zod en cliente y en API routes
- Errores en API: `{ error: string }` con status HTTP apropiado
- Naming: PascalCase componentes, camelCase funciones, kebab-case archivos
- El campo `Dpto` es **obligatorio**: si `parteComun=true` se guarda como `"Parte Común"`, nunca vacío

## Deploy

Listo para Vercel. Cargar las mismas env vars en el dashboard del proyecto. `NEXTAUTH_URL` debe apuntar al dominio de producción y la redirect URI de OAuth debe incluirlo.

## Deploy a producción

Ver [docs/DEPLOY.md](docs/DEPLOY.md) para instrucciones paso a paso.
