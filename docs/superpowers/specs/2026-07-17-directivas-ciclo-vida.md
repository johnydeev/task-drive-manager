# SPEC — Ciclo de vida de la Directiva (Pieza B)

**Fecha:** 2026-07-17
**Estado:** Borrador (diseño aprobado en brainstorming)
**Autor:** equipo task-drive-manager
**Plan asociado:** [`docs/superpowers/plans/2026-07-17-directivas-ciclo-vida.md`](../plans/2026-07-17-directivas-ciclo-vida.md)
**Depende de:** Pieza A ([`2026-07-17-edificios-asignaciones.md`](2026-07-17-edificios-asignaciones.md)) — la entidad `Directiva`, sus endpoints y la vista Edificios ya existen.

---

## 1. Contexto

En la Pieza A, el admin puede crear y asignar **Directivas** a un integrante, que nacen en estado `Asignada`. Falta el **ciclo de vida**: que el operario la acepte, la ejecute y la cierre con una nota, y que el admin pueda objetar; con un **cierre automático** automático a las 72 h para no tener que aprobar manualmente cada directiva rutinaria.

## 2. Máquina de estados

```
Asignada ──(operario acepta)──► Aceptada ──(operario cierra c/nota)──► Realizada
                                   ▲                                      │
                                   └──────── objeción admin ──────────────┘
                                        (reabre → Aceptada + nota)
                                                                          │
                                                    [reloj 72 h desde realizadaEn]
                                                                          ▼
                                                              Cerrada
```

- **Aceptar** (`Asignada → Aceptada`): solo el operario asignado. Setea `aceptadaEn`.
- **Cerrar** (`Aceptada → Realizada`): solo el operario asignado. Setea `realizadaEn` + `notaCierre` (requerida). Arranca el reloj de 72 h.
- **Objetar** (`Realizada → Aceptada`, reabierta): solo admin, y solo mientras la directiva esté `Realizada` y dentro de las 72 h. Setea `objetadaEn` + `notaObjecion` (requerida). El operario la rehace y la vuelve a cerrar → nuevo `realizadaEn` → nuevo reloj de 72 h.
- **Cierre automático** (`Realizada → Cerrada`): automático por **cómputo on-read** — si la directiva está `Realizada` y pasaron **> 72 h** desde `realizadaEn`, se muestra/trata como `Cerrada` (terminal). Es **derivado**, no se escribe en la Sheet.

## 3. Decisiones tomadas

| # | Decisión | Valor |
|---|---|---|
| B1 | Trigger del cierre automático | **Desde `realizadaEn`** (cuando el operario deja la nota de cierre). **Si nunca se cierra, nunca hay cierre automático** — no se "acepta por tiempo" trabajo no hecho |
| B2 | Mecanismo de las 72 h | **Cómputo on-read** (sin cron ni job de fondo). `Cerrada` es un estado **derivado**, no persistido |
| B3 | Objeción del admin | **Reabre** la directiva a `Aceptada` con una nota (`notaObjecion`); el ciclo puede repetirse. Solo permitida sobre `Realizada` y dentro de las 72 h |
| B4 | Estados persistidos | La Sheet guarda solo `Asignada | Aceptada | Realizada`. `Cerrada` es derivado |
| B5 | Permisos | Aceptar/Cerrar: solo el `asignadoA`. Objetar: solo admin. Validado server-side |

## 4. Alcance

### Dentro de scope
- Ampliar la entidad `Directiva` con `aceptadaEn`, `realizadaEn`, `notaCierre`, `objetadaEn`, `notaObjecion` y ampliar el union `estado`.
- Función `updateDirectiva(id, patch)` en `lib/sheets/directivas.ts`.
- Cómputo on-read del estado efectivo (`Cerrada`) en `getDirectivas`.
- Endpoint `PATCH /api/directivas` con las acciones `aceptar` / `cerrar` / `objetar` y sus permisos.
- `api.directivas.patch(...)` en el cliente.
- UI en la tarjeta del integrante (vista Edificios):
  - Operario, sobre sus propias directivas: botón **Aceptar** (`Asignada`), **Cerrar con nota** (`Aceptada`); ver la `notaObjecion` si fue reabierta; badge de estado.
  - Admin: ver `notaCierre`; botón **Objetar** (con nota) sobre las `Realizada`; badges de estado.
