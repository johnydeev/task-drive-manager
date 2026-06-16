# SPEC — Deploy en Docker self-hosted + CI/CD + Hoja Tareas nueva + Integración `_Consorcios`

**Fecha:** 2026-06-16
**Estado:** Aprobado
**Autor:** equipo task-drive-manager
**Plan asociado:** [`docs/superpowers/plans/2026-06-16-deploy-docker-cicd.md`](../plans/2026-06-16-deploy-docker-cicd.md)
**Anexo:** Sección 16 incluye el plan de migración futura de la hoja legacy `Ingreso de Pendiente`.

---

## 1. Contexto

El proyecto `task-drive-manager` está completo a nivel funcional (login, tareas, dashboard, gestión de usuarios, configuración, PDFs adjuntos, generación de reportes, modo offline, PWA). Hoy corre solo en local con `DEMO_MODE=1` contra datos hardcoded. El cliente —Administración Morinigo— todavía **no aprobó** el reemplazo de la app actual (AppSheet), pero quiere ver el sistema corriendo en producción para evaluar antes de aprobar la migración.

Paralelamente, el cliente ya opera una segunda aplicación, `ia-drive-doc-processor` (TypeScript/Next.js/Postgres/Docker), que es la **fuente de verdad de consorcios y proveedores**. Esa app gestiona facturas de proveedores con extracción IA y mantiene un Google Sheets externo (`_Consorcios`) que task-drive-manager debe consumir como única fuente de edificios.

Este spec define el deploy de task-drive-manager en **Docker self-hosted en la misma máquina** que ia-drive-doc-processor, expone la app vía Cloudflare Tunnel para HTTPS (requisito para PWA), automatiza el build+release con GitHub Actions, y crea la integración para leer `_Consorcios` desde un archivo Sheets externo.

**La hoja maestra legacy `Ingreso de Pendiente` (1134 tareas activas en uso) NO se toca.** Se crea una hoja nueva `Tareas` paralela donde la app nueva escribe desde cero. La migración de la legacy queda como Anexo A para activarla solo cuando el cliente apruebe el reemplazo.

## 2. Problema a resolver

| # | Problema | Hoy | Después de este cambio |
|---|---|---|---|
| P1 | task-drive-manager corre solo en localhost con datos demo | No hay producción | Container Docker en VPS local + Cloudflare Tunnel con HTTPS |
| P2 | No hay forma de probar la app con datos reales sin pisar la SOT actual del cliente | Riesgo de corromper 1134 tareas vivas | Hoja `Tareas` nueva en mismo archivo, app nueva escribe solo ahí |
| P3 | Los edificios viven duplicados entre apps con riesgo de divergencia | task-drive con su hoja `Edificios`, ia-drive con `_Consorcios` | task-drive consume `_Consorcios` como SOT única (read-only) |
| P4 | Deploy manual = fricción + errores humanos | No hay automatización | GitHub Actions: tests + build de imagen + push a GHCR |
| P5 | Service Worker (PWA) requiere HTTPS para registrarse | Sin HTTPS, no se puede instalar la app en el celular del supervisor | Cloudflare Tunnel provee HTTPS sobre dominio público |
| P6 | Si un consorcio se da de baja, no hay forma de evitar que aparezca en el dropdown de "Nueva tarea" | Lista hardcoded o leída sin filtros | Columna `ACTIVO` en `_Consorcios` filtra el dropdown |

## 3. Alcance

### Dentro de scope

