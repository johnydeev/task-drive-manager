# Task Drive Manager

**Sistema web (PWA) para administrar el mantenimiento de consorcios**: crear tareas por edificio, asignarlas a un responsable, documentar el trabajo con fotos/videos desde el celular —**incluso sin internet**— y generar un informe PDF automático para rendir a los propietarios. Los datos viven en la propia **Google Sheet + Google Drive** del cliente.

> ▶️ **Demo en vivo (sin login ni credenciales):** **https://task-drive-manager.vercel.app**
> Corre en modo demo con datos de ejemplo; podés navegar todo sin configurar nada.

> El nombre visible de la app es configurable (`NEXT_PUBLIC_APP_NAME`); por defecto es **Task Drive Manager**.

---

## ¿Qué es?

Una aplicación **mobile-first, instalable** (Progressive Web App) que reemplaza el seguimiento informal del mantenimiento —planillas sueltas, WhatsApp y papel— por un flujo ordenado y auditable. Está pensada para el trabajo **en la calle**: el encargado abre la tarea en el edificio, carga las fotos del trabajo y todo queda registrado, aunque en el subsuelo no haya señal.

La particularidad técnica: **no usa una base de datos tradicional**. La fuente de verdad es una **Google Sheet existente** (la que la administradora ya usaba) y los archivos se guardan en su **Google Drive**. Los datos son y siguen siendo del cliente.

## ¿Para quién es?

- **Administradoras de consorcios** (edificios de departamentos) que coordinan tareas de mantenimiento entre varios edificios, encargados y proveedores.
- Especialmente **empresas chicas / familiares** que hoy dependen de herramientas no-code (AppSheet y similares) o directamente de WhatsApp y papel.
- En general, **cualquier equipo que gestione tareas de campo con evidencia fotográfica** y necesite rendir cuentas a un tercero.

## ¿Qué problemas resuelve?

- **El desorden:** el seguimiento de tareas está desperdigado entre WhatsApp, papeles y la memoria de cada uno. Acá está todo centralizado, buscable y con estados claros.
- **La falta de evidencia:** cuando un propietario pregunta *"¿qué hicieron con mi plata?"*, no hay respaldo. La app documenta cada trabajo con fotos/videos y genera un **informe PDF automático** al cerrar la tarea.
- **El trabajo sin señal:** en un subsuelo o un edificio sin cobertura, las apps online te dejan a pie. Esta **funciona offline** y sincroniza sola al recuperar la conexión.
- **La dependencia de un tercero:** con herramientas no-code, los datos quedan "secuestrados" en la plataforma y se paga por usuario. Acá los datos viven en el **Google propio del cliente**.
- **La responsabilidad difusa:** roles (administrador / encargado) y un **ciclo de estados** definido para cada tarea, con permisos validados en el servidor.

## Ventajas frente a otras aplicaciones

| | Task Drive Manager | AppSheet / no-code | Trello / Asana (apps genéricas) | WhatsApp / papel |
|---|:---:|:---:|:---:|:---:|
| **Datos propios (tu Google, sin lock-in)** | ✅ | ❌ (quedan en la plataforma) | ❌ | — |
| **Funciona sin internet + sincroniza** | ✅ | Parcial | ❌ | ❌ |
| **A medida del rubro** (edificios, dptos, partes comunes, proveedores) | ✅ | Limitado | ❌ genérico | ❌ |
| **Evidencia con fotos/videos por tarea** | ✅ | Parcial | Adjuntos sueltos | Disperso |
| **Informe PDF automático para propietarios** | ✅ | ❌ | ❌ | ❌ |
| **Instalable como app (sin tienda) + auto-actualiza** | ✅ | Parcial | App de terceros | — |
| **Costo por usuario / suscripción atada** | ❌ (es propio) | ✅ (por asiento) | ✅ | — |
| **Ciclo de estados + roles** | ✅ | Manual | Genérico | ❌ |

En resumen: combina lo **a medida** de un desarrollo propio con la **simplicidad de datos** de una planilla, sin la dependencia ni el costo por usuario de las plataformas no-code.

## Funcionalidades principales

- 📋 **Gestión de tareas por edificio** con asignación a un responsable y **ciclo de estados**: `Sin asignar → Asignada → Aceptada → En Proceso → En Revisión → (Objetada) → Realizada`.
- 📸 **Evidencia multimedia** (imágenes con compresión en cliente, videos, PDFs) subida desde cámara o galería, organizada automáticamente en carpetas de Drive por `Edificio / Año / Mes / tarea`.
- 📄 **Informe PDF automático** al cerrar la tarea (`@react-pdf/renderer`), con datos, comentarios y miniaturas de las fotos.
- 📶 **Offline-first:** las tareas se encolan en IndexedDB sin conexión y se sincronizan solas al volver online (con reintentos + Background Sync).
- 👥 **Roles y permisos** (administrador / supervisor-encargado) validados en el backend.
- 🏢 **Datos del rubro:** edificios (desde una hoja canónica de consorcios), departamentos, **partes comunes** (Hall, Terraza, etc.) y proveedores.
- 📊 **Dashboard** con KPIs, gráficos y exportación a CSV/Excel.
- 📱 **PWA instalable** (celular y desktop) con aviso de nueva versión y actualización en un toque.
- 🧪 **Modo demo** (`DEMO_MODE=1`) para probar todo con datos falsos, sin tocar Google.

