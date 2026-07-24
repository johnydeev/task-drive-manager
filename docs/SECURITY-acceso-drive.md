# Modelo de acceso a los datos (Sheets + Drive)

> **Fecha:** 2026-07-24 · **Estado:** decisión aceptada (dejar como está, conociendo el riesgo).
> Este documento describe **quién puede ver qué** en producción y por qué. Es la referencia
> ante dudas de seguridad o pedidos del cliente sobre privacidad de los archivos.

## Resumen (TL;DR)

| Qué | ¿Accesible por una cuenta ajena / no registrada? |
|---|---|
| El **listado de tareas** y la **estructura de carpetas** completa | **NO** |
| Un **archivo multimedia individual** (imagen / video / PDF / reporte) | **SÍ, si tiene el link directo** — sin login |

Dicho de otra forma: **nadie de afuera puede ver "todo"**, pero **cada archivo es tan privado como su URL**.

## Detalle

### 1. La app está detrás de login (nadie ajeno entra)

- `proxy.ts` (ex middleware) redirige a `/login` cualquier request sin sesión.
- `requireSession` + el chequeo de rol contra la hoja `Usuarios` rechazan a quien no esté
  registrado. Una cuenta de Gmail que **no está en `Usuarios`** no puede iniciar sesión ni
  ver el listado de tareas, el dashboard, ni la galería por la app.

### 2. La estructura de carpetas de Drive NO es pública

- Las carpetas (`Tareas/{Edificio}/{Año}/{Mes}/{tarea}/…`) viven en la **Unidad Compartida**
  de la organización. El acceso a las carpetas = **ser miembro de esa Unidad Compartida**.
- El código **nunca comparte carpetas públicamente**: `ensureFolder` en
  [`lib/google-drive.ts`](../lib/google-drive.ts) crea carpetas sin tocar permisos. El único
  `permissions.create` del código se aplica a **archivos**, no a carpetas.
- En Google Drive, un archivo compartido "por link" **no** expone su carpeta padre ni los
  archivos hermanos. Quien tiene el link de un archivo ve **solo ese archivo**; no puede
  navegar la carpeta ni listar el resto de las tareas.

### 3. Cada archivo multimedia SÍ es público por link — por diseño

Al subir cada imagen/video/PDF/reporte, [`lib/google-drive.ts`](../lib/google-drive.ts)
(función `uploadFile`) ejecuta:

```js
await drive.permissions.create({
  fileId,
  requestBody: { role: "reader", type: "anyone" }, // "cualquiera con el link", sin login
});
```

- `type: "anyone"` = **cualquiera con el link puede leer/descargar el archivo, sin cuenta**.
- Se hizo así para que la app renderice fotos, thumbnails
  (`drive.google.com/thumbnail?id=…`, [`lib/drive-url.ts`](../lib/drive-url.ts)) y videos, y
  para que el **PDF de reporte** sea descargable, **sin pedir OAuth por cada archivo**.
- Aplica a **los cuatro tipos**: `imagen`, `video`, `documento` y `reporte`.

### Riesgo real y su alcance

- El `fileId` de Drive es una cadena aleatoria larga (~33 caracteres): **no es adivinable ni
  enumerable**. Nadie puede "probar" URLs hasta dar con un archivo.
- La exposición se materializa **solo si un link se filtra**: se reenvía, se comparte, queda
  en el historial del navegador, o alguien lo extrae del PDF de reporte. En ese caso, quien
  tenga el link lo abre sin barrera, no queda registro de quién accedió, y no se puede
  "revocar" salvo **borrando o moviendo** el archivo (lo que cambia/rompe el link).
- **No hay exposición masiva**: no existe forma de listar todo ni de llegar a la carpeta raíz
  desde un link de archivo.

## Cómo cerrarlo (si en el futuro se decide hacer privados los archivos)

Esto es un **cambio de arquitectura**, no un bug. Opciones, de menor a mayor esfuerzo:

1. **Dejarlo como está** (decisión actual): cómodo, funciona; riesgo = filtración de link.
2. **Proxy autenticado de archivos.** Un endpoint `/api/media/[fileId]` que valida la sesión
   (usuario registrado) y hace de intermediario del archivo desde Drive con la Service
   Account. Se **quita** el permiso `anyone` al subir; los archivos dejan de ser públicos y
   solo los ven usuarios logueados. Costo: suma carga/tráfico al server y hay que adaptar
   galería, thumbnails, reproducción de video y el enlace del PDF de reporte para pasar por
   ese endpoint. (Ojo: el PDF de reporte embebe/enlaza thumbnails; habría que resolver cómo
   se sirven esas imágenes dentro del PDF y al descargarlo.)

Si se avanza con la opción 2, hacerlo con spec + plan (ver `docs/superpowers/`).

## Archivos relevantes

- [`lib/google-drive.ts`](../lib/google-drive.ts) — `uploadFile` (permiso `anyone`), `ensureFolder` (carpetas sin permiso público), papelera/borrado.
- [`lib/drive-url.ts`](../lib/drive-url.ts) — URL de thumbnails públicos.
- [`proxy.ts`](../proxy.ts) — gate de sesión de la app.
- [`lib/auth.ts`](../lib/auth.ts) — `requireSession` / rol contra hoja `Usuarios`.
