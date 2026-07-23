# SPEC — Asignación y ciclo de ejecución de Tareas

**Fecha:** 2026-07-23
**Estado:** Borrador (rev. 1)
**Autor:** equipo task-drive-manager
**Plan asociado:** _(pendiente — se crea con writing-plans tras aprobar este spec)_

---

## 1. Contexto

Hoy una `Tarea` tiene un único actor humano relevante: el campo **`supervisor`**, que guarda el email de **quien la creó** (`session.user.email`, ver `app/api/tareas/route.ts`). Ese campo cumple doble función: define **quién puede editar/borrar** (admin o creador) y sirve como filtro opcional. El `estado` se mueve libremente entre `Pendiente | En Proceso | Realizado` y **cualquiera con permiso puede editarlo**.

No existe hoy la figura de un **responsable de ejecución** distinto del creador, ni un flujo controlado de quién puede mover cada estado. La app ya tiene un patrón probado de ciclo de vida con transiciones validadas server-side y cierre derivado a 72 h: las **Directivas** (`lib/directivas-estado.ts`, `PATCH /api/directivas`). Esta feature reusa ese patrón para las Tareas.

## 2. Problema a resolver

Se necesita separar **quién crea** una tarea de **quién es responsable de ejecutarla**, y controlar el flujo de ejecución por rol:

| # | Problema | Hoy |
|---|---|---|
| P1 | El creador y el ejecutor son el mismo campo | Solo existe `supervisor` (= creador). No se puede decir "la creó X pero la ejecuta Y". |
| P2 | El estado lo mueve cualquiera, sin flujo | No hay transiciones validadas ni control de quién puede pasar a qué estado. |
| P3 | Sin control de cierre | No hay un paso de revisión ni un cierre a cargo del admin; tampoco un plazo. |

## 3. Objetivo y no-objetivos

**Objetivo:** que cada tarea tenga un **responsable de ejecución** asignado por el admin (distinto del creador), y un **ciclo de vida** con transiciones validadas por rol, cierre a cargo del admin y **cierre automático a las 72 h** de mandada a revisión.

**No-objetivos:**
- **No** se tocan las Directivas ni las Asignaciones edificio↔usuario (entidades separadas).
- **No** hay notificaciones push/email (al asignar o al vencer las 72 h).
- **No** hay cartel/alarma global "quedan X sin asignar" (sí un filtro — §9).
- **No** hay historial/log de transiciones más allá de los timestamps.
- **No** se cambia el `id` (rowId) ni el vínculo con Drive.

## 4. Decisiones de diseño

| # | Decisión | Razón |
|---|---|---|
| D1 | Extender la entidad `Tarea` (columna `estado` ampliada + columnas nuevas), **no** crear una hoja/entidad de asignación aparte. | YAGNI: una hoja separada implicaría dos máquinas de estado a reconciliar. Todo en `Tareas` es más simple y alcanza. |
| D2 | El **asignado avanza forward-only** (Aceptar → En Proceso → En Revisión). Retroceder es potestad **solo del admin**. | El admin tiene control absoluto; el ejecutor no necesita rebotar estados. |
| D3 | **Reasignar resetea** el ciclo: la tarea vuelve a `Asignada` con el nuevo responsable (limpia `aceptada_en`/`revision_en`); el nuevo tiene que aceptar. | Un responsable nuevo no hereda la aceptación del anterior. |
| D4 | Cierre a 72 h **derivado on-read** (nunca persistido), replicando `lib/directivas-estado.ts`. Reloj desde `revision_en`. | Sin cron; patrón ya probado en la app. |
| D5 | Nombres de estado en **femenino** (`Asignada/Aceptada/Realizada`), concordando con "tarea" y con las Directivas. Migra los valores viejos `Pendiente/Realizado`. | Consistencia gramatical y con el resto de la app. |
| D6 | La **nota de cierre** del admin reutiliza la columna existente `comentario_realizado`. Solo se agrega **una** columna de comentario nueva (`comentario_revision`). | Evitar columnas redundantes. |

