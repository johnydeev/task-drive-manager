# SPEC — PDF de reportes + adjuntos PDF

**Fecha:** 2026-06-14
**Estado:** Aprobado
**Autor:** equipo task-drive-manager
**Plan asociado:** [`docs/superpowers/plans/2026-06-14-pdf-reportes-y-adjuntos.md`](../plans/2026-06-14-pdf-reportes-y-adjuntos.md)

---

## 1. Contexto

Los supervisores que recorren los ~50 edificios necesitan adjuntar documentación externa a las tareas (facturas de proveedores, presupuestos, planos, comprobantes). Hoy el sistema permite imágenes y videos pero no PDFs, lo que fuerza a los supervisores a fotografiar documentos o guardarlos por fuera.

Paralelamente, la administración necesita un **reporte cerrado y compartible** de cada tarea ejecutada: un PDF auto-generado con todos los datos consolidados (informe, comentarios, fotos, importes, proveedor) que se pueda enviar al propietario del consorcio o adjuntar al expediente físico/legal.

## 2. Problema a resolver

| # | Problema | Hoy | Después de este cambio |
|---|---|---|---|
| P1 | Adjuntar un PDF (factura, presupuesto, plano) requiere imprimir y fotografiar | No soportado | Botón "Documento" en el form, sube directo |
| P2 | No hay manera de enviar "el cierre de la tarea" como un solo archivo | Hay que armarlo a mano fuera de la app | PDF de reporte auto-generado al cerrar |
| P3 | Cuando una tarea pasa a "Realizado", la administración tiene que armar el reporte manualmente | Trabajo manual repetitivo | Trigger automático sin intervención del usuario |
| P4 | Los archivos de una tarea quedan dispersos | Drive ya los organiza por tarea (estructura existente) | Se mantiene + se incluye el reporte PDF en la misma carpeta |

## 3. Alcance

### Dentro de scope (lo que cubre este spec)

- **Adjuntar PDFs externos** a una tarea en el flujo de creación y edición
- **Generación automática** de un PDF de reporte cuando la tarea pasa a estado "Realizado"
- **Generación manual** del PDF de reporte desde el detalle de la tarea (botón explícito)
- **Persistencia de la URL** del reporte en la Google Sheet (columna nueva)
- **Soporte en modo demo** (bypass que no toca Drive real)
- **Tests automatizados** con TDD para todas las funciones nuevas

### Fuera de scope (NO cubre este spec)

- Logo de la marca dentro del PDF de reporte (queda como mejora posterior cuando el archivo `public/logo-source.png` esté disponible)
- Notificación por email al propietario cuando el reporte se genera
- Versionado del histórico de reportes (regenerar reemplaza la URL en Sheet, los PDFs viejos quedan en Drive sin tracking)
- Firma digital del PDF
- Plantillas personalizables del PDF por edificio o cliente
- Soporte de otros formatos de documento (Word, Excel, imágenes adicionales)
- Compresión / optimización del PDF generado

## 4. Requisitos funcionales

### Adjuntar PDFs (P1)

- **FR-1** — El uploader de la tarea DEBE aceptar archivos `application/pdf` además de los tipos actuales (imágenes, videos)
- **FR-2** — El uploader DEBE tener un botón visualmente separado para "Documento" (icono `FileText`) con contador `N/maxDocumentos`
- **FR-3** — El sistema DEBE rechazar PDFs que excedan `maxSizePdfMB` (default 20MB) configurable en la hoja `Configuración`
- **FR-4** — El sistema DEBE rechazar más de `maxDocumentos` archivos PDF por tarea (default 5) configurable en la hoja `Configuración`
- **FR-5** — Los PDFs adjuntos DEBEN subirse a la misma carpeta de Drive de la tarea (`Tareas/{Edificio}/{YYYY-MM}/{ts_objetivo}/`)
- **FR-6** — La URL pública del PDF subido DEBE persistirse en la columna `documentos` (índice 12) de la hoja `Ingreso de Pendiente` como JSON array de strings
- **FR-7** — El detalle de la tarea DEBE mostrar la lista de documentos adjuntos como links clickeables con icono PDF
- **FR-8** — Al editar una tarea, las URLs existentes se preservan y se pueden agregar/eliminar individualmente

### Generar PDF de reporte (P2, P3)

