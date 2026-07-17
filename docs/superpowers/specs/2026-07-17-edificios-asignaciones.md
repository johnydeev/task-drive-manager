# SPEC — Vista "Edificios": asignaciones de edificios + Directivas (Pieza A)

**Fecha:** 2026-07-17
**Estado:** Borrador (rev. 2 — corregido el modelo de dos entidades)
**Autor:** equipo task-drive-manager
**Plan asociado:** [`docs/superpowers/plans/2026-07-17-edificios-asignaciones.md`](../plans/2026-07-17-edificios-asignaciones.md)
**Contexto de la iniciativa:** primera de dos piezas. **Pieza B** (fuera de este spec) cubre el ciclo de vida de la **Directiva**: aceptación por el integrante, nota de cierre, cierre tácito a las 72 h y objeción del admin.

---

## 1. Contexto y modelo conceptual

`task-drive-manager` está en producción (Docker self-hosted). Hay **dos conceptos distintos** que no hay que confundir:

- **Tarea** (ya existe): el trabajo a realizar **en un edificio**. Lo **ejecuta un proveedor** (el que factura al consorcio), **no** la administración; el supervisor la registra/gestiona (ya tiene su campo `proveedor`). La **crean los supervisores**. **No cambia en esta pieza.**
- **Directiva** (nuevo): una **indicación puntual del día** que el admin le da a un integrante (ej. "visitá el edificio X y creá las tareas pendientes", "Configuración para el set" + fecha). La **crea y asigna el admin** a un integrante (admin o supervisor); el integrante solo puede **aceptarla** (Pieza B). Puede **mencionar** un edificio en su texto, pero **no** es una Tarea ni está estructuralmente ligada a un edificio.

Además, hoy no hay registro de **qué edificios maneja cada integrante**. La imagen de referencia muestra una vista con cada persona y su lista de edificios (y sus directivas asignadas por el admin). Esta asignación de edificios es **solo organizativa/informativa**: no habilita ni restringe nada (un supervisor puede igual visitar o crear tareas en un edificio que no tiene asignado).

## 2. Problema a resolver

| # | Problema | Hoy | Después |
|---|---|---|---|
| P1 | El admin no puede asignar directivas/itinerario a un integrante | No existe el concepto | Entidad `Directiva` creada y asignada por el admin |
| P2 | No hay registro de qué edificios maneja cada integrante | Nada | Tab `Asignaciones` (email↔edificio) |
| P3 | No hay una vista por persona (edificios + directivas) | — | Item "Edificios" en el sidebar (admin: todos · supervisor: solo el suyo) |

## 3. Alcance

### Dentro de scope
- **Directivas:** tipo `Directiva`, tab `Directivas`, módulo `lib/sheets/directivas.ts` (CRUD); creación/asignación **admin-only**; visibilidad (no-admin ve solo las asignadas a él); endpoints `GET/POST/DELETE /api/directivas`.
- **Asignaciones de edificios:** tab `Asignaciones` (`email | edificio`), módulo `lib/sheets/asignaciones.ts` (CRUD); endpoints `GET/POST/DELETE /api/asignaciones`.
- **Vista "Edificios":** item en el sidebar; admin ve a todos los integrantes (tarjeta por persona) con sus edificios (agregar/quitar) y sus directivas (crear/asignar); supervisor ve solo su tarjeta en lectura.
- **Identificación por nombre:** mostrar el `nombre` del integrante (no el email) en toda la UI de esta feature.
- Tests (unitarios + componente + rutas).

### Fuera de scope (Pieza B)
- Aceptación de la **Directiva** por el integrante (confirmación).
- Nota de cierre / bitácora del integrante sobre la directiva.
- Cierre tácito automático a las 72 h ("Aceptada tácitamente").
- Objeción del admin dentro de las 72 h.
- Estados avanzados de la Directiva (en A solo nace "Asignada").

### Explícitamente NO se toca
- La **Tarea** del supervisor: su creación, edición, visibilidad y flujo quedan **igual que hoy**. No se le agrega `asignadoA` ni se restringe su creación.

## 4. Decisiones tomadas

