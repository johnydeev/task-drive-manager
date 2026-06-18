# Execution State — Deploy Docker + CI/CD Plan

> **Para retomar después de un reset de cuota:** este archivo es el tracker live. Buscá la primera task con `[ ]` y arrancá desde ahí. La task `[~]` indica que estaba en curso cuando se cortó (revisar el branch para ver si el commit ya se hizo).

**Spec:** [`specs/2026-06-16-deploy-docker-cicd.md`](../specs/2026-06-16-deploy-docker-cicd.md)
**Plan:** [`plans/2026-06-16-deploy-docker-cicd.md`](2026-06-16-deploy-docker-cicd.md)
**Branch:** `feat/deploy-docker-cicd`
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
| 17 | Smoke test integral local | [ ] | Manual — requiere acción del usuario |
| 18 | Configurar Cloudflare Tunnel | [ ] | Manual — requiere acción del usuario |
| 19 | Tag v1.0.0 + push | [ ] | Manual — requiere acción del usuario |
| 20 | Cleanup + docs | [x] | `9d4b1ae` |

**Leyenda:**
- `[ ]` Pendiente
- `[~]` En curso (interrumpido por cuota)
- `[x]` Completada

## Notas de ejecución

(Acá voy a anotar cualquier cosa relevante: desvíos del plan, decisiones tomadas en el camino, blockers, etc.)