- Crear hoja `Tareas` en el mismo archivo Spreadsheet que `Ingreso de Pendiente` (sin tocar la legacy)
- Crear hojas `Usuarios` y `Configuración` con seed inicial (ya creadas por el usuario, llenado pendiente)
- Refactorizar el cliente de Sheets para soportar **dos spreadsheets distintos** (app + master de consorcios)
- Crear endpoint que lee `_Consorcios` con cache SWR
- Filtrar consorcios inactivos (`ACTIVO=FALSE`) del dropdown pero mantener tolerancia con tareas legacy que referencian edificios desactivados
- Container Docker self-hosted con Next.js standalone
- `docker-compose.yml` con servicios `web` + `tunnel` (Cloudflare)
- Healthcheck `/api/health`
- Configuración de 2 Service Accounts separadas (una para task-drive, reusar la de ia-drive para `_Consorcios` con permisos de Lector)
- `.env.local.example` completo con todas las variables y comentarios
- GitHub Actions: workflow de CI (tests + tsc + build) en cada PR
- GitHub Actions: workflow de release (build de imagen + push a GHCR) en tags `v*`
- Documentación de deploy paso a paso (estilo ia-drive-doc-processor)
- Smoke test end-to-end contra Sheet real sin `DEMO_MODE`

### Fuera de scope

- Migración de las 1134 tareas legacy de `Ingreso de Pendiente` (queda en Anexo A para activación posterior)
- Migración de archivos de Drive de la carpeta vieja a la estructura nueva (idem, Anexo A)
- Pipeline de deploy continuo automático al server (CD strictly speaking) — el container se actualiza con `docker compose pull` manual disparado por vos cuando quieras
- Monitoreo / alerting (Sentry, etc.) — fuera de scope, se suma después si hace falta
- Tests E2E con Playwright — los tests unitarios + integración con Vitest cubren lo crítico
- Compose unificado de las dos apps (esta + ia-drive) — quedan separados
- Crear el dominio `task-drive-manager.com` — el usuario lo gestiona aparte
- Fusionar el archivo de Sheets con el de `_Consorcios` (decidido NO fusionar)

## 4. Decisiones arquitectónicas tomadas

Confirmadas en sesiones de discusión previas:

| # | Decisión | Valor |
|---|---|---|
| D1 | Puerto local | **4000** |
| D2 | Dominio | A definir (preferentemente `task-drive-manager.com` o subdominio) — se enchufa cuando esté listo |
| D3 | Registry de imagen | `ghcr.io/johnydeev/task-drive-manager:latest` (mismo patrón que ia-drive) |
| D4 | `docker-compose.yml` | **Separado** del de ia-drive (cada proyecto independiente) |
| D5 | `.env.local.example` | Sí, plantilla completa con todas las variables |
| D6 | Hojas Usuarios y Configuración | Ya creadas vacías por el usuario; el plan incluye seed inicial |
| D7 | Esquema de columnas K-P en `Tareas` | **Opción C** (formato moderno limpio: carpetaUrl + arrays JSON) |
| D8 | Spreadsheet de Tareas/Dptos/Usuarios/Configuración | **Mismo archivo** que `Ingreso de Pendiente` legacy |
| D9 | Edificios | Desde archivo externo `_Consorcios` (sheet maestro de ia-drive) |
| D10 | Edificio no listado en `_Consorcios` | **Bloquear** la creación de tarea (Opción A: lista cerrada) |
| D11 | Bajas de consorcios | Columna `ACTIVO` (boolean, checkbox) en `_Consorcios`, columna E |
| D12 | UI de nombres de edificio | Tal cual están en `_Consorcios` (mayúsculas) |
| D13 | Service Accounts | **2 SAs separadas**, mismo proyecto GCP |
| D14 | Fusión de hojas | **NO** — cada archivo Sheets mantiene su dominio |

## 5. Requisitos funcionales

### Integración con `_Consorcios` externa

- **FR-1** — La app DEBE leer la lista de edificios desde el tab `_Consorcios` del archivo Google Sheets identificado por `GOOGLE_MASTER_SHEET_ID`, distinto del archivo principal
- **FR-2** — La app DEBE consumir solo las columnas A (`NOMBRE CANÓNICO`) y B (`CUIT`) del tab `_Consorcios`
- **FR-3** — La app DEBE filtrar consorcios donde la columna E (`ACTIVO`) sea `FALSE` cuando se muestra el dropdown de "Nueva tarea"
- **FR-4** — Si la columna E no existe en `_Consorcios` (no creada todavía), la app DEBE tratar a todos los consorcios como activos
- **FR-5** — El endpoint `GET /api/edificios` DEBE responder en < 500ms con cache de 5 minutos
- **FR-6** — Si el archivo `_Consorcios` está inaccesible, el endpoint DEBE devolver el último cache disponible (stale-while-revalidate). Si no hay cache, devolver `503 Service Unavailable`
- **FR-7** — El selector de "Nueva tarea" DEBE ser un dropdown cerrado (lista fija desde `_Consorcios`); no permite escribir nombres libres
- **FR-8** — Si el supervisor intenta crear una tarea con un edificio que no está en `_Consorcios`, el formulario DEBE rechazar con error claro

