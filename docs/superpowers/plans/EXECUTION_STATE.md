# Execution State — Deploy Docker + CI/CD Plan

> **Para retomar después de un reset de cuota:** este archivo es el tracker live. Buscá la primera task con `[ ]` y arrancá desde ahí. La task `[~]` indica que estaba en curso cuando se cortó (revisar el branch para ver si el commit ya se hizo).

**Spec:** [`specs/2026-06-16-deploy-docker-cicd.md`](../specs/2026-06-16-deploy-docker-cicd.md)
**Plan:** [`plans/2026-06-16-deploy-docker-cicd.md`](2026-06-16-deploy-docker-cicd.md)
**Branch:** `main` (la `feat/deploy-docker-cicd` se mergeó vía PR #1 y se borró)
**Started:** 2026-06-16

## Progreso

| # | Task | Status | Commit SHA |
|---|---|---|---|
| 1 | `.env.local.example` actualizado | [x] | `1930f93` |
| 2 | Endpoint `/api/health` (TDD) | [x] | `086184d` |
| 3 | Cliente Sheets multi-spreadsheet (TDD) | [x] | `4f3ea46` |
| 4 | Lectura `_Consorcios` con cache SWR (TDD) | [x] | `d2ba66a` |
| 5 | Refactor `/api/edificios` (TDD) | [x] | `3c1ffd6` |
| 6 | Apuntar app a `Tareas` (TDD) | [x] | `aa00094` |
| 7 | Bloqueo edificio no canónico (TDD) | [x] | `e9789fe` |
| 8 | `next.config.ts` standalone | [x] | `97efa3e` |
| 9 | `.dockerignore` | [x] | `5b02c75` |
| 10 | Dockerfile multi-stage | [x] | `5d7ad76` |
| 11 | `docker-compose.yml` | [x] | `6cf9daa` |
| 12 | Script seed Sheets | [x] | `b085dab` |
| 13 | CI workflow | [x] | `d80cdfc` |
| 14 | Release workflow | [x] | `d701bef` |
| 15 | `docs/DEPLOY.md` + README | [x] | `cb37fa1` |
| 16 | `CHANGELOG.md` | [x] | `6075261` |
| 17 | Smoke test integral local | [x] | Verificado: tarea real creada + Docker healthy |
| 18 | Configurar Cloudflare Tunnel | [x] | Activo en `https://task.pdf-doc-processor.com` |
| 19 | Tag v1.0.0 + push | [ ] | Pendiente (opcional) — versionar release en GHCR |
| 20 | Cleanup + docs | [x] | `9d4b1ae` + docs actualizados post-deploy |

**Leyenda:**
- `[ ]` Pendiente
- `[~]` En curso (interrumpido por cuota)
- `[x]` Completada

## Notas de ejecución

### Deploy completado (2026-06-19)
La app está en producción en `https://task.pdf-doc-processor.com` (Docker self-hosted + Cloudflare Tunnel).

**Desvíos / aprendizajes respecto al plan original:**
- **Variable renombrada:** `GOOGLE_MASTER_SHEET_ID` → `GOOGLE_CONSORCIOS_SHEET_ID` (más descriptiva).
- **Shared Drives obligatorio:** el SA no tiene cuota propia → los archivos van a una Unidad
  Compartida ("Control de tareas"). Hubo que agregar `supportsAllDrives` al cliente de Drive.
- **Lectura de Tareas robusta:** la hoja arranca sin header → se reemplazó el `slice(1)` por
  `parseTareasRows` (detecta filas por rowId válido, tolera filas vacías).
- **Match de dptos:** los nombres difieren entre `_Consorcios` (canónico) y `Dptos` (legacy) →
  `edificioMatches` compara normalizando mayúsculas/acentos/espacios.
- **trustHost:** sin esto, NextAuth loopeaba (`ERR_TOO_MANY_REDIRECTS`) detrás del tunnel.
- **Build local imposible:** la PC no tiene RAM para buildear con los otros containers corriendo
  → se usa siempre la imagen del CI (`docker compose pull`).
- **Feature Visitas/Respuestas eliminada** (el cliente no la usa).
- **Dominio:** `task.pdf-doc-processor.com` (subdominio del dominio de boletas, gratis).

**Pendiente real:** solo el tag `v1.0.0` (opcional) y los íconos PWA reales.

### Anexo de migración (futuro)
La migración de las 1134 tareas legacy de `Ingreso de Pendiente` + archivos de Drive sigue
pendiente de aprobación del cliente. Ver Anexo A del spec del PDF/reportes y la conversación
de planificación. La hoja `Tareas` nueva ya está operativa en paralelo.
