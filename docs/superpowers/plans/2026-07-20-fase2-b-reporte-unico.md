# Fase 2 · B — Reporte único — Implementation Plan

> Ejecución inline (TDD donde aplica). "Punto de commit" = checkpoint del usuario (GitLens).

**Goal:** Que al generar/regenerar el reporte de una tarea quede **un solo PDF**: antes de subir el nuevo, mandar a **papelera** de Drive lo que haya en la subcarpeta `Reporte/` de esa tarea (limpia también acumulación previa). Decisión "Opción B" del spec §7.10.

**Architecture:** Se centraliza en `generateAndUploadReporte` (cubre regeneración manual y auto-generación al cerrar). Navega a la subcarpeta `Reporte/` sin crear nada (patrón de `trashTareaFolder`) y trashea sus archivos; luego `uploadTareaFile` sube el nuevo, que —al no quedar ninguno— queda como `reporte-01`.

**Spec:** §7.10 (papelera, no borrado permanente; recuperable — §12).

---

## File Structure

| Archivo | Cambio |
|---|---|
| `lib/google-drive.ts` | `trashFilesInFolder(folderId)` (lista + trashea) + `trashReportesDeTarea(opts)` (navega a `Reporte/` y llama al anterior). |
| `lib/google-drive.test.ts` *(nuevo)* | Test de `trashFilesInFolder`. |
| `lib/pdf-generator.tsx` | Llamar `trashReportesDeTarea(...)` antes de `uploadTareaFile`. |

---

## Task 1: `trashFilesInFolder` (lógica de trasheo, testeable)

- [ ] **Step 1: Test que falla** — `lib/google-drive.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
const { filesList, filesUpdate } = vi.hoisted(() => ({ filesList: vi.fn(), filesUpdate: vi.fn() }));
vi.mock("googleapis", () => ({
  google: { drive: () => ({ files: { list: filesList, update: filesUpdate, create: vi.fn(), delete: vi.fn() }, permissions: { create: vi.fn() } }) },
}));
vi.mock("@/lib/google-auth", () => ({ getGoogleAuth: () => ({}), getDriveRootFolderId: () => "root" }));
vi.mock("@/lib/demo-mode", () => ({ isDemoMode: () => false }));

import { trashFilesInFolder } from "./google-drive";

beforeEach(() => { filesList.mockReset(); filesUpdate.mockReset().mockResolvedValue({}); });

describe("trashFilesInFolder", () => {
  it("manda a papelera cada archivo de la carpeta", async () => {
    filesList.mockResolvedValue({ data: { files: [{ id: "a" }, { id: "b" }] } });
    await trashFilesInFolder("folder-1");
    expect(filesUpdate).toHaveBeenCalledTimes(2);
    expect(filesUpdate).toHaveBeenCalledWith(expect.objectContaining({ fileId: "a", requestBody: { trashed: true } }));
  });
  it("no hace nada si la carpeta está vacía", async () => {
    filesList.mockResolvedValue({ data: { files: [] } });
    await trashFilesInFolder("folder-1");
    expect(filesUpdate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Correr — falla.** `npx vitest run lib/google-drive.test.ts`

- [ ] **Step 3: Implementar en `lib/google-drive.ts`**

```typescript
// Manda a la papelera todos los archivos (no carpetas) de una carpeta.
export async function trashFilesInFolder(folderId: string): Promise<void> {
  const res = await getDrive().files.list({
    q: `'${folderId}' in parents and trashed=false`,
    fields: "files(id)",
    spaces: "drive",
    pageSize: 1000,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  for (const f of res.data.files ?? []) {
    if (!f.id) continue;
    await getDrive().files.update({ fileId: f.id, requestBody: { trashed: true }, supportsAllDrives: true });
  }
}
```

- [ ] **Step 4: Correr — pasa.**

- [ ] **Step 5: Commit** — `feat(drive): trashFilesInFolder`.

---

## Task 2: `trashReportesDeTarea` (navegación a Reporte/)

- [ ] **Step 1: Implementar en `lib/google-drive.ts`** (patrón idéntico a `trashTareaFolder`, sin crear nada)

```typescript
// Manda a papelera los archivos de la subcarpeta Reporte/ de una tarea (no-op si no existe).
export async function trashReportesDeTarea(opts: {
  edificio: string; objetivo: string; ubicacion: string; rowId: string;
}): Promise<void> {
  if (isDemoMode()) return;
  const d = new Date(opts.rowId);
  const fecha = isNaN(d.getTime()) ? new Date() : d;
  const p = argParts(fecha);
  const root = getDriveRootFolderId();
  const tareas = await findFolder("Tareas", root);
  if (!tareas) return;
  const edificio = await findFolder(sanitizeSegment(opts.edificio) || "Sin edificio", tareas);
  if (!edificio) return;
  const anio = await findFolder(String(p.year), edificio);
  if (!anio) return;
  const mes = await findFolder(MESES[p.monthIndex], anio);
  if (!mes) return;
  const nombre = tareaFolderName({ rowId: opts.rowId, ubicacion: opts.ubicacion, objetivo: opts.objetivo });
  const tareaFolder = await findFolder(nombre, mes);
  if (!tareaFolder) return;
  const reporteFolder = await findFolder("Reporte", tareaFolder);
  if (!reporteFolder) return;
  await trashFilesInFolder(reporteFolder);
}
```

> Navegación no unit-testeada (consistente con `trashTareaFolder`, que tampoco lo está); se verifica en E2E.

- [ ] **Step 2: Typecheck** — `npx tsc --noEmit`.
- [ ] **Step 3: Commit** — `feat(drive): trashReportesDeTarea`.

---

## Task 3: Wire en `generateAndUploadReporte`

- [ ] **Step 1: Importar y llamar antes de subir** — `lib/pdf-generator.tsx`

```tsx
import { uploadTareaFile, trashReportesDeTarea } from "./google-drive";
// ...
  const buffer = await renderToBuffer(<TareaReportePdf tarea={tarea} generatedAt={generatedAt} />);

  // Reporte único: limpiar los anteriores antes de subir el nuevo (papelera).
  await trashReportesDeTarea({
    edificio: tarea.edificio,
    objetivo: tarea.objetivo,
    ubicacion: tarea.dpto,
    rowId: tarea.rowId,
  });

  const result = await uploadTareaFile({ /* ...igual que hoy, kind: "reporte"... */ });
```

- [ ] **Step 2: Actualizar el comentario obsoleto** en pdf-generator (el que dice "Si ya hay reportes previos, uploadTareaFile lo nombra reporte-02…") → ahora siempre queda `reporte-01`.

- [ ] **Step 3: Verificar** — `npx vitest run && npx tsc --noEmit && npm run build`.

- [ ] **Step 4: E2E (humano):** regenerar un reporte de una tarea y confirmar en Drive que el anterior quedó en Papelera y hay un solo PDF en `Reporte/`.

- [ ] **Step 5: Commit** — `feat(reporte): reporte único (Opción B) — papelera del anterior al regenerar`.