### Hoja `Tareas` nueva

- **FR-9** — La app DEBE escribir en el tab `Tareas` (no en `Ingreso de Pendiente`) con el esquema de columnas definido en Sección 8.2
- **FR-10** — La app DEBE leer del tab `Tareas` cuando lista, filtra o consulta tareas
- **FR-11** — La hoja `Ingreso de Pendiente` NO DEBE ser tocada en ninguna operación de escritura
- **FR-12** — Las hojas `Dptos`, `Usuarios`, `Configuración` siguen en el mismo archivo Spreadsheet de tareas (sin cambio)
- **FR-13** — La hoja `Edificios` legacy en el mismo archivo queda deprecada (no se lee ni se escribe)

### Service Accounts y permisos

- **FR-14** — Existen 2 Service Accounts:
  - `task-drive-manager-app@<proyecto>.iam.gserviceaccount.com` con Editor en archivo de Tareas + Editor en carpeta de Drive de task-drive
  - SA existente de ia-drive-doc-processor con Lector en `_Consorcios` (acceso ya configurado por ia-drive)
- **FR-15** — task-drive-manager usa **una sola** instancia de SA (la propia) cuando habla con Google Sheets/Drive. La SA propia debe tener Lector en `_Consorcios` también — se suma a las dos SAs ya existentes
- **FR-16** — Las private keys de las SAs viven en `GOOGLE_PRIVATE_KEY` y `GOOGLE_MASTER_PRIVATE_KEY` (o reusan la misma si se decide compartir el archivo a la SA principal — ver Sección 11)

### Docker

- **FR-17** — La imagen Docker DEBE ser multi-stage: deps, prod-deps, builder, runner
- **FR-18** — El container DEBE correr Next.js en modo `output: "standalone"` para minimizar tamaño y dependencias
- **FR-19** — El container DEBE exponer puerto 3000 internamente; el host mapea a **4000**
- **FR-20** — El container DEBE tener healthcheck que llame a `/api/health` cada 30s
- **FR-21** — El compose DEBE incluir servicio `tunnel` con Cloudflared para exponer la app vía HTTPS
- **FR-22** — Los recursos DEBEN tener límites: memoria max 1GB, CPU max 1.0

### CI/CD

- **FR-23** — GitHub Actions DEBE correr en cada PR a `main`: lint + typecheck + tests + build
- **FR-24** — GitHub Actions DEBE correr en cada push a `main` o tag `v*`: build de imagen Docker + push a GHCR
- **FR-25** — Las credenciales y secrets para CI viven en GitHub Secrets (no en el repo)
- **FR-26** — Las imagenes DEBEN taggearse con el SHA del commit (`sha-<short>`) y con `latest` si es push a `main`

### Variables de entorno y configuración

- **FR-27** — Debe existir `.env.local.example` con todas las variables necesarias, comentadas con su propósito y dónde obtener el valor
- **FR-28** — El servidor DEBE fallar con error claro al arrancar si falta alguna variable de entorno crítica
- **FR-29** — `DEMO_MODE=1` DEBE seguir funcionando como hasta hoy. La app en Docker producción corre con `DEMO_MODE=` (vacío)

## 6. Requisitos no funcionales

