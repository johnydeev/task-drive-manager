# SPEC — Edificios: vista completa para supervisores + contador de pendientes

**Fecha:** 2026-09-07
**Estado:** Propuesto (rev. 1)
**Autor:** equipo task-drive-manager
**Plan asociado:** [`../plans/2026-09-07-edificios-vista-completa-y-contador.md`](../plans/2026-09-07-edificios-vista-completa-y-contador.md)

La vista `/edificios` pasa a mostrarle al **supervisor** los consorcios y las tareas asignadas de
**todos** los integrantes —la misma pantalla del admin, en modo lectura— y cada pill de edificio
gana un **contador de tareas pendientes** del consorcio: `BELGRANO 2458 (3)`.

---

## Contexto

`/edificios` («Edificios y directivas por integrante») arma una tarjeta por integrante activo con
tres bloques: **Edificios** (pills de los consorcios asignados, cada uno linkeado a
`/tareas?edificio=…`), **Directivas** (indicaciones internas admin→integrante) y **Tareas
asignadas** (las tareas donde ese integrante es el responsable de ejecución).

Hoy el supervisor ve **una sola tarjeta: la suya**. Ese recorte está en cuatro lugares distintos,
tres de ellos server-side:

| Pieza | Recorte actual para no-admin |
|---|---|
| `components/edificios/EdificiosView.tsx` | filtra `integrantes` a los que matchean su email |
| `GET /api/usuarios` | devuelve **solo su propio registro** |
| `GET /api/asignaciones` | `getAsignaciones(session.user.email)` — solo las suyas |
| `GET /api/directivas` | `getDirectivas(session.user.email)` — solo las suyas |

`GET /api/tareas` es la excepción: ya devuelve **todas** las tareas a cualquier sesión, por
decisión previa («las tareas de edificio son trabajo operativo compartido»).

El contador no existe en ninguna superficie. La información para calcularlo **ya está en la vista**:
`EdificiosView` monta `useTareas()`, que trae todas las tareas con su `estado` **efectivo**
(`lib/sheets/tareas.ts` aplica `estadoEfectivoTarea` al leer, o sea el cierre derivado a 72 h ya
viene resuelto).

## Problema

**1. El supervisor no sabe quién atiende qué.** Cuando necesita saber de qué consorcio se ocupa un
compañero —para derivar un reclamo, para cubrir a alguien— tiene que preguntar. La información
existe y no es secreta dentro del equipo; simplemente no se muestra.

**2. Nada dice cuánto trabajo tiene encima un consorcio.** Los pills son todos iguales: hay que
entrar a `/tareas?edificio=…` de a uno para descubrir cuál está prendido fuego. En el celular, que
es donde se usa la app en la calle, eso son varios toques por edificio.

## Alcance

**Dentro:**
- Apertura en lectura de `GET /api/usuarios` y `GET /api/asignaciones` para el rol supervisor.
- Vista `/edificios` con **todas** las tarjetas para cualquier rol, sin acciones para el supervisor.
- Bloque **Directivas** oculto en las tarjetas ajenas cuando el usuario no es admin.
- Contador de tareas pendientes por consorcio en los pills de la tarjeta, para **ambos roles**.
- Módulo puro nuevo para el conteo, con tests colocados.

**Fuera:**
- Cualquier acción nueva para el supervisor: sigue sin poder asignar, quitar ni crear directivas.
- El cartel rojo «Quedan N edificios por asignar»: sigue siendo admin-only.
- Directivas ajenas: el endpoint las sigue recortando y no se toca.
- El contador en otras superficies (listado de tareas, dashboard, informes).
- Buscador, filtro o colapsado de tarjetas: con hasta ~8 integrantes activos no hace falta.
- Cache offline de usuarios y asignaciones: la vista sigue requiriendo conexión, como hoy.

---

## Decisiones