## 5. Máquina de estados

```
Sin asignar ──(admin asigna)──▶ Asignada ──(asignado acepta)──▶ Aceptada
                                   ▲   │                             │
              (admin reasigna: ────┘   │                    (asignado arranca)
               nuevo responsable,      │                             ▼
               vuelve a Asignada)      │                        En Proceso
                                       │                             │
                                       │                 (asignado manda a revisar)
                                       │                             ▼
                          72 h ┌───────────────────────────  En Revisión
                    (cierre auto│ derivado on-read)                  │
                                ▼                          (admin cierra a mano)
                            Realizada ◀───────────────────────────── ┘
```

**Enum de `estado`:** `Sin asignar | Asignada | Aceptada | En Proceso | En Revisión | Realizada`.

### Transiciones

| Transición | Quién | Origen → Destino | Efectos |
|---|---|---|---|
| Crear | cualquiera | — → **Sin asignar** | `asignado_a` vacío |
| Asignar | **admin** | Sin asignar → **Asignada** | set `asignado_a`, `asignada_en` |
| Reasignar (D3) | **admin** | Asignada → **Asignada** | nuevo `asignado_a`, `asignada_en`; limpia `aceptada_en`/`revision_en` |
| Aceptar | **asignado** | Asignada → **Aceptada** | set `aceptada_en` |
| Empezar | **asignado** | Aceptada → **En Proceso** | — |
| Mandar a revisión | **asignado** | En Proceso → **En Revisión** | set `revision_en`, `comentario_revision` (arranca reloj 72 h) |
| Cerrar | **admin** | En Revisión → **Realizada** | set `realizada_en`, nota de cierre (`comentario_realizado`) |
| Cierre automático (D4) | sistema (derivado) | En Revisión + 72 h → **Realizada** | no persiste; `realizada_en` derivado = `revision_en` + 72 h |
| Override | **admin** | cualquiera → cualquiera | control absoluto (incl. retroceder) |

## 6. Modelo de datos — columnas nuevas en `Tareas`

Se agregan **6 columnas** (la app las lee por nombre de header, así que su **posición es libre**; ver §12). Snake_case, femenino donde aplica.

| Columna | Tipo | Notas |
|---|---|---|
| `asignado_a` | email (FK → `Usuarios.email`) | Responsable de ejecución. Vacío = Sin asignar. |
| `asignada_en` | ISO datetime | Cuándo asignó el admin. |
| `aceptada_en` | ISO datetime | Cuándo aceptó el asignado. |
| `revision_en` | ISO datetime | **Load-bearing:** arranca el reloj de 72 h. |
| `realizada_en` | ISO datetime | Cierre a mano. Distinto de `fecha_realizado` (fecha de negocio, ya existe). |
| `comentario_revision` | texto | Lo escribe el asignado al mandar a revisar. |

- **Campos TS (camelCase):** `asignadoA`, `asignadaEn`, `aceptadaEn`, `revisionEn`, `realizadaEn`, `comentarioRevision`.
- **`supervisor` no cambia:** sigue siendo el creador (para permisos históricos y filtro).
- **Enum (Zod):** `estadoEnum` en `lib/schemas.ts` pasa a los 6 valores nuevos. Se valida en lectura y escritura (defensa en profundidad, como hoy con `estadoEnum.parse`).

## 7. Permisos (server-side)

| Acción | admin | asignado | creador (no-admin) | otro |
|---|---|---|---|---|
| Crear tarea | ✅ | ✅ | ✅ | ✅ |
| Asignar / reasignar | ✅ | ❌ | ❌ | ❌ |
| Aceptar · Empezar · Mandar a revisión | ✅* | ✅ (solo si es el asignado) | ❌ | ❌ |
| Cerrar (Realizada) | ✅ | ❌ | ❌ | ❌ |
| Editar cualquier campo (prioridad, fechas, objetivo, edificio…) | ✅ | ❌ | ❌ | ❌ |
| Escribir `comentario_en_proceso` / `comentario_revision` | ✅ | ✅ (en su estado) | ❌ | ❌ |
| Borrar tarea | ✅ | ❌ | ❌ | ❌ |