- **NFR-1** — Tiempo de arranque del container < 30s (cold start)
- **NFR-2** — Tiempo de respuesta del endpoint `GET /api/edificios` < 500ms con cache; < 2s sin cache (primera llamada)
- **NFR-3** — La imagen Docker no debe exceder 500MB (Next.js standalone + node:20-alpine debería quedar en ~200MB)
- **NFR-4** — El container debe poder reiniciarse automáticamente ante crashes (`restart: unless-stopped`)
- **NFR-5** — Todo código nuevo DEBE estar cubierto por tests automáticos (mismo nivel TDD que feature anterior)
- **NFR-6** — `npx tsc --noEmit` DEBE pasar sin errores
- **NFR-7** — `npm test` DEBE pasar sin errores (suite completa de Vitest)
- **NFR-8** — `npm run build` DEBE compilar sin errores
- **NFR-9** — Los logs del container deben rotarse: max 50MB por archivo, 10 archivos
- **NFR-10** — La carpeta de Drive donde la app sube archivos no debe ser la misma carpeta que ia-drive-doc-processor escanea (evitar conflicto operativo)
- **NFR-11** — La imagen Docker debe correr como usuario no-root dentro del container (security)

## 7. Modelo de datos

### 7.1 Hoja `_Consorcios` (archivo externo, read-only)

| Col | Header | Tipo | Notas |
|---|---|---|---|
| A | NOMBRE CANÓNICO | string | Identificador único, se usa literal en `Tarea.edificio` |
| B | CUIT | string | Formato XX-XXXXXXXX-X. Puede haber placeholders (no validamos) |
| C | NOMBRES ALTERNATIVOS | string | Separados por ` \| `. No usado por task-drive |
| D | ALIAS | string | No usado por task-drive |
| E | ACTIVO | boolean | `TRUE`/`FALSE`. Si vacío o no existe, se asume `TRUE` |

### 7.2 Hoja `Tareas` (archivo principal de task-drive, esquema final)

Idéntico al esquema interno actual que el código ya implementa (Opción C). Reproducido acá para referencia:

| Col | Campo | Tipo | Notas |
|---|---|---|---|
| A | rowId | string ISO datetime | Auto-generado al crear |
| B | objetivo | string | Tipo de tarea |
| C | fechaInicio | date | ISO |
| D | fechaEstimada | date | ISO |
| E | edificio | string | Debe coincidir con `_Consorcios.A` |
| F | parteComun | boolean | TRUE/FALSE |
| G | dpto | string | Si parteComun=TRUE → "Parte Común" |
| H | informe | string | Descripción del trabajo |
| I | comentarioEnProceso | string | Se completa durante |
| J | comentarioRealizado | string | Se completa al finalizar |
| K | imagenes | string (JSON array) | Cache de URLs públicas de Drive |
| L | videos | string (JSON array) | Cache de URLs públicas |
| M | documentos | string (JSON array) | PDFs adjuntos (facturas, presupuestos) |
| N | reporteUrl | string | URL del PDF de reporte auto-generado |
| O-P | reservadas | — | — |
| Q | proveedor | string | |
| R | estado | enum | Pendiente / En Proceso / Realizado |
| S | presupuesto | number | |
| T | fechaRealizado | date | |
| U | prioridad | enum | Alta / Media / Baja |
| V | supervisor | string | email |

### 7.3 Hoja `Usuarios` (seed inicial requerido)

Ya creada vacía. Llenado:

| email | nombre | rol | activo | creado_en |
|---|---|---|---|---|
| contacto@morinigoadm.com | Administración Morinigo | admin | TRUE | 2026-06-16T00:00:00.000Z |
| castrojonathand@gmail.com | Jonathan Castro | admin | TRUE | 2026-06-16T00:00:00.000Z |

### 7.4 Hoja `Configuración` (seed inicial requerido)

Ya creada vacía. Llenado:

| clave | valor | descripcion |
|---|---|---|
| max_imagenes | 10 | Máximo de imágenes por tarea |
| max_videos | 3 | Máximo de videos por tarea |
| max_documentos | 5 | Máximo de PDFs adjuntos |
| max_size_imagen_mb | 10 | Peso máx por imagen (MB) |
| max_size_video_mb | 100 | Peso máx por video (MB) |
| max_size_pdf_mb | 20 | Peso máx por PDF (MB) |