| # | Decisión | Alternativa descartada |
|---|---|---|
| 1 | Pendiente = **todo lo que no es `Realizada`** (6 de los 7 estados) | Solo el bloque Pendientes de `lib/informes.ts` (Sin asignar + Asignada + Aceptada); solo `Sin asignar` |
| 2 | El supervisor ve **Edificios y Tareas asignadas** de los demás; **Directivas** solo las propias | Ver todo, directivas ajenas incluidas; ver solo los edificios |
| 3 | Contador **siempre visible**, en rojo con N > 0 y apagado en `(0)` | Ocultar el badge cuando no hay pendientes |
| 4 | Solo en `/edificios` | Sumarlo también al cartel de sin asignar / al listado / al dashboard |
| 5 | El link envuelve **nombre + contador**; el ✕ del admin queda **fuera** del anchor | El número como segundo link con filtro de estado; número decorativo |
| 6 | A un no-admin, `GET /api/usuarios` le devuelve los usuarios activos **sin `firmaUrl`** | Devolver el registro completo |
| 7 | El join tarea↔consorcio va por `normalizeEdificio` | Comparar los strings crudos; usar `edificio_cuit` |

**Sobre la 1:** hay dos definiciones de «pendiente» ya vivas en el repo y son distintas —
`lib/informes.ts` manda `Objetada` al grupo «En Proceso», y `groupByEdificio` de `lib/dashboard.ts`
la cuenta como pendiente. Ninguna de las dos se toca: el contador es una tercera lectura, la de
«trabajo abierto del consorcio», y por eso vive en su propio módulo con nombre explícito. Que el
número baje solo cuando una tarea llega a `Realizada` es también lo más fácil de explicarle al
cliente.

**Sobre la 3:** el `(0)` apagado distingue «este consorcio está al día» de «todavía no cargaron los
datos», que con el badge ausente serían indistinguibles.

**Sobre la 6:** `firmaUrl` es el link público en Drive a la firma con la que se sellan los PDF de
visita. No hace falta para dibujar esta pantalla. Sacarla no rompe nada: en el cliente solo la
consume `components/usuarios/UsuariosManager.tsx` (admin-only) y el PDF de visita la resuelve
server-side en `app/api/visitas/route.ts`, leyendo la hoja `Usuarios` directamente.

**Sobre la 7:** las tareas referencian el consorcio con el nombre de la app vieja
(`Belgrano 1429`) mientras que `_Consorcios` usa el canónico (`BELGRANO 1429`). Comparar los
strings crudos daría contadores en cero para media cartera. El CUIT sería el join correcto a
futuro, pero hoy sigue diferido por diseño: `normalizeEdificio` es el join principal de todo el
sistema.

---

## #1 — Conteo de pendientes (lógica pura)

Módulo nuevo `lib/pendientes-por-edificio.ts`, sin IO y **sin dependencias fuera de
`lib/edificio-match.ts` y `types`**.

```ts
export function contarPendientesPorEdificio(tareas: Tarea[]): Map<string, number>;
export function pendientesDe(mapa: Map<string, number>, edificio: string): number;
```

- Clave del mapa: `normalizeEdificio(t.edificio)`. Las tareas sin edificio no cuentan.
- Suma cuando `t.estado !== "Realizada"`. El `estado` que llega ya es el efectivo, así que una
  tarea auto-cerrada a las 72 h **no** infla el número.
- `pendientesDe` normaliza el nombre que recibe y devuelve `0` si la clave no está — un consorcio
  sin ninguna tarea da `0`, no `undefined`.

> **Restricción de arquitectura:** este módulo lo importa un componente de cliente. No puede colgar
> de `lib/sheets/*`, que arrastra `googleapis` y rompe el build con
> `Can't resolve 'child_process' / 'fs'` (los tests no lo ven: vitest corre en Node).

**Criterio:** con tres tareas en `BELGRANO 2458` (`Sin asignar`, `En Proceso`, `Objetada`) y dos
`Realizada`, `pendientesDe(mapa, "Belgrano 2458")` devuelve `3`.

## #2 — Apertura de los endpoints