- Tests (unitarios + ruta + componente).

### Fuera de scope
- Notificaciones (push/email) al aceptar/cerrar/objetar.
- Cron / job de fondo (se usa cómputo on-read — B2).
- Historial de múltiples objeciones (se guarda solo la última `notaObjecion`/`objetadaEn`).
- Cambios en la **Tarea** de edificio (sigue intacta).
- Persistir `Cerrada` en la Sheet (es derivado; se puede sumar después sin cambiar el contrato).

## 5. Requisitos funcionales

**Máquina de estados / endpoint**
- **FR-1** — `PATCH /api/directivas` acepta `{ id, accion, nota? }` con `accion ∈ { "aceptar", "cerrar", "objetar" }`.
- **FR-2** — `aceptar`: solo si el solicitante es el `asignadoA` y la directiva está `Asignada`. Setea `estado="Aceptada"`, `aceptadaEn=now`. Otro estado o usuario → error (403/409).
- **FR-3** — `cerrar`: solo si el solicitante es el `asignadoA` y la directiva está `Aceptada`. Requiere `nota` no vacía. Setea `estado="Realizada"`, `realizadaEn=now`, `notaCierre=nota`.
- **FR-4** — `objetar`: solo admin, solo si la directiva está `Realizada` y **no** venció el plazo (`now - realizadaEn ≤ 72 h`). Requiere `nota`. Setea `estado="Aceptada"`, `objetadaEn=now`, `notaObjecion=nota`.
- **FR-5** — `getDirectivas` devuelve el **estado efectivo**: si `estado="Realizada"` y `now - realizadaEn > 72 h`, devuelve `"Cerrada"`; en cualquier otro caso, el estado guardado.
- **FR-6** — Una directiva que **nunca** llega a `Realizada` **no** se cierra automáticamente (queda pendiente indefinidamente).

**Visibilidad (sin cambios respecto de A)**
- **FR-7** — Un no-admin solo ve/acciona las directivas con `asignadoA == su email`. El admin ve todas.

**UI**
- **FR-8** — En la tarjeta del integrante, cada directiva muestra un **badge de estado** (incluido `Cerrada` derivado) y su fecha.
- **FR-9** — El operario, sobre **sus** directivas: ve **Aceptar** si está `Asignada`; ve **Cerrar con nota** (textarea) si está `Aceptada`; si fue reabierta por objeción, ve la `notaObjecion`.
- **FR-10** — El admin, sobre las directivas `Realizada` (dentro de las 72 h): ve la `notaCierre` y un botón **Objetar** (con nota). No ve acciones de aceptar/cerrar (esas son del operario).
- **FR-11** — Una vez `Cerrada` (derivado), no hay más acciones disponibles (terminal).

## 6. Requisitos no funcionales

- **NFR-1** — Todo código nuevo con tests; suite existente sigue verde (incluida la de la Tarea y la de A).
- **NFR-2** — `npm test`, `npx tsc --noEmit`, `npm run build`, `npm run lint` sin errores.
- **NFR-3** — Permisos validados **server-side** en el PATCH (no alcanza con la UI).
- **NFR-4** — El cómputo on-read no debe requerir escrituras durante un GET (sin efectos colaterales al leer).

## 7. Modelo de datos

La pestaña `Directivas` **suma 5 columnas** (a las A–G de la Pieza A):

| Col | Campo | Tipo | Notas |
|---|---|---|---|
| H | aceptadaEn | ISO datetime | cuándo el operario aceptó |
| I | realizadaEn | ISO datetime | cuándo cerró con nota (arranca el reloj de 72 h) |
| J | notaCierre | string | bitácora de cierre del operario |
| K | objetadaEn | ISO datetime | última objeción del admin |
| L | notaObjecion | string | motivo de la última objeción |