- **FR-9** — El sistema DEBE poder generar un PDF de reporte que incluya: header con título y edificio, datos básicos (objetivo, dpto, estado, prioridad, fechas, proveedor, presupuesto, supervisor), informe completo, comentarios (en proceso + realizado), thumbnails de hasta 9 imágenes, lista de URLs de videos y documentos, footer con fecha de generación
- **FR-10** — El PDF generado DEBE subirse a la misma carpeta de Drive de la tarea (FR-5)
- **FR-11** — La URL del PDF DEBE persistirse en la columna `reporteUrl` (índice 13) de la hoja `Ingreso de Pendiente`
- **FR-12** — Cuando una tarea cambia a estado "Realizado" vía PATCH, el reporte DEBE generarse automáticamente sin que el usuario tenga que pedirlo
- **FR-13** — La auto-generación NO DEBE bloquear la respuesta del cambio de estado (debe ser fire-and-forget)
- **FR-14** — Si la auto-generación falla, el cambio de estado DEBE persistir igualmente (graceful degradation con log de error)
- **FR-15** — El detalle de la tarea DEBE exponer un botón "Generar reporte" cuando no existe `reporteUrl`
- **FR-16** — El detalle de la tarea DEBE exponer "Descargar reporte" + "Regenerar" cuando ya existe `reporteUrl`
- **FR-17** — Regenerar un reporte DEBE reemplazar la URL en la Sheet (el PDF viejo queda huérfano en Drive — fuera de scope limpiar)

### Permisos y auth

- **FR-18** — Adjuntar PDFs y generar reportes DEBE respetar las reglas de auth existentes: un supervisor solo puede operar sobre sus propias tareas, un admin sobre todas
- **FR-19** — Los endpoints nuevos DEBEN devolver `403` cuando el usuario no tiene permisos y `404` cuando la tarea no existe

### Modo demo

- **FR-20** — En `DEMO_MODE=1` el sistema NO DEBE tocar Drive real al generar reportes — DEBE devolver una URL fake (`drive.google.com/file/d/demo-reporte-{ts}/view`) con el mismo flow
- **FR-21** — Los datos demo DEBEN incluir al menos 2 tareas con `documentos` poblados y 1 con `reporteUrl` poblada

## 5. Requisitos no funcionales

- **NFR-1** — Tiempo de respuesta del endpoint manual de generación de reporte (`POST /api/tareas/[id]/reporte`): < 10s para una tarea con hasta 9 imágenes en una conexión típica
- **NFR-2** — El cambio del estado a "Realizado" (PATCH) DEBE devolver < 1s (la generación se dispara en background, no espera)
- **NFR-3** — Todo código nuevo DEBE estar cubierto por tests automatizados (TDD: test first, ver fallar, código mínimo)
- **NFR-4** — Type-check (`tsc --noEmit`) DEBE pasar sin errores tras cada task del plan
- **NFR-5** — El build de producción (`npm run build`) DEBE pasar sin errores al final del plan
- **NFR-6** — Las dependencias nuevas se limitan a: `@react-pdf/renderer` (runtime), `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`, `@vitejs/plugin-react` (dev)
- **NFR-7** — No se introducen breaking changes en endpoints existentes (los clientes viejos siguen funcionando si ignoran los campos nuevos)

## 6. Modelo de datos

### Cambios a `types/index.ts`

```ts
interface Tarea {
  // ... campos existentes
  documentos: string[];   // NUEVO — URLs públicas de Drive de PDFs adjuntos
  reporteUrl?: string;    // NUEVO — URL pública del PDF de reporte generado
}

interface Configuracion {
  // ... campos existentes
  maxDocumentos: number;  // NUEVO — default 5
  maxSizePdfMB: number;   // NUEVO — default 20
}
```

### Cambios a la Google Sheet (`Ingreso de Pendiente`)

| Col # | Antes | Ahora |
|---|---|---|
| 12 | (reservada) | `documentos` (JSON array de URLs) |
| 13 | (reservada) | `reporteUrl` (string URL) |
| 14 | (reservada) | sigue reservada |
| 15 | (reservada) | sigue reservada |

### Cambios a la hoja `Configuración`

Sumar dos filas clave-valor:

| Clave | Valor default |
|---|---|
| `max_documentos` | `5` |
| `max_size_pdf_mb` | `20` |

## 7. Endpoints nuevos / modificados

| Método | Path | Cambio | Implementa |
|---|---|---|---|
| POST | `/api/upload` | Acepta `application/pdf`; retorna `kind: "documento"` | FR-1, FR-3 |
| POST | `/api/tareas/[id]/reporte` | **Nuevo**. Genera el PDF, sube a Drive, actualiza Sheet | FR-9, FR-10, FR-11 |
| PATCH | `/api/tareas/[id]` | Si `estado === "Realizado"`, dispara `generateAndUploadReporte` en background | FR-12, FR-13, FR-14 |
| PUT | `/api/tareas/[id]` | Schema acepta `documentos` opcional | FR-8 |
| POST | `/api/tareas` | Schema acepta `documentos` opcional | FR-1 |

## 8. Criterios de aceptación (cómo se valida el spec)

Cada uno corresponde a una verificación end-to-end manual o un test automatizado.