## 8. Variables de entorno

Plantilla `.env.local.example`:

```env
# =====================================================
# Google APIs (Sheets + Drive)
# =====================================================

# ID del archivo Google Sheets que tiene Tareas, Dptos, Usuarios, Configuración
GOOGLE_SHEET_ID=

# ID del archivo Google Sheets externo con el tab _Consorcios (owned by ia-drive)
GOOGLE_MASTER_SHEET_ID=1AVJ7tKv0hVU0uZF-9JyAPX3EpdgO81nzmzE-1nS6sdY

# Email de la Service Account propia de task-drive-manager
# Formato: nombre@proyecto.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_EMAIL=

# Private key de la Service Account
# IMPORTANTE: respetar saltos \n literales. Envolver en comillas dobles.
# Ejemplo: "-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"
GOOGLE_PRIVATE_KEY=

# ID de la carpeta raíz en Drive donde la app guarda archivos
# Esta carpeta debe estar compartida con GOOGLE_SERVICE_ACCOUNT_EMAIL como Editor
GOOGLE_DRIVE_ROOT_FOLDER_ID=

# =====================================================
# NextAuth (autenticación)
# =====================================================

# URL pública de la app
# En dev: http://localhost:4000
# En prod (Docker + Cloudflare Tunnel): https://task-drive-manager.com (o tu subdominio)
NEXTAUTH_URL=http://localhost:4000

# String aleatorio >= 32 caracteres
# Generar con: openssl rand -base64 32
NEXTAUTH_SECRET=

# =====================================================
# Google OAuth (login de humanos)
# =====================================================
# Distinto a la Service Account. Se crean en GCP Console > Credentials.
# Authorized redirect URIs debe incluir:
#   {NEXTAUTH_URL}/api/auth/callback/google
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# =====================================================
# Cloudflare Tunnel (solo producción Docker)
# =====================================================
# Token del túnel. Crear en Cloudflare > Zero Trust > Networks > Tunnels.
CLOUDFLARE_TUNNEL_TOKEN=

# =====================================================
# Modo demo (opcional)
# =====================================================
# Si está = "1", bypasea Google APIs y usa datos hardcoded de lib/demo-data.ts
# En producción debe estar vacío o no definido.
# DEMO_MODE=1
```

## 9. Endpoints

### Nuevos / modificados

| Método | Path | Cambio | Implementa |
|---|---|---|---|
| GET | `/api/edificios` | Reescritura: lee de `GOOGLE_MASTER_SHEET_ID` tab `_Consorcios`, filtra `ACTIVO=TRUE`, cachea 5 min | FR-1 a FR-7 |
| GET | `/api/health` | **Nuevo**. Devuelve 200 + `{ status: "ok" }`. Usado por Docker healthcheck | FR-20 |

### Sin cambios funcionales

Todos los demás endpoints siguen como están. Sólo el cliente interno (`lib/google-sheets.ts`) cambia su lógica de mapping de tab name: usa `Tareas` en vez de `Ingreso de Pendiente`.

## 10. Modelo de Service Accounts (final)

Después de discusión, **una sola SA propia de task-drive-manager** con acceso a:

- **Editor** en archivo principal (Tareas, Dptos, Usuarios, Configuración)
- **Editor** en carpeta de Drive de task-drive (la que vos vas a crear)
- **Lector** en archivo de `_Consorcios` (ia-drive comparte ese archivo con la SA de task-drive)

La SA de ia-drive sigue como está; nadie la toca.

### Implementación

```env
# Una sola SA, una sola key
GOOGLE_SERVICE_ACCOUNT_EMAIL=task-drive-manager-app@<proyecto>.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
```

No hay `GOOGLE_MASTER_PRIVATE_KEY` separada: la SA propia tiene los 3 accesos arriba.

