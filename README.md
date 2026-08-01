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

## Ventajas

| | |
|:---:|---|
| ✅ | **Datos propios, sin lock-in** — la información vive en la Google Sheet + Google Drive del cliente; siempre suyos. |
| ✅ | **Funciona sin internet** — se sigue trabajando y cargando tareas sin señal, y sincroniza al volver online. |
| ✅ | **A medida del rubro** — modela edificios, departamentos, partes comunes y proveedores tal como los maneja una administradora. |
| ✅ | **Evidencia por tarea** — fotos, videos y PDFs de cada trabajo, organizados automáticamente en Drive. |
| ✅ | **Informe PDF automático** — al cerrar la tarea se genera un reporte listo para rendir a los propietarios. |
| ✅ | **Instalable y siempre actualizada** — como app (sin tienda), en celular y computadora, con auto-actualización. |
| ✅ | **Ciclo de estados con roles** — flujo definido para cada tarea y permisos por rol validados en el servidor. |

Combina lo **a medida** de un desarrollo propio con la **simplicidad** de tener los datos en una planilla que el cliente ya conoce.

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

## Correr el proyecto

- **Solo probarlo:** la [demo en vivo](https://task-drive-manager.vercel.app) o el [modo demo](#probar-sin-credenciales-modo-demo) de arriba.
- **Con tu propio Google** (setup completo, scripts y variables de entorno): ver **[docs/SETUP.md](docs/SETUP.md)**.

## Actualización de la PWA

La app es una PWA con Service Worker (serwist). Cuando el CI/CD deploya una versión nueva, el usuario ve una **barra de actualización**: el SW nuevo se descarga en segundo plano y, al tocar **Actualizar**, toma control y recarga con la versión fresca. En desarrollo el SW está deshabilitado.

## Deploy

- **Producción (cliente):** self-hosted con **Docker + Cloudflare Tunnel** (sin abrir puertos), imagen en GHCR, deploy automático vía **CI/CD** (`ci-cd.yml`). Ver [docs/DEPLOY.md](docs/DEPLOY.md).
- **Demo pública:** desplegada en **Vercel** con `DEMO_MODE=1` → [task-drive-manager.vercel.app](https://task-drive-manager.vercel.app).

## Seguridad / acceso a los datos

Quién puede ver qué (listado vs. archivos multimedia) y por qué los archivos de Drive son públicos por link: ver [docs/SECURITY-acceso-drive.md](docs/SECURITY-acceso-drive.md).