\* El admin puede forzar cualquier transición (D2/override).

**Regla base:** los **no-admin no editan campos nunca**. El creador, una vez creada, no la vuelve a tocar. El asignado solo mueve `estado` (sus transiciones) + comentarios. Toda transición valida en el server el **estado de origen** y la **identidad/rol** (patrón `PATCH /api/directivas`); violaciones → HTTP 403.

## 8. Comportamiento de las 72 h (cierre derivado)

Nuevo módulo `lib/tareas-estado.ts` (espejo de `lib/directivas-estado.ts`):

- Función pura `estadoEfectivo(tarea, now)`: si `estado === "En Revisión"` y `now − revision_en > 72 h` → devuelve `"Realizada"`; si no, el estado persistido.
- `getTareas`/`getTareaByRowId` aplican `estadoEfectivo` al mapear (igual que las Directivas derivan `Cerrada`). **Nunca se persiste** el cierre derivado.
- El cierre **a mano** del admin (antes de las 72 h) **sí** persiste `estado = "Realizada"` + `realizada_en`.
- Como el admin tiene override, puede reabrir una tarea aunque esté (derivada) Realizada: al persistir otro estado y limpiar `revision_en`, deja de derivar.

## 9. UI / impacto en componentes

- **Detalle de tarea (`TareaDetalle`):** badge de estado (6 estados con color), responsable (`asignado_a`) visible, y botones **según rol y estado**:
  - **admin:** dropdown *Asignar/Reasignar* (integrantes activos de `Usuarios`) + *Cerrar* (cuando En Revisión) + edición de todos los campos + borrar.
  - **asignado:** *Aceptar* / *Empezar* / *Enviar a revisión* según estado, + campo `comentario_revision`.
  - **resto:** solo lectura.
  - Todo botón que dispara acción async: **spinner (`Loader2 animate-spin`) + `disabled`** mientras `isPending` (regla global de UI).
- **En Revisión:** mostrar "cierre automático en X h" (derivado de `revision_en + 72 h`); vencido, se ve como Realizada.
- **Listado (`/tareas`):** filtro **"Mis tareas asignadas"** (`asignado_a` = yo) y filtro **"Sin asignar"** (para que el admin vea qué repartir).
- **Alta de tarea:** sin cambios (no se asigna al crear; la asignación es un paso posterior del admin).
- **Dashboard / PDF / badges:** actualizar las referencias a los estados viejos (`Pendiente`/`Realizado`) al enum nuevo.

## 10. Impacto en código

| Área | Cambio |
|---|---|
| Hoja `Tareas` | +6 columnas (§6), agregadas a mano por Jony (posición libre). |
| `lib/schemas.ts` | `estadoEnum` a los 6 valores; schema de asignación/transición (Zod). |
| `types/index.ts` | `Tarea` suma `asignadoA` + timestamps + `comentarioRevision`. |
| `lib/sheets/tareas.ts` | `rowToTarea`/`tareaToRow` mapean los campos nuevos; aplicar `estadoEfectivo` al leer. |
| `lib/tareas-estado.ts` | **NUEVO** — cierre derivado a 72 h (espejo de `directivas-estado.ts`). |
| `app/api/tareas/[id]/route.ts` | `PATCH` de transiciones con validación de origen + rol (asignar/aceptar/empezar/revisión/cerrar/editar). |
| `lib/api-client.ts` · `hooks/queries.ts` | métodos/hooks de asignación y transición. |
| `components/tareas/TareaDetalle.tsx` (+ hooks) | botones por rol/estado, responsable, comentario de revisión, contador 72 h. |
| `app/(app)/tareas/page.tsx` | filtros "Mis tareas asignadas" / "Sin asignar". |
| `components/dashboard/*`, `components/pdf/*` | actualizar referencias de estado. |
| Tests | colocados por módulo (transiciones, permisos por rol, cierre derivado, mapping de columnas nuevas). |