**Importante:** vos debés compartir manualmente `_Consorcios` con el email de la SA de task-drive como **Lector** desde la UI de Google Drive antes de que la app arranque. Sin ese paso, la app no podrá leer edificios.

## 11. Infraestructura

### 11.1 Containers

```
┌─────────────────────────────────────────────────────────┐
│  Tu PC (Docker Desktop)                                 │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ task-drive-manager (compose separado)            │   │
│  │                                                   │   │
│  │  ┌─────────────┐         ┌────────────────────┐  │   │
│  │  │ web         │         │ tunnel             │  │   │
│  │  │ Next.js     │◄────────┤ Cloudflared        │  │   │
│  │  │ standalone  │         │                    │  │   │
│  │  │ :3000 int   │         │                    │  │   │
│  │  │ :4000 host  │         │                    │  │   │
│  │  └──────┬──────┘         └──────────┬─────────┘  │   │
│  │         │                            │             │   │
│  └─────────┼────────────────────────────┼─────────────┘   │
│            │                            │                  │
│  ┌─────────┼────────────────────────────┼─────────────┐   │
│  │ ia-drive-doc-processor (compose existente)         │   │
│  │  (sin cambios)                                      │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
            │                            │
            ▼                            ▼
   ┌──────────────────┐         ┌────────────────────┐
   │ Google APIs      │         │ Internet (HTTPS)   │
   │ (Sheets, Drive)  │         │ task-drive-manager.│
   │                  │         │   com              │
   └──────────────────┘         └────────────────────┘
```

### 11.2 Dockerfile (resumen)

Multi-stage basado en `node:20-bookworm-slim` (consistente con ia-drive-doc-processor — Debian no Alpine, evita problemas con módulos nativos como `@napi-rs/canvas` y `sharp`):

- Stage 1 — `deps`: instala todas las dependencias
- Stage 2 — `builder`: corre `next build --webpack` con `output: standalone`
- Stage 3 — `runner`: solo standalone output + public + .env.local
- Usuario: `nextjs` (UID 1001), no root
- Puerto interno: 3000
- Healthcheck: `curl /api/health`

### 11.3 docker-compose.yml (resumen)

```yaml
name: task-drive-manager

services:
  web:
    image: ghcr.io/johnydeev/task-drive-manager:${IMAGE_TAG:-latest}
    restart: unless-stopped
    env_file: .env
    ports:
      - "4000:3000"
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 30s
    deploy:
      resources:
        limits:
          memory: 1024M
          cpus: "1.0"
        reservations:
          memory: 256M
          cpus: "0.25"
    logging:
      driver: "json-file"
      options:
        max-size: "50m"
        max-file: "10"

  tunnel:
    image: cloudflare/cloudflared:2025.2.0
    restart: unless-stopped
    command: tunnel --no-autoupdate run --url http://web:3000
    environment:
      TUNNEL_TOKEN: ${CLOUDFLARE_TUNNEL_TOKEN}
    depends_on:
      web:
        condition: service_healthy
```

## 12. CI/CD

### 12.1 Workflow `ci.yml` — corre en cada PR

```
on:
  pull_request: { branches: [main] }
  push: { branches: [main] }

Steps:
  1. checkout
  2. setup-node 20
  3. cache node_modules
  4. npm ci
  5. npm run lint
  6. npx tsc --noEmit
  7. npm test
  8. npm run build (smoke test, no deploy)
```

### 12.2 Workflow `release.yml` — corre en push a `main` o tag `v*`

```
on:
  push:
    branches: [main]
    tags: ['v*']

Steps:
  1. checkout
  2. login a GHCR (GITHUB_TOKEN)
  3. setup-buildx
  4. docker buildx build:
       - tag: ghcr.io/johnydeev/task-drive-manager:latest (si push a main)
       - tag: ghcr.io/johnydeev/task-drive-manager:${{ github.sha }}
       - tag: ghcr.io/johnydeev/task-drive-manager:${{ github.ref_name }} (si es tag)
  5. push
```

## 13. Criterios de aceptación