**`GET /api/usuarios`** — el admin sigue recibiendo todos los registros completos. El no-admin pasa
de recibir solo el propio a recibir **todos los usuarios activos**, con `firmaUrl` removida en los
ajenos; su propio registro va completo.

**`GET /api/asignaciones`** — deja de filtrar por email: devuelve todas las asignaciones a
cualquier sesión autenticada. `POST` y `DELETE` siguen envueltos en `withAdmin`.

**`GET /api/directivas`** — **sin cambios.** Sigue devolviéndole al no-admin solo las suyas.

**`GET /api/tareas`** — **sin cambios.** Ya devuelve todas.

**Criterio:** con sesión de supervisor, `GET /api/asignaciones` devuelve las asignaciones de todo el
equipo y `POST /api/asignaciones` sigue respondiendo 403; `GET /api/usuarios` devuelve a los demás
integrantes sin el campo `firmaUrl`.

## #3 — Vista

`components/edificios/EdificiosView.tsx`:
- Se elimina el filtro por email: `integrantes` son todos los usuarios activos, para cualquier rol.
- Orden: **la tarjeta propia primero**, el resto alfabético por nombre visible.
- Calcula el mapa de pendientes una vez, con `useMemo` sobre las tareas ya cargadas, y lo baja a
  cada tarjeta. No hay fetch nuevo.

`components/edificios/IntegranteCard.tsx`:
- Prop nueva con el mapa de pendientes.
- Prop nueva `mostrarDirectivas`: `true` si es la tarjeta propia o si el usuario es admin. En falso,
  el bloque Directivas **no se renderiza** —ni el título—, para no afirmar «Sin directivas» sobre
  un integrante cuyas directivas el endpoint no devolvió.
- El `<Link>` del pill pasa a envolver el nombre **y el contador**, para que el número también sea
  área clickeable. El botón ✕ del admin queda como **hermano del anchor, fuera de él**: un
  `<button>` dentro de un `<a>` es HTML inválido (contenido interactivo anidado) y rompe el
  comportamiento del tap en mobile. El pill sigue siendo el `<span>` contenedor de los dos.
- El ✕, el dropdown de agregar y «Asignar directiva» ya cuelgan de `readOnly`, que para el
  supervisor ya llega en `true`: no requieren cambios.
- Badge: `bg-red-100 text-red-700` con N > 0, `bg-slate-200 text-slate-500` en `(0)`.
  `aria-label` del pill: `"BELGRANO 2458 — 3 tareas pendientes"`.

`components/edificios/TareasAsignadasCard.tsx` — sin cambios. Ya renderiza lo que recibe y
`EdificiosView` le pasa las tareas de cada integrante.

**Nota de dominio:** el contador es del **consorcio**, no del integrante. Cuenta las tareas
abiertas del edificio sin importar quién las creó ni quién las ejecuta. El `aria-label` lo dice
explícito para que no se lea como «este integrante tiene 3 tareas».

**Criterio:** logueado como supervisor, la pantalla muestra una tarjeta por integrante activo, la
propia arriba; en las ajenas hay Edificios y Tareas asignadas pero ningún bloque Directivas, y
ningún control de escritura.

## #4 — Efectos fuera de `/edificios`

`GET /api/usuarios` no lo consume solo esta vista. Se auditaron los tres consumidores:

| Consumidor | Efecto de la apertura |
|---|---|
| `components/usuarios/UsuariosManager.tsx` | Ninguno: es admin-only y el admin ya recibía todo. |
| `components/tareas/TareaDetalle.tsx` | **Cambia**: hoy el supervisor ve el email crudo en «Asignado a» y «Supervisor» porque `displayName` no encuentra al usuario en la lista de uno. Al recibir el equipo completo, pasa a ver los **nombres**. Es la conducta que el admin ya tiene. |
| `components/tareas/AccionesTarea.tsx` | Ninguno: el `<select>` «Asignar a» que se alimenta de esa lista está detrás de `puedeAsignar = isAdmin && …`, y el `PATCH` de asignación es admin-only en el server. **Verificado, no se abre ningún control nuevo.** |