| # | Decisión | Valor |
|---|---|---|
| N1 | Entidad nueva | **`Directiva`** (tab `Directivas`, tipo `Directiva`, ruta `/directivas` para la API) |
| N2 | Vínculo con edificio | La Directiva es **independiente** (se asigna a una persona, sin edificio) |
| N3 | Quién crea/asigna directivas | **Solo admin.** El integrante solo acepta (B) |
| N4 | Asignado posible | El admin asigna a **sí mismo o a un supervisor** |
| R2 | Asignación de edificios | **Solo informativa/organizativa.** No habilita ni restringe nada: un supervisor puede visitar o crear tareas en edificios que no tiene asignados |
| N5 | Naturaleza de la Directiva | Indicación puntual del día (admin→integrante). Puede mencionar un edificio en el texto, pero no es una Tarea. Las Tareas son trabajo de **proveedores**, no de la administración |
| D3 | Storage de asignaciones edificio | Tab `Asignaciones` (`email | edificio`), 1 fila por asignación |
| D5 | Visibilidad de directivas | No-admin ve solo las directivas con `asignadoA == su email` |
| D6 | Item sidebar | "Edificios", visible a todos (supervisor ve solo su tarjeta) |
| D7 | Identificación en UI | Se **guarda el email** (clave estable) pero se **muestra el `nombre`** (resuelto contra `Usuarios`); fallback al email |
| D8 | Tarea | **Sin cambios** en esta pieza |

## 5. Requisitos funcionales

**Directivas**
- **FR-1** — La Directiva tiene: `id` (timestamp ISO), `descripcion` (el objetivo, ej. "Configuración para el set"), `fecha` (a cumplir), `asignadoA` (email), `creadoPor` (email del admin), `creadoEn` (ISO), `estado` (en A siempre `"Asignada"`).
- **FR-2** — `POST /api/directivas` (admin-only) crea y asigna una Directiva. Valida que `asignadoA` sea un usuario activo (admin o supervisor).
- **FR-3** — `GET /api/directivas`: el admin recibe todas; un no-admin recibe solo las que tienen `asignadoA == su email`.
- **FR-4** — `DELETE /api/directivas` (admin-only) elimina una directiva por `id`.
- **FR-5** — El formulario de Directiva muestra un selector "Asignar a" con la lista de usuarios activos por **nombre** (valor = email); default: el propio admin.

**Asignaciones de edificios**
- **FR-6** — Existe el tab `Asignaciones` con columnas `email` (A) y `edificio` (B).
- **FR-7** — `GET /api/asignaciones`: admin recibe todas; un no-admin recibe solo las suyas.
- **FR-8** — `POST /api/asignaciones` (admin-only) agrega `{ email, edificio }`. Idempotente (no duplica un par existente).
- **FR-9** — `DELETE /api/asignaciones` (admin-only) elimina `{ email, edificio }`.
- **FR-10** — El `edificio` debe existir en `_Consorcios` activos (validado en el POST).

**Vista "Edificios"**
- **FR-11** — Item "Edificios" en el sidebar (desktop y bottom-nav mobile), visible a todos los roles.
- **FR-12** — Admin: la vista lista **todos** los usuarios (admin + supervisores) como tarjetas **tituladas con el nombre**; cada tarjeta muestra (a) sus edificios asignados con agregar (combobox desde `_Consorcios`) / quitar, y (b) sus directivas asignadas, con un botón "Asignar directiva".
- **FR-13** — Supervisor: la vista muestra **solo su propia tarjeta** (sus edificios y sus directivas) en modo lectura; no ve a otros integrantes.
- **FR-14** — En toda la UI de esta feature, los integrantes se identifican por **nombre** (fallback email).

**Tarea (sin cambios)**
- **FR-15** — La creación, edición y visibilidad de las Tareas de edificio (por supervisores) permanece **exactamente igual** que hoy.

## 6. Requisitos no funcionales

- **NFR-1** — Todo código nuevo con tests (mismo nivel que el resto del repo).
- **NFR-2** — `npm test`, `npx tsc --noEmit` y `npm run build` pasan sin errores.
- **NFR-3** — Sin regresiones: la suite actual sigue verde. En particular, ningún test de Tareas cambia.
- **NFR-4** — El comportamiento offline existente no se rompe (la vista Edificios requiere conexión; no necesita offline en A).
- **NFR-5** — Los permisos se validan **en el servidor**: los endpoints admin-only devuelven 403 a no-admins (no alcanza con ocultar UI).

## 7. Modelo de datos

### 7.1 Tab `Directivas` (nuevo)

| Col | Campo | Tipo | Notas |
|---|---|---|---|
| A | id | string ISO datetime | id estable, generado al crear |
| B | descripcion | string | la directiva/objetivo |
| C | fecha | date ISO | fecha a cumplir |
| D | asignadoA | string | email del asignado |
| E | creadoPor | string | email del admin creador |
| F | creadoEn | string ISO | timestamp de creación |
| G | estado | string | en A siempre `"Asignada"`. **Reservado para B** (Aceptada / Realizada / Aceptada tácitamente / Objetada) |

### 7.2 Tab `Asignaciones` (nuevo)