`estado` (col G) guarda `Asignada | Aceptada | Realizada`. El valor `Cerrada` es **derivado** (nunca se escribe).

**Tipos:**
- `DirectivaEstado = "Asignada" | "Aceptada" | "Realizada" | "Cerrada"`.
- `Directiva` suma: `aceptadaEn?`, `realizadaEn?`, `notaCierre?`, `objetadaEn?`, `notaObjecion?`.
- `DirectivaPatchInput = { id: string; accion: "aceptar" | "cerrar" | "objetar"; nota?: string }`.

**Requisito manual previo (usuario):** agregar los headers `aceptadaEn | realizadaEn | notaCierre | objetadaEn | notaObjecion` en las columnas **H–L** de la pestaña `Directivas`.

## 8. Endpoints

| Método | Path | Rol | Nota |
|---|---|---|---|
| PATCH | `/api/directivas` | según acción | `aceptar`/`cerrar`: solo `asignadoA`; `objetar`: solo admin. Valida estado de origen y plazo |

`GET /api/directivas` no cambia su contrato, pero ahora devuelve el **estado efectivo** (con el cómputo de FR-5).

## 9. Cómputo on-read (detalle)

En `getDirectivas` (y en `getDirectivas(email)`), al mapear cada fila:
```
estadoEfectivo(d) =
  (d.estado === "Realizada" && d.realizadaEn && (now - d.realizadaEn) > 72h)
    ? "Cerrada"
    : d.estado
```
No hay escritura. La misma regla se usa en el PATCH `objetar` para rechazar objeciones fuera de plazo (si el estado efectivo ya es `Cerrada`, no se puede objetar).

## 10. Criterios de aceptación

| # | Criterio | Validación |
|---|---|---|
| AC-1 | `aceptar` mueve `Asignada→Aceptada` solo para el asignado | Test de ruta + data layer |
| AC-2 | `cerrar` mueve `Aceptada→Realizada` con nota; sin nota → 400 | Test de ruta |
| AC-3 | `objetar` (admin) reabre `Realizada→Aceptada` con nota | Test de ruta |
| AC-4 | `objetar` de un no-admin → 403 | Test de ruta (o vía guard) |
| AC-5 | `objetar` fuera de las 72 h → rechazado | Test unitario del cómputo + ruta |
| AC-6 | `getDirectivas` devuelve `Cerrada` para `Realizada` con > 72 h | Test unitario (fecha mockeada) |
| AC-7 | Una directiva no-`Realizada` nunca se cierra automáticamente | Test unitario |
| AC-8 | UI: operario ve Aceptar/Cerrar sobre las suyas según estado; admin ve Objetar sobre `Realizada` | Test de componente |
| AC-9 | Suite completa verde, `tsc`, `lint`, `build` sin errores; Tarea y A intactas | Local |

## 11. Riesgos y mitigaciones

| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| "Aceptar por tiempo" trabajo no hecho | — | Correctitud | B1: el cierre automático solo aplica sobre `Realizada` |
| Cómputo de 72 h dependiente de la hora del server | Baja | Bordes de fecha | Usar `Date.now()` en UTC; test con fecha mockeada |
| Objeción tardía (después del cierre automático) | Media | Confusión | FR-4 + §9: rechazar objeción si el estado efectivo ya es Cerrada |
| Escritura durante GET (side-effect) | Baja | Lecturas lentas/raras | NFR-4: `Cerrada` es derivado, no se persiste en el GET |
| Ocultar acciones en UI sin validar en server | Media | Seguridad | NFR-3 + FR-2/3/4: validación server-side en el PATCH |

## 12. Definición de "hecho"

1. AC-1 a AC-9 verdes.
2. `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` sin errores.
3. Un operario puede aceptar, ejecutar y cerrar (con nota) sus directivas; el admin puede objetar una `Realizada` dentro de 72 h (reabre); una `Realizada` sin objeción a las 72 h se muestra `Cerrada`.
4. Una directiva no cerrada nunca se cierra automáticamente.
5. Sin regresiones en la Tarea ni en la Pieza A.
