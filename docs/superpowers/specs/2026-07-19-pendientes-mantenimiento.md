# SPEC — Pendientes de mantenimiento (spinners + demo-mode como capa)

**Fecha:** 2026-07-19
**Estado:** Borrador
**Autor:** equipo task-drive-manager
**Alcance:** dos ítems chicos e independientes surgidos de la sesión del refactor + feature Edificios. Cada uno puede planificarse y ejecutarse por separado.

---

## Ítem 1 — Barrido de spinners en botones de acción

### Contexto
Existe una regla (global en `~/.claude/CLAUDE.md`): **todo botón que dispara una acción asíncrona (API/mutation) debe mostrar spinner (`Loader2` animado) y quedar `disabled` mientras `isPending`**. Se aplicó en la feature Edificios, pero el resto de la app quedó sin auditar.

### Alcance
- **Dentro:** recorrer los componentes con acciones async y agregar `Loader2` + `disabled` donde falte. Incluye botones de solo icono (reemplazar el icono por el spinner).
- **Fuera:** botones que solo togglean estado local (abrir form/diálogo, mostrar filtros, expandir) — no llevan spinner.

### Gaps conocidos / a verificar
- **`TareaDetalle`** — botones "Cambiar estado" (`patchEstado.mutate`): hoy quedan `disabled` pero **sin spinner**. (El de generar reporte ya lo tiene.)
- **`UsuariosManager`** — crear usuario y activar/desactivar (toggle `activo`): verificar.
- **`ConfiguracionForm`** — botón guardar: verificar.
- **`login`** — botón de iniciar sesión con Google: verificar.
- Ya OK (no tocar): `TareaForm` (submit), `FileUploader` (subidas con `busy`), `DirectivaForm`, `IntegranteCard`, `DirectivaItem`, `ConfirmDialog`.

### Método
Buscar en `components/` y `app/` los `.mutate(` / `onClick` que disparan fetch o mutation y confirmar que el botón usa su `isPending`/estado de carga tanto en el contenido (spinner) como en `disabled`.

### Criterios de aceptación
- **AC-1** — Todo botón que dispara una mutation/fetch async muestra spinner + `disabled` mientras está en curso.
- **AC-2** — Sin regresiones: suite verde, `tsc`, `lint`, `build` OK.
- **AC-3** — Donde el componente ya tenga test, agregar/ajustar un assert del estado de carga si aporta (no obligatorio en todos).

### Riesgo / esfuerzo
Bajo. Cambios visuales locales, sin lógica nueva. ~1 h.

---

## Ítem 2 — Aislar `demo-mode` como capa (refactor, opcional)

### Contexto
Cada función de la capa de datos (`lib/sheets/*`, `lib/consorcios.ts`) arranca con un guard `if (isDemoMode()) return demoX()` — está localizado pero **repetido ~12+ veces**. La idea: seleccionar la implementación (real vs demo) **una sola vez** en lugar de branchear en cada función.

### Precondición (gate)
Solo con cobertura de tests sobre esas funciones. **Ya se cumple**: `tests/lib/google-sheets-crud.test.ts` + `lib/sheets/{asignaciones,directivas}.test.ts`. Esa red es la garantía anti-regresión.

### Alcance
- **Dentro:** reemplazar los guards repetidos por una **selección de repositorio** en un punto: p. ej. `export const tareasRepo = isDemoMode() ? demoTareasRepo : sheetsTareasRepo;` (o un wrapper equivalente), manteniendo la misma API pública y **comportamiento idéntico**.
- **Fuera:** cambiar contratos, tipos o comportamiento observable; tocar la UI.

### Decisión pendiente (definir antes del plan)
¿Vale la pena? El archivo ya está **dividido por entidad** y los guards son claros y de una línea. El valor es cosmético/DRY; el riesgo es tocar toda la capa de datos. **Recomendación: baja prioridad — hacerlo solo si el patrón empieza a molestar o si se agregan muchas entidades nuevas.** Si se hace, elegir entre:
- **A)** Selección de repo por entidad (objeto real/demo intercambiable).
- **B)** Un `withDemo(realFn, demoFn)` helper que envuelve cada export.

### Criterios de aceptación
- **AC-1** — No queda el `if (isDemoMode())` repetido dentro de cada función de datos (la decisión vive en un solo lugar).
- **AC-2** — Comportamiento idéntico en modo real y demo; **suite completa verde** (la red CRUD no cambia).
- **AC-3** — `tsc`, `lint`, `build` OK.

### Riesgo / esfuerzo
Medio (toca toda la capa de datos, aunque con red de tests). ~2-3 h. **Opcional / diferible.**

---

## Notas
- Ítems independientes: se pueden planificar/ejecutar por separado (o solo el 1, que es el de mayor relación valor/esfuerzo).
- Ambos respetan la convención de commits (yo dejo verde y freno; los commits van por GitLens).
