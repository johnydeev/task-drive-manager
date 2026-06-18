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
npm run dev    # servidor de desarrollo en http://localhost:3000
npm run build  # build de producción
npm start      # servir el build
npm run lint   # ESLint
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
   - Authorized redirect URI: `http://localhost:3000/api/auth/callback/google` (y agregar el de producción)

### 2. Preparar la Google Sheet

La spreadsheet existente debe tener los tabs:

- `Edificios` — columna A: nombres de edificios
- `Dptos` — A=ID dpto, B=DPTO, C=Edificio ref
- `Ingreso de Pendiente` — ver `PROMPT_CLAUDE_CODE.md` para mapping completo de columnas
- `Usuarios` (nueva) — A=email, B=nombre, C=rol (admin/supervisor), D=activo, E=creado_en
- `Configuración` (nueva, opcional) — A=clave, B=valor
- `Respuestas de Trabajadores` (existente, solo lectura)

**Compartir** la spreadsheet con el email de la Service Account (rol Editor).

**Crear el primer admin**: agregar manualmente una fila en `Usuarios`:

```
tu-email@gmail.com | Tu Nombre | admin | TRUE | 2026-05-28T00:00:00Z
```

Sin esa fila, nadie puede iniciar sesión.

### 3. Preparar Google Drive

1. Crear una carpeta llamada `Gestión Morinigo` en Drive
2. Compartirla con el email de la Service Account (rol Editor)
3. Copiar el ID de la carpeta de la URL: `drive.google.com/drive/folders/{ESTE_ID}`

La app crea subcarpetas automáticamente: `Tareas/{Edificio}/{YYYY-MM}/{timestamp}_{objetivo}/`.

### 4. Variables de entorno

Copiar `.env.example` a `.env.local` y completar:

```env
GOOGLE_SHEET_ID=...                  # de la URL de la spreadsheet
GOOGLE_SERVICE_ACCOUNT_EMAIL=...     # del JSON descargado, campo client_email
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_DRIVE_ROOT_FOLDER_ID=...      # ID de "Gestión Morinigo" en Drive

NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=...                  # generar con: openssl rand -base64 32

GOOGLE_CLIENT_ID=...                 # OAuth client ID
GOOGLE_CLIENT_SECRET=...
```

> ⚠ `GOOGLE_PRIVATE_KEY` debe contener los `\n` literales (no saltos de línea reales). Si lo pegás del JSON, las comillas y los `\n` ya vienen correctos.

### 5. Correr en dev

```bash
npm run dev
```

Abrir http://localhost:3000 → redirige a `/tareas`. Sin sesión, redirige a `/login`.

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
    tareas/            # GET (list), POST (create)
    tareas/[id]/       # GET, PUT, PATCH (cambio de estado)
    edificios/
    dptos/
    usuarios/          # solo admin
    configuracion/     # GET público, PUT solo admin
    upload/            # POST imagen/video → Drive
components/
  layout/AppShell.tsx  # bottom nav mobile / sidebar desktop
  providers/           # SessionProvider + QueryProvider
lib/
  google-auth.ts       # JWT del Service Account
  google-sheets.ts     # cliente de la Sheet (CRUD por hoja)
  google-drive.ts      # upload + ensureFolder + permisos públicos
  auth.ts              # NextAuth v5 + role check contra hoja Usuarios
  schemas.ts           # validación Zod
  api-utils.ts         # helpers de error en routes
  utils.ts             # cn() + formateadores de fecha
types/
  index.ts             # Tarea, Edificio, Dpto, Usuario, Configuracion
  next-auth.d.ts       # extiende Session con rol/activo
middleware.ts          # redirección a /login si no hay sesión
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
✅ Dashboard con KPIs, charts (recharts), tabla analítica con sort, export CSV, sección visitas (admin)
✅ API /api/respuestas (admin) para hoja "Respuestas de Trabajadores"
✅ Hook useOnlineStatus + badge en header con contador de pendientes
✅ syncPendingTareas con retries (máx 3) — se dispara al cargar la app, al volver online, y cada 5 min
✅ Fallback offline en TareaForm: encola tareas en IndexedDB cuando no hay red + cache local de edificios/dptos/config
✅ Adjuntar PDFs externos (facturas, presupuestos, planos) a una tarea — columna `documentos` en Sheet
✅ Generación de PDF de reporte por tarea con `@react-pdf/renderer` — incluye datos, informe, comentarios, thumbnails de imágenes
✅ Auto-generación del reporte al cerrar tarea (estado=Realizado dispara fire-and-forget)
✅ Botón "Generar/Descargar reporte" en detalle con regeneración manual
✅ Demo bypass en pdf-generator — no toca Drive real en DEMO_MODE
✅ Suite de tests con Vitest + RTL: schemas, mapping Sheets, demo data, API endpoints, componentes (33 tests)
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

🔲 Smoke test en producción con Docker (manual — ver `docs/DEPLOY.md`)
🔲 Configurar Cloudflare Tunnel con dominio (manual)
🔲 Tag v1.0.0 + push para disparar build de imagen en GHCR (manual)

Ver `PROMPT_CLAUDE_CODE.md` (origen) para la spec funcional completa y `docs/DEPLOY.md` para el deploy.

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