## 11. Migración de datos

- **21 tareas actuales** (data de prueba): `Pendiente → Sin asignar`, `Realizado → Realizada`, `En Proceso` queda igual; `asignado_a` vacío en todas. Trivial (script idempotente opcional o edición manual, a definir en el plan).
- Las **columnas nuevas** las crea Jony a mano en la Sheet (posición libre; headers exactos de §6).

## 12. Restricciones de la Sheet (heredadas de la reestructura)

- La lectura es **por nombre de header**: las 6 columnas nuevas van **donde Jony quiera**.
- **`id` debe quedar en la columna A** (el alta detecta la fila libre leyendo `Tareas!A:A`).
- Con 20 + 6 = **26 columnas**, se llega **exactamente a la Z**. El código lee `A:Z`; si en el futuro se supera la Z, hay que ampliar el rango (una línea).
- Headers exactos (tolerante a mayúsculas/acentos/espacios vs `_`): `asignado_a`, `asignada_en`, `aceptada_en`, `revision_en`, `realizada_en`, `comentario_revision`.

## 13. Criterios de aceptación

1. Cualquier usuario autenticado crea una tarea; nace **Sin asignar** con `asignado_a` vacío.
2. Solo el **admin** puede asignar/reasignar; un no-admin recibe 403.
3. Reasignar antes de aceptar cambia el responsable y deja la tarea en **Asignada** (limpia `aceptada_en`).
4. El **asignado** (y solo él) puede Aceptar → Empezar → Mandar a revisión, en ese orden; transiciones fuera de orden o de otro usuario → 403.
5. Al mandar a revisión se registra `revision_en` y el `comentario_revision`.
6. Solo el **admin** cierra (Realizada), registrando `realizada_en` y la nota de cierre.
7. Una tarea En Revisión con `revision_en` de hace **más de 72 h** se **muestra como Realizada** sin que el admin actúe, y sin persistir el cambio.
8. Los **no-admin no pueden editar** prioridad, fechas ni ningún otro campo (solo el asignado: estado + comentarios).
9. Solo el **admin** puede borrar.
10. El listado ofrece filtros "Mis tareas asignadas" y "Sin asignar".
11. Árbol verde: `npm test` + `npx tsc --noEmit` + `npm run lint` + `npm run build`.

## 14. Testing

- **Unitarios:** `estadoEfectivo` (72 h: justo antes / justo después / no-revisión); mapping `rowToTarea`/`tareaToRow` de las columnas nuevas; validación de transiciones (origen válido/ inválido) y de permisos por rol.
- **API:** cada transición con el rol correcto (OK) e incorrecto (403); reasignación resetea; cierre a mano persiste.
- **Componente (RTL):** botones correctos por rol/estado en `TareaDetalle`; contador de 72 h; filtros del listado.
- Mantener verde la suite existente (~254 tests).

## 15. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Cambiar el enum rompe referencias a `Pendiente`/`Realizado` en dashboard/PDF/filtros | Barrer todas las referencias (§10); tests de esas vistas. |
| Confundir cierre derivado con persistido | Espejo exacto de `directivas-estado.ts` (ya probado); tests del borde 72 h. |
| Un no-admin logra editar vía API directa | Validación server-side por rol/identidad en cada transición (no confiar en la UI). |
| Reasignar deja timestamps inconsistentes | La transición de reasignación limpia `aceptada_en`/`revision_en` explícitamente (D3), con test. |

## 16. Definición de hecho

- Las 6 columnas existen en la Sheet y el código las lee/escribe por header.
- El ciclo de vida completo funciona con permisos validados server-side.
- El cierre a 72 h se deriva on-read; el cierre a mano persiste.
- La UI muestra las acciones correctas por rol/estado, con spinners en las acciones async.
- Filtros "Mis tareas asignadas" / "Sin asignar" operativos.
- Suite verde (test + tsc + lint + build) y las 21 tareas migradas al enum nuevo.
