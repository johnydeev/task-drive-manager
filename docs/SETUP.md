# Setup — correr el proyecto con tu propio Google

Para solo **probarlo** sin configurar nada, usá el [modo demo](../README.md#probar-sin-credenciales-modo-demo) o la [demo en vivo](https://task-drive-manager.vercel.app). Esta guía es para correrlo con **Google real** (Sheets + Drive propios).

## Scripts

```bash
npm run dev    # servidor de desarrollo en http://localhost:4000
npm run build  # build de producción (webpack)
npm start      # servir el build (puerto 4000)
npm run lint   # ESLint
npm test       # suite de tests (Vitest)
npm run seed   # llena hojas Usuarios y Configuracion (requiere .env.local)
npm run icons  # genera íconos PWA desde public/logo-source.png
```

## 1. Configurar Google Cloud

1. Crear un proyecto en https://console.cloud.google.com
2. Habilitar las APIs: **Google Sheets API** y **Google Drive API**.
3. Crear una **Service Account** y generar una **key JSON**.
4. Crear credenciales **OAuth 2.0 Client ID** (login de usuarios):
   - Application type: Web application
   - Authorized redirect URI: `http://localhost:4000/api/auth/callback/google` (y el de producción)
   - Pantalla de consentimiento "Externo": agregar los emails como **Usuarios de prueba**

## 2. Preparar las Google Sheets

**Archivo principal** (`GOOGLE_SHEET_ID`) — tabs:

- `Tareas` — hoja donde escribe la app (mapping de columnas por header en `lib/sheets/`)
- `Dptos` — A=ID dpto, B=DPTO, C=Edificio ref (incluye un "edificio" virtual `Parte Común` con las partes comunes posibles)
- `Usuarios` — A=email, B=nombre, C=rol (admin/supervisor), D=activo, E=creado_en
- `Configuracion` — A=clave, B=valor. **⚠ El tab va SIN tilde** (`Configuracion`)

**Archivo de consorcios** (`GOOGLE_CONSORCIOS_SHEET_ID`, externo, solo lectura) — tabs:

- `_Consorcios` — A=NOMBRE CANÓNICO, B=CUIT, E=ACTIVO. Listado de edificios.
- `_Proveedores` — A=nombre del proveedor.

**Compartir** el archivo principal con el Service Account como **Editor**, y el de consorcios como **Lector**.

**Crear el primer admin** (o `npm run seed`): agregar una fila en `Usuarios`:

```
tu-email@gmail.com | Tu Nombre | admin | TRUE | 2026-06-19T00:00:00.000Z
```

Sin esa fila, nadie puede iniciar sesión.

## 3. Preparar Google Drive

1. Crear una **Unidad Compartida** (Drive → Unidades compartidas → Nueva).
2. Agregar el email del Service Account como **Administrador de contenido**.
3. Copiar el ID de la URL: `drive.google.com/drive/folders/{ESTE_ID}`.

> Debe ser **Unidad Compartida**, no "Mi unidad": el Service Account no tiene cuota propia.

La app crea las carpetas automáticamente:
```
Tareas/{Edificio}/{Año}/{Mes}/{fecha · ubicación · objetivo}/
  Imagenes/    Videos/    Documentos/    Reporte/
```

## 4. Variables de entorno

Copiar `.env.example` a `.env.local` y completar:

```env
GOOGLE_SHEET_ID=...                  # archivo principal (Tareas/Dptos/Usuarios/Configuracion)
GOOGLE_CONSORCIOS_SHEET_ID=...       # archivo externo con el tab _Consorcios
GOOGLE_SERVICE_ACCOUNT_EMAIL=...     # del JSON, campo client_email
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_DRIVE_ROOT_FOLDER_ID=...      # ID de la Unidad Compartida

NEXTAUTH_URL=http://localhost:4000
NEXTAUTH_SECRET=...                  # generar con: openssl rand -base64 32

GOOGLE_CLIENT_ID=...                 # OAuth client ID
GOOGLE_CLIENT_SECRET=...

# Opcional — marca de la app (default: "Task Drive Manager").
# ⚠ NEXT_PUBLIC_* se hornea en el BUILD (ver Dockerfile / docs/DEPLOY.md).
# NEXT_PUBLIC_APP_NAME=
# NEXT_PUBLIC_APP_SHORT_NAME=
```

> ⚠ `GOOGLE_PRIVATE_KEY` debe contener los `\n` literales. Si lo pegás del JSON, ya vienen correctos.

## 5. Correr en dev

```bash
npm run dev   # http://localhost:4000
```

Abrir http://localhost:4000 → redirige a `/tareas`. Sin sesión, redirige a `/login`.

---

Para el deploy de producción, ver [DEPLOY.md](DEPLOY.md).
