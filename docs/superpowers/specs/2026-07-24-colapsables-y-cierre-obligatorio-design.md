# SPEC — Secciones colapsables + cierre obligatorio otra vez

**Fecha:** 2026-07-24
**Estado:** Propuesto (rev. 1)
**Autor:** equipo task-drive-manager
**Plan asociado:** [`../plans/2026-07-24-colapsables-y-cierre-obligatorio.md`](../plans/2026-07-24-colapsables-y-cierre-obligatorio.md)

Tres cambios sobre el detalle de tarea. #1 y #3 son colapsables (menos ruido visual); #2
**revierte** parcialmente el cierre opcional.

---

## #1 — "Agregar archivos" colapsable (solo en el detalle)

La sección **"Agregar archivos"** del detalle (asignado, En Proceso/Objetada) pasa a ser
**colapsable**, **colapsada por defecto**. El `FileUploader` del **alta de tarea**
(`TareaForm`) **NO** cambia (sigue siempre visible): el colapsable se aplica solo al wrapper
del detalle, no al `FileUploader`.

**Criterio:** en el detalle, "Agregar archivos" arranca colapsada; al expandir aparece el
uploader. En el alta de tarea, el uploader se ve como hoy.

---

## #2 — Cierre obligatorio de nuevo (revert parcial del default)

La **nota de cierre vuelve a ser obligatoria** (se había hecho opcional en el cambio anterior):
- **Backend** (`cerrar` en `PATCH /api/tareas/[id]`): restaurar `if (!nota?.trim()) return 400`.
- **Cliente** (`AccionesTarea`, bloque admin En Revisión): el botón **"Cerrar (dar por
  realizada)"** vuelve a estar **deshabilitado** si el textarea está vacío (como "Objetar", que
  ya lo estaba). El texto de ayuda vuelve a **"Para cerrar u objetar debe existir un
  comentario."** y se restaura el asterisco de obligatorio en el label.

El default **"Sin comentarios"** se **mantiene** para **comentario en proceso** y **comentario
de revisión** (empty → "Sin comentarios"). Para el **cierre** ya no aplica (no puede quedar
vacío). La **objeción** sigue obligatoria (sin cambios).

**Criterios:**
- `cerrar` con nota vacía → **400** (ya no 200/"Sin comentarios").
- En la UI, con el textarea vacío, **ambos** botones (Cerrar y Objetar) quedan deshabilitados y
  se ve el aviso.

---

## #3 — Media colapsable en una sola barra

Hoy el detalle muestra **tres cards separadas** (Imágenes, Videos, Documentos). Se reemplazan
por **una sola sección colapsable** — ej. **"Archivos multimedia (N)"**, con N = total de
archivos — **colapsada por defecto**. Al expandir, muestra los tres grupos (Imágenes / Videos /
Documentos) uno debajo del otro, cada grupo solo si tiene contenido. Si la tarea no tiene
ningún archivo, la sección no se renderiza.

**Criterio:** con media, se ve una sola barra "Archivos multimedia (N)" colapsada; al expandir
aparecen los grupos con contenido; sin media, no aparece nada.

---

## Componente nuevo

`components/ui/CollapsibleSection.tsx`: card reutilizable con header clickeable (título +
chevron que rota) que muestra/oculta el contenido. Props: `{ title, defaultOpen?, children }`.
Accesible (`aria-expanded`). Reemplaza/complementa al `Section` local del detalle para los usos
colapsables. Los usos NO colapsables (Datos, Informe, Comentarios, Reporte) quedan como están.

## Testing

- `CollapsibleSection`: colapsada por defecto no muestra el contenido; al click lo muestra; `defaultOpen` lo arranca abierto.
- `TareaDetalle`: la barra "Archivos multimedia" aparece colapsada con media y oculta los grupos hasta expandir; "Agregar archivos" colapsable para el asignado.
- `AccionesTarea` / API: `cerrar` vacío → 400; botón Cerrar deshabilitado sin nota.
- Mantener verde: `vitest` + `tsc` + `lint` + `build`.

## Fuera de alcance

- Cambiar el `FileUploader` del alta de tarea.
- Persistir el estado abierto/cerrado entre visitas (siempre arranca colapsado).
- Tocar el default "Sin comentarios" de en proceso / revisión.