Ese cambio en `TareaDetalle` es deseable y se declara acá para que no aparezca como sorpresa: la
feature toca una pantalla más de la que su título sugiere.

---

## Criterios de aceptación

1. Un supervisor ve en `/edificios` a todos los integrantes activos, con sus consorcios y sus
   tareas asignadas. Su tarjeta aparece primera.
2. En las tarjetas ajenas el supervisor no ve el bloque Directivas; en la propia lo ve completo,
   con sus botones de aceptar/cerrar.
3. El supervisor no tiene ✕, ni dropdown de agregar edificio, ni «Asignar directiva» en ninguna
   tarjeta, y el cartel «Quedan N edificios por asignar» sigue siendo solo del admin.
4. `POST`/`DELETE` de `/api/asignaciones` y `/api/directivas` siguen respondiendo 403 a un
   supervisor.
5. Cada pill muestra el contador: rojo con las tareas abiertas del consorcio, `(0)` apagado si no
   hay ninguna. Una tarea `Realizada` no suma; una `Objetada` sí.
6. El contador acierta aunque la tarea escriba el edificio con otra capitalización o acentuación
   que `_Consorcios`.
7. Tocar cualquier parte del pill abre `/tareas?edificio=…`.
8. La vista del admin conserva todo lo que hace hoy, más el contador: el ✕ sigue quitando el
   edificio y no dispara la navegación del pill.
9. En el detalle de una tarea, el supervisor ve el **nombre** del asignado y del supervisor, no el
   email crudo. El panel «Acciones» no le muestra ningún control nuevo.
10. Árbol verde: `npm test` + `npx tsc --noEmit` + `npm run lint` + `npm run build`.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Los supervisores pasan a ver el nombre, el email y el rol de todo el equipo, y quién atiende cada consorcio | Aceptado: es información interna del equipo y el pedido es explícito. Se acota con la decisión 6 (sin `firmaUrl`) y manteniendo las directivas ajenas ocultas. |
| Un consorcio sin asignar a ningún integrante no aparece en la vista, así que sus pendientes no se ven | Conocido y fuera de alcance. El admin los tiene en el cartel rojo y en `/tareas`. |
| El módulo de conteo termina importando `lib/sheets/*` y rompe el build | La restricción está documentada en el encabezado del módulo; `npm run build` es parte del criterio 10 y es el único que lo detecta. |
| «Pendiente» ya significa dos cosas distintas en el repo y esta es una tercera | El módulo tiene nombre y comentario propios; ni `informes.ts` ni `dashboard.ts` se tocan. |
| Con muchas tareas, contar en cada render | El conteo es O(n) sobre datos ya cargados y va en `useMemo`. Sin fetch nuevo. |
| Tarjetas ajenas sin bloque Directivas quedan más bajas y la grilla se ve despareja | Cosmético; la grilla ya es de altura libre por tarjeta. |

## Definición de hecho

- `lib/pendientes-por-edificio.ts` con tests colocados.
- `GET /api/usuarios` y `GET /api/asignaciones` abiertos en lectura, con tests de rol.
- **Dos tests existentes se reescriben** —afirman justo el recorte que esta feature elimina, así
  que van a fallar y su reemplazo es parte del trabajo, no un arreglo aparte:
  - `tests/api/usuarios.test.ts` → «un no-admin recibe solo su propio registro» pasa a verificar
    que recibe a todos los activos y que los ajenos vienen sin `firmaUrl`.
  - `tests/api/asignaciones.test.ts` → «supervisor recibe solo las suyas» pasa a verificar que
    `getAsignaciones` se llama **sin argumento** para cualquier rol.
- `EdificiosView` e `IntegranteCard` actualizados, con tests colocados de vista de supervisor,
  ocultamiento de directivas ajenas y badge en N y en 0.
- Verificado a mano con una sesión de supervisor y una de admin.
- Árbol verde y `CHANGELOG.md` actualizado.