| Col | Campo | Tipo | Notas |
|---|---|---|---|
| A | email | string | email del usuario (lowercase) |
| B | edificio | string | nombre canónico, debe existir en `_Consorcios` |

### 7.3 Tipos
- `Directiva { id; descripcion; fecha; asignadoA; creadoPor; creadoEn; estado }`.
- `DirectivaNuevaInput { descripcion; fecha; asignadoA }`.
- `Asignacion { email; edificio }`.
- **`Tarea` no cambia.**

## 8. Endpoints

| Método | Path | Rol | Nota |
|---|---|---|---|
| GET | `/api/directivas` | todos | Admin: todas · no-admin: `asignadoA == su email` |
| POST | `/api/directivas` | **admin** | Crea + asigna; valida asignado activo |
| DELETE | `/api/directivas` | **admin** | Baja por `id` |
| GET | `/api/asignaciones` | todos | Admin: todas · no-admin: propias |
| POST | `/api/asignaciones` | **admin** | Alta idempotente; valida edificio en `_Consorcios` |
| DELETE | `/api/asignaciones` | **admin** | Baja de una asignación |

Se reutiliza `withAuth`. Para admin-only se agrega un guard de rol (`withAdmin` análogo, apoyado en `requireAdmin` de `lib/auth`).

## 9. UI

- **Sidebar** (`AppShell`): nuevo item `{ href: "/edificios", label: "Edificios", Icon: Building2 }`, sin `adminOnly`.
- **`/edificios`** (página + `EdificiosView`):
  - Admin: grilla de `IntegranteCard` (una por usuario), cada una con: nombre como título, lista de edificios (agregar via combobox / quitar), lista de directivas asignadas, y botón "Asignar directiva" → abre un formulario `DirectivaForm` con `asignadoA` precargado a ese integrante.
  - Supervisor: una sola card (la propia), lectura.
- **`DirectivaForm`**: descripción + fecha + selector "Asignar a" (por nombre). Admin-only.
- **Identificación**: helper para resolver email→nombre desde la lista de usuarios (fallback email).

## 10. Criterios de aceptación

| # | Criterio | Validación |
|---|---|---|
| AC-1 | `POST /api/directivas` con no-admin → 403; con admin crea y asigna | Test de ruta |
| AC-2 | `GET /api/directivas`: admin todas, no-admin solo las asignadas a él | Test de ruta |
| AC-3 | `DELETE /api/directivas` admin-only | Test de ruta |
| AC-4 | `Directivas` CRUD (alta, baja, listado) a nivel módulo | Tests unitarios (mock googleapis) |
| AC-5 | `Asignaciones` CRUD (alta idempotente, baja, validación de edificio) | Tests unitarios |
| AC-6 | `GET /api/asignaciones`: admin todas, supervisor propias; `POST/DELETE` admin-only (403) | Test de ruta |
| AC-7 | Vista Edificios: admin ve a todos con edificios + directivas; supervisor ve solo su card en lectura | Test de componente |
| AC-8 | La UI muestra **nombre** (no email); fallback a email | Test de componente |
| AC-9 | La Tarea del supervisor no cambió (suite de Tareas intacta) | Suite existente verde |
| AC-10 | Suite completa verde, `tsc` y `build` sin errores | Local |

## 11. Riesgos y mitigaciones

| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| Confundir Directiva con Tarea al implementar | Media | Retrabajo | Este spec separa explícitamente ambas (sección 1 y FR-15) |
| Ocultar UI sin proteger el endpoint | Media | Seguridad | NFR-5: guard admin-only server-side en cada endpoint |
| Naming "Edificios" para una vista que muestra también directivas | Baja | UX | Es el naming pedido por el cliente; se respeta |
| Un integrante inactivo/borrado queda asignado a directivas | Baja | Datos huérfanos | Validar `asignadoA` activo en el POST; mostrar fallback por email |

## 12. Definición de "hecho"

1. AC-1 a AC-10 verdes.
2. `npm test`, `npx tsc --noEmit`, `npm run build` sin errores.
3. El admin puede: asignar edificios a integrantes, crear/asignar directivas a sí mismo o a un supervisor, y ver todo.
4. El supervisor: ve solo su tarjeta (sus edificios y sus directivas) en lectura; no crea directivas.
5. La Tarea del supervisor funciona igual que antes (sin regresiones).

## 13. Nota para la Pieza B (no se implementa acá)

Sobre esta base, B agrega el ciclo de vida de la **Directiva**: **aceptación** por el integrante, **nota de cierre**, **cierre tácito a las 72 h** ("Aceptada tácitamente", probable cómputo on-read desde un timestamp, sin job de fondo) y **objeción** del admin dentro de las 72 h. El campo `estado` y la visibilidad de A son la base de ese flujo.