| # | Criterio | Validación |
|---|---|---|
| AC-1 | Puedo adjuntar un PDF al crear una tarea | Manual + `tests/components/FileUploader.test.tsx` |
| AC-2 | El PDF aparece en el detalle como link | `tests/components/TareaDetalle.test.tsx` |
| AC-3 | Subir un PDF de >20MB falla con 413 | `tests/api/upload-pdf.test.ts` |
| AC-4 | Subir más de 5 PDFs en una tarea no es posible (UI) | Manual con `maxDocumentos=5` |
| AC-5 | Marcar una tarea como "Realizado" dispara la generación automática del reporte | `tests/api/tareas-patch-estado.test.ts` |
| AC-6 | El cambio de estado responde rápido aunque la generación falle | `tests/api/tareas-patch-estado.test.ts` (mock que lanza) |
| AC-7 | Puedo generar el reporte manualmente desde el detalle | Manual con `DEMO_MODE=1` |
| AC-8 | El PDF generado incluye todos los campos clave de la tarea | Manual visual |
| AC-9 | Un supervisor no puede generar reporte de tarea ajena | `tests/api/reporte.test.ts` (403) |
| AC-10 | En modo demo no se sube nada real a Drive | `tests/lib/pdf-generator.test.ts` (con mock + DEMO_MODE=1) |
| AC-11 | Type-check pasa sin errores | `npx tsc --noEmit` exit 0 |
| AC-12 | Build de producción pasa | `npm run build` exit 0 |
| AC-13 | Todos los tests pasan | `npm test` exit 0 |

## 9. Orden de implementación (mapea al plan)

El plan asociado descompone el spec en 16 tareas TDD ordenadas. Mapping spec → tasks:

| Sección spec | Tasks del plan que lo implementan |
|---|---|
| Infra de testing | Task 1 |
| Modelo de datos (sección 6) | Tasks 2, 3, 4 |
| Backend storage (FR-5, FR-6, FR-11) | Task 5 |
| API upload (FR-1, FR-3) | Tasks 6, 7 |
| Uploader UI (FR-1, FR-2, FR-7, FR-8) | Task 8 |
| Detalle UI documentos (FR-7) | Task 9 |
| Generación PDF (FR-9, FR-10) | Tasks 10, 11 |
| Endpoint reporte manual (FR-15, FR-16, FR-17) | Task 12 |
| Auto-generación (FR-12, FR-13, FR-14) | Task 13 |
| UI botones reporte (FR-15, FR-16) | Task 14 |
| Demo bypass (FR-20) | Task 15 |
| Documentación final | Task 16 |

## 10. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| `@react-pdf/renderer` no compila con Turbopack | Media | Alto | Ya forzamos `--webpack` en scripts. Verificado en otros componentes. |
| Las imágenes del PDF no cargan porque Drive bloquea hotlinking | Baja | Medio | Las URLs `drive.google.com/thumbnail?id=X&sz=w400` ya son públicas (permisos `anyone`). Fallback: omitir imágenes si fallan. |
| Auto-generación cuelga el endpoint PATCH | Baja | Alto | Patrón fire-and-forget con `.then/.catch` sin `await`. Validado por test AC-6. |
| Suite de tests rompe en CI por inconsistencias de jsdom | Baja | Bajo | Vitest + jsdom es stack estándar 2026. Mocks explícitos de `next/navigation`. |
| Regenerar deja PDFs huérfanos en Drive | Alta | Bajo | Aceptado y declarado fuera de scope (FR-17). Limpieza periódica queda como mejora futura. |

## 11. Decisiones de diseño tomadas

| Decisión | Elegido | Alternativa descartada | Por qué |
|---|---|---|---|
| Librería PDF | `@react-pdf/renderer` | `puppeteer` (chrome headless) | RPDF es Node-puro, no requiere chrome instalado en el server, build más liviano |
| Trigger del reporte | Auto + manual | Solo manual | Más útil para el supervisor que cierra desde el celular sin acordarse de generar |
| Storage del reporte | Misma carpeta de la tarea en Drive | Carpeta "Reportes/" separada | Mantiene la organización orgánica por tarea (P4) |
| Generación bloquante vs background | Background (fire-and-forget) | Sincrónica con await | NFR-2: PATCH debe ser rápido. La UX no debe degradarse. |
| Stack de tests | Vitest + RTL + jsdom | Jest + RTL + jsdom | Vitest tiene mejor DX con Vite/ESM, más rápido, configuración mínima |
| Compresión de PDFs subidos | No comprimir | Comprimir con ghostscript | Out of scope, los PDFs ya son binarios optimizados |
| Logo en el reporte | Texto sin logo (v1) | Imagen del logo en header | El archivo `logo-source.png` no está. Lo sumamos en una iteración corta cuando esté. |

## 12. Definición de "hecho"

Esta feature está completa cuando:

1. Todos los criterios de aceptación (AC-1 a AC-13) están verdes
2. El plan asociado tiene los 16 tasks completados
3. El README refleja las features nuevas en su sección de "Estado de implementación"
4. Manual smoke test end-to-end en modo demo: crear tarea con PDFs, marcar Realizado, ver reporte aparecer
5. Build de producción + tests verdes en el commit final