| # | Criterio | Validación |
|---|---|---|
| AC-1 | El endpoint `/api/edificios` retorna la lista de `_Consorcios` filtrada por activos | Test unitario + manual |
| AC-2 | Si la columna E no existe, todos son tratados como activos | Test unitario |
| AC-3 | Si `_Consorcios` está caído, se sirve el último cache | Test con mock |
| AC-4 | El selector de "Nueva tarea" muestra solo los nombres canónicos de `_Consorcios` | Manual |
| AC-5 | Crear una tarea desde la app escribe en el tab `Tareas`, no en `Ingreso de Pendiente` | Manual con Sheet abierto |
| AC-6 | El container Docker arranca y sirve `/api/health` con 200 | `docker compose up` + `curl :4000/api/health` |
| AC-7 | La imagen pesa < 500MB | `docker images` |
| AC-8 | El container corre como usuario `nextjs` (UID 1001) | `docker exec ... whoami` |
| AC-9 | GitHub Actions corre tests en cada PR y bloquea merge si fallan | Crear PR de prueba |
| AC-10 | GitHub Actions buildea y pushea la imagen en push a main | Ver Actions tab |
| AC-11 | La PWA se puede instalar en celular vía Cloudflare Tunnel HTTPS | Manual con celu |
| AC-12 | `npm test` exit 0 con suite completa | Local |
| AC-13 | `npx tsc --noEmit` exit 0 | Local |
| AC-14 | `npm run build` exit 0 | Local |
| AC-15 | `.env.local.example` cubre 100% de las variables que la app necesita | Diff vs `process.env.X` en el código |

## 14. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| La SA de task-drive no tiene acceso a `_Consorcios` al primer arranque | Alta (es paso manual) | Bloquea creación de tareas | Documentar bien en README; el endpoint devuelve error claro |
| El archivo `_Consorcios` se renombra o el tab cambia de nombre | Baja | Bloquea creación de tareas | Caer al cache; alerta en log |
| Cloudflare Tunnel queda caído | Baja | App inaccesible desde internet (LAN sí funciona) | Restart automático del container; LAN como fallback |
| Cuota de Sheets API (60/min por SA) se alcanza | Muy baja | 429 al usuario | Cache 5 min + retry exponencial |
| Cuando el usuario hace bypass `DEMO_MODE=1` en producción por error | Media | Datos demo se exponen como reales | Banner amarillo visible + chequeo en README de prod |
| Build de Docker tarda demasiado (webpack en lugar de turbopack por serwist) | Baja | CI más lento (~3-4 min) | Aceptable; cache de capas Docker reduce a ~1 min en re-builds |
| El container Docker no encuentra `next/standalone` correcto al copiar | Media (es típico al armar Dockerfile) | Build falla | Tests del Dockerfile en CI; documentación detallada |
| Migración futura legacy (1134 tareas) falla y corrompe datos | N/A — fuera de scope | N/A | Documentado en Anexo A para ejecutar con cuidado cuando se apruebe |

## 15. Definición de "hecho"

Esta feature está completa cuando:

1. Los 15 criterios de aceptación (AC-1 a AC-15) están verdes
2. El plan asociado tiene los ~28 tasks completados
3. `npm test`, `npx tsc --noEmit` y `npm run build` pasan localmente sin errores
4. La imagen Docker se buildea con `docker compose build` sin errores
5. El container arranca con `docker compose up -d` y se mantiene saludable por al menos 5 minutos
6. La app responde en `localhost:4000` y `https://<dominio>` después de configurar Cloudflare Tunnel
7. Un smoke test manual: crear 1 tarea de prueba con foto + PDF adjunto, ver que persiste en la hoja `Tareas`, marcar como Realizado, ver que se genera el reporte PDF en Drive
8. GitHub Actions corre en verde en un PR de prueba
9. GitHub Actions buildea y pushea la imagen en un tag de prueba
10. README actualizado con instrucciones de deploy paso a paso
11. CHANGELOG.md creado con la entrada de esta versión

## 16. Anexo A — Migración futura de la hoja legacy `Ingreso de Pendiente`