## Capturas / Demo

La forma más rápida de verla es la **[demo en vivo](https://task-drive-manager.vercel.app)** (datos de ejemplo, sin login).

## Stack técnico

- **Next.js 16** (App Router) + **React 19** + **TypeScript** estricto
- **Tailwind CSS v4**
- **NextAuth v5** (Google OAuth) con validación de rol contra la hoja `Usuarios`
- **TanStack Query v5** para data fetching
- **Dexie.js** (IndexedDB) + **Service Worker** (serwist) → modo offline + PWA
- **googleapis** (Sheets + Drive vía Service Account)
- **Zod** para validación (cliente y servidor)
- **Vitest + Testing Library** → **386 tests** (desarrollo guiado por TDD)
- **Docker** (multi-stage, output standalone) + **Cloudflare Tunnel** + **CI/CD** en GitHub Actions

## Cómo está construido (destacados de arquitectura)

- **Google Sheets como fuente de verdad**, con una capa de acceso por *header* (tolera hojas sin encabezado / filas vacías) y caches SWR para las hojas externas de solo lectura.
- **Offline real:** cola de sincronización en IndexedDB + Service Worker con estrategias por endpoint (NetworkFirst para datos, CacheFirst para thumbnails) + Background Sync que vacía la cola aunque la app esté cerrada.
- **Subidas directo a Drive:** el archivo se transmite del cliente al servidor y de ahí a Drive. Esto **supera el límite de body de los serverless** (por eso producción es self-hosted), con validación de tipo/peso y mensajes claros de error.
- **Máquina de estados con permisos en el servidor** y cierre automático a 72 h derivado *on-read* (nunca se persiste un estado inconsistente).
- **Deploy de producción self-hosted** (Docker + Cloudflare Tunnel, sin abrir puertos) con **CI/CD de 3 fases** (Test → Build → Deploy) y una imagen versionada en GHCR.
- **Marca configurable por entorno** (`NEXT_PUBLIC_APP_NAME`) para reutilizar el mismo código con distintos clientes sin tocar el fuente.

## Proceso de desarrollo

Construido con un flujo **spec-driven + TDD, asistido por IA**: cada feature arranca con una *spec* y un *plan* (ver [`docs/superpowers/`](docs/superpowers/)), se implementa con tests primero, y se mantiene el árbol verde (`tests + tsc + lint + build`) en cada checkpoint. El historial de specs/plans documenta las decisiones de diseño y su evolución.

---

## Probar sin credenciales (modo demo)

Para verla funcionando sin configurar Google, corré en **modo demo** (datos falsos, sin tocar Sheets/Drive ni login):

```bash
npm install
DEMO_MODE=1 npm run dev   # http://localhost:4000
```

En demo, cualquier "login" entra como admin y las pantallas se pueblan con datos de ejemplo (`lib/demo-data.ts`).

## Scripts

```bash
npm run dev    # servidor de desarrollo en http://localhost:4000
npm run build  # build de producción (webpack)
npm start      # servir el build (puerto 4000)
npm run lint   # ESLint
npm test       # suite de tests (Vitest)
npm run seed   # llena hojas Usuarios y Configuracion (requiere .env.local)
npm run icons  # genera íconos PWA desde public/logo-source.png
```

## Setup completo (con Google real)

### 1. Configurar Google Cloud

1. Crear un proyecto en https://console.cloud.google.com
2. Habilitar las APIs: **Google Sheets API** y **Google Drive API**.
3. Crear una **Service Account** y generar una **key JSON**.
4. Crear credenciales **OAuth 2.0 Client ID** (login de usuarios):
   - Application type: Web application
   - Authorized redirect URI: `http://localhost:4000/api/auth/callback/google` (y el de producción)
   - Pantalla de consentimiento "Externo": agregar los emails como **Usuarios de prueba**

### 2. Preparar las Google Sheets

**Archivo principal** (`GOOGLE_SHEET_ID`) — tabs:

- `Tareas` — hoja donde escribe la app (mapping de columnas por header en `lib/sheets/`)
- `Dptos` — A=ID dpto, B=DPTO, C=Edificio ref (incluye un "edificio" virtual `Parte Común` con las partes comunes posibles)
- `Usuarios` — A=email, B=nombre, C=rol (admin/supervisor), D=activo, E=creado_en
- `Configuracion` — A=clave, B=valor. **⚠ El tab va SIN tilde** (`Configuracion`)

**Archivo de consorcios** (`GOOGLE_CONSORCIOS_SHEET_ID`, externo, solo lectura) — tabs:

- `_Consorcios` — A=NOMBRE CANÓNICO, B=CUIT, E=ACTIVO. Listado de edificios.
- `_Proveedores` — A=nombre del proveedor.

**Compartir** el archivo principal con el Service Account como **Editor**, y el de consorcios como **Lector**.

**Crear el primer admin** (o `npm run seed`): agregar una fila en `Usuarios`:

```
tu-email@gmail.com | Tu Nombre | admin | TRUE | 2026-06-19T00:00:00.000Z
```

Sin esa fila, nadie puede iniciar sesión.

### 3. Preparar Google Drive

1. Crear una **Unidad Compartida** (Drive → Unidades compartidas → Nueva).
2. Agregar el email del Service Account como **Administrador de contenido**.
3. Copiar el ID de la URL: `drive.google.com/drive/folders/{ESTE_ID}`.

> Debe ser **Unidad Compartida**, no "Mi unidad": el Service Account no tiene cuota propia.

La app crea las carpetas automáticamente:
```
Tareas/{Edificio}/{Año}/{Mes}/{fecha · ubicación · objetivo}/
  Imagenes/    Videos/    Documentos/    Reporte/
```

### 4. Variables de entorno

Copiar `.env.example` a `.env.local` y completar:

```env
GOOGLE_SHEET_ID=...                  # archivo principal (Tareas/Dptos/Usuarios/Configuracion)
GOOGLE_CONSORCIOS_SHEET_ID=...       # archivo externo con el tab _Consorcios
GOOGLE_SERVICE_ACCOUNT_EMAIL=...     # del JSON, campo client_email
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_DRIVE_ROOT_FOLDER_ID=...      # ID de la Unidad Compartida

NEXTAUTH_URL=http://localhost:4000
NEXTAUTH_SECRET=...                  # generar con: openssl rand -base64 32

GOOGLE_CLIENT_ID=...                 # OAuth client ID
GOOGLE_CLIENT_SECRET=...

# Opcional — marca de la app (default: "Task Drive Manager").
# ⚠ NEXT_PUBLIC_* se hornea en el BUILD (ver Dockerfile / docs/DEPLOY.md).
# NEXT_PUBLIC_APP_NAME=
# NEXT_PUBLIC_APP_SHORT_NAME=
```

> ⚠ `GOOGLE_PRIVATE_KEY` debe contener los `\n` literales. Si lo pegás del JSON, ya vienen correctos.

### 5. Correr en dev

```bash
npm run dev   # http://localhost:4000
```

Abrir http://localhost:4000 → redirige a `/tareas`. Sin sesión, redirige a `/login`.

## Estructura del proyecto

```
app/
  (auth)/login/          # login (Google)
  (app)/                 # layout protegido (shell mobile/desktop)
    tareas/ dashboard/ usuarios/ configuracion/ edificios/
  api/                   # tareas, edificios, dptos, proveedores, usuarios,
                         # configuracion, upload, health, auth, reporte
components/
  layout/ providers/ tareas/ edificios/ pdf/ ui/
lib/
  google-auth.ts · sheets/ · google-drive.ts · pdf-generator.tsx
  auth.ts · demo-mode.ts · demo-data.ts · offline-db.ts · offline-sync.ts
  api-client.ts · schemas.ts · app-name.ts · utils.ts
types/                   # Tarea, Edificio, Dpto, Usuario, Configuracion, Directiva
proxy.ts                 # (Next 16, ex middleware) redirección a /login sin sesión
```

## Convenciones

- TypeScript estricto, sin `any`. Validación con Zod en cliente y en API routes.
- Errores de API: `{ error: string }` con status HTTP apropiado.
- Naming: PascalCase componentes, camelCase funciones, kebab-case archivos.
- El campo `Dpto`/ubicación es **obligatorio** siempre (un dpto, o una parte común específica).
- **Tests + estructura escalable:** ver [docs/CONTRIBUTING-tests.md](docs/CONTRIBUTING-tests.md).

## Actualización de la PWA

La app es una PWA con Service Worker (serwist). Cuando el CI/CD deploya una versión nueva, el usuario ve una **barra de actualización**: el SW nuevo se descarga en segundo plano y, al tocar **Actualizar**, toma control y recarga con la versión fresca. En desarrollo el SW está deshabilitado.

## Deploy

- **Producción (cliente):** self-hosted con **Docker + Cloudflare Tunnel** (sin abrir puertos), imagen en GHCR, deploy automático vía **CI/CD** (`ci-cd.yml`). Ver [docs/DEPLOY.md](docs/DEPLOY.md).
- **Demo pública:** desplegada en **Vercel** con `DEMO_MODE=1` → [task-drive-manager.vercel.app](https://task-drive-manager.vercel.app).

## Seguridad / acceso a los datos

Quién puede ver qué (listado vs. archivos multimedia) y por qué los archivos de Drive son públicos por link: ver [docs/SECURITY-acceso-drive.md](docs/SECURITY-acceso-drive.md).
