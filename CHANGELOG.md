# Changelog

Todos los cambios notables a este proyecto se documentan en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/),
y este proyecto adhiere a [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-06-16

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