> **Estado: PENDIENTE DE APROBACIÓN DEL CLIENTE.** Este anexo documenta el plan a ejecutar cuando se decida migrar las 1134 tareas legacy + sus archivos de Drive a la nueva hoja `Tareas` y la estructura nueva de carpetas. NO se ejecuta como parte de este spec.

### A.1 Estado del legacy a migrar

- **1134 tareas** en `Ingreso de Pendiente`
- **Filas vacías intercaladas** en el medio (cantidad desconocida, hay que detectar y saltear)
- **Porcentaje aprox con archivos** a determinar antes de migrar (preguntar 1.1 - 1.4 del cuestionario original)
- **Estructura legacy de Drive**: una sola carpeta con archivos sueltos sin patrón, nombre clave para acceso rápido (no patrón por edificio/mes)

### A.2 Estrategia decidida

- **Copy + verify + delete** (no move): seguridad sobre velocidad
- **Dry-run obligatorio antes de cualquier escritura**
- **Backup XLSX de `Ingreso de Pendiente`** antes de iniciar
- **Bloqueo `MIGRATION_MODE=1`** que devuelve 503 en uploads durante la migración
- **Idempotente**: re-ejecutar no duplica trabajo

### A.3 Esquema híbrido al migrar

Cuando se ejecute la migración, se llenan dos sets de columnas en la hoja `Tareas`:

- Columnas K-N (formato nuevo): `imagenes`, `videos`, `documentos`, `reporteUrl` como JSON arrays
- **Adicionalmente** se llenan K-O en la **hoja `Ingreso de Pendiente`** según el formato legacy (5 imágenes individuales + 1 video) para mantener compatibilidad visual con quien siga abriendo esa hoja

Esto va a requerir una transformación: las URLs legacy individuales en `Ingreso de Pendiente!K-P` se consolidan en JSON arrays en `Tareas!K-N` y se reorganizan los archivos en Drive a la estructura nueva `/Tareas/{Edificio}/{YYYY-MM}/{ts}_{objetivo}/`.

### A.4 Preguntas pendientes para reactivar el plan de migración

Cuando se apruebe, retomar la sesión de preguntas pendientes:

1. ID exacto de la carpeta vieja en Drive (todavía sin compartir con la SA)
2. Formato exacto de URLs en columnas K-P de `Ingreso de Pendiente`
3. Existencia de archivos huérfanos en la carpeta vieja
4. Confirmación de que archivos pueden ser referenciados desde múltiples tareas
5. Estrategia con archivos legacy con URLs rotas
6. Decisión sobre tareas legacy con `edificio` que no existe en `_Consorcios`
7. Casos borde con `objetivo` vacío o caracteres raros
8. Pausar uploads desde la app durante la migración
9. Verificación post-migración (hash MD5 + conteo)
10. Quién dispara la migración (CLI propuesto)

### A.5 Estimación de migración (cuando se ejecute)

- Inventario y dry-run: 2-3 horas
- Implementación del script con tests: 1-2 días
- Ejecución real + verificación: 4-8 horas (depende del volumen de archivos)
- Buffer para imprevistos: 1 día

**No se inicia hasta tener aprobación explícita del cliente.**

---

## 17. Notas para implementadores

- Seguir el patrón de TDD usado en el plan anterior (test failing → minimal implementation → verify pass → commit)
- Los tests para el cliente Sheets multi-spreadsheet usan mocks de `googleapis` (no requieren credenciales reales en CI)
- El Dockerfile debe construirse con `--webpack` (no turbopack) porque serwist no soporta turbopack todavía
- El healthcheck `/api/health` debe ser ligero: no consultar Sheets, no requerir auth
- La columna `ACTIVO` en `_Consorcios` puede estar ausente en algunos consorcios al inicio: tratarlos como activos por default
- Para los tests de endpoints, usar `@vitest-environment node` (jsdom se cuelga con FormData/Request)
- El cache del cliente Sheets debe ser por spreadsheet ID (no global) para soportar las 2 spreadsheets distintos
