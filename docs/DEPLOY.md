# Deploy — task-drive-manager

## Requisitos

- Docker Desktop 4.x+
- Cuenta Cloudflare con un tunnel configurado (gratis)
- Cuenta Google Cloud con Sheets API + Drive API habilitadas
- Una Service Account con private key (descargada como JSON)
- Acceso de Editor del SA al archivo principal Sheets
- Acceso de Lector del SA al archivo `_Consorcios`
- Acceso de Editor del SA a la carpeta de Drive donde la app guarda archivos
- Repo `johnydeev/task-drive-manager` (privado o público) en GitHub

## Setup inicial (primera vez)

### 1. Crear Service Account en GCP

```bash
# En GCP Console > IAM > Service Accounts > Create
# Nombre sugerido: task-drive-manager-app
# Después: Manage Keys > Add Key > Create new key > JSON
```

Guardá el JSON descargado en un lugar seguro. **No lo commitees.**

### 2. Compartir Sheets y Drive con la SA

- Abrir el archivo Sheets principal en Google Drive → Compartir → agregar el email del SA con permiso **Editor**
- Abrir el archivo `_Consorcios` → Compartir → agregar el email del SA con permiso **Lector**
- Abrir la carpeta de Drive donde la app sube archivos → Compartir → agregar el email del SA con permiso **Editor**

### 3. Crear Cloudflare Tunnel

```bash
# En Cloudflare > Zero Trust > Networks > Tunnels > Create a Tunnel
# Nombre: task-drive-manager
# Hostname: task-drive-manager.com (o tu subdominio)
# Service: http://web:3000
```

Copiá el token del tunnel.

### 4. Crear `.env`

Copiar el ejemplo:

```powershell
Copy-Item .env.example .env
```

Llenar con los valores reales:
- `GOOGLE_SHEET_ID` = ID del archivo principal
- `GOOGLE_MASTER_SHEET_ID` = `1AVJ7tKv0hVU0uZF-9JyAPX3EpdgO81nzmzE-1nS6sdY` (default)
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` = del JSON descargado
- `GOOGLE_PRIVATE_KEY` = del JSON descargado, **envuelto en comillas dobles**, con `\n` literales
- `GOOGLE_DRIVE_ROOT_FOLDER_ID` = ID de la carpeta de Drive de la app
- `NEXTAUTH_URL` = `https://task-drive-manager.com` (o tu dominio)
- `NEXTAUTH_SECRET` = generar con `openssl rand -base64 32`
- `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` = de GCP Console > OAuth Client ID
- `CLOUDFLARE_TUNNEL_TOKEN` = el del paso 3

### 5. Seed inicial de hojas

```powershell
npm install
npm run seed
```

Esto llena `Usuarios` y `Configuración` en la Sheet principal.

### 6. Configurar OAuth callback URL

En GCP Console > Credentials > tu OAuth Client ID, agregar en "Authorized redirect URIs":

```
https://task-drive-manager.com/api/auth/callback/google
http://localhost:4000/api/auth/callback/google
```

### 7. Pull de la imagen y arrancar

```powershell
docker compose pull
docker compose up -d
```

Verificar:

```powershell
docker compose ps
docker compose logs -f web
```

La app debe responder en `localhost:4000` y en `https://task-drive-manager.com`.

## Actualizar a una nueva versión

```powershell
docker compose pull
docker compose up -d
```

## Logs y debugging

```powershell
# Ver logs en vivo
docker compose logs -f web

# Logs del tunnel
docker compose logs -f tunnel

# Entrar al container
docker compose exec web sh

# Healthcheck manual
curl http://localhost:4000/api/health
```

## Backup

La fuente de verdad son las dos Google Sheets. **Hacer un backup periódico** (Archivo > Descargar > xlsx) de:
- El archivo principal de Tareas
- El archivo de `_Consorcios`

Los archivos de Drive ya están en la nube y no requieren backup manual.

## Rollback

Si una versión nueva rompe algo:

```powershell
# Ver tags disponibles
docker images ghcr.io/johnydeev/task-drive-manager

# Hacer rollback a un tag anterior
$env:IMAGE_TAG="sha-abc1234"; docker compose up -d
```
