// Nombre visible de la app. Configurable por entorno para no atar el código a una marca
// concreta: el default sirve para la versión pública / demo, y cada despliegue puede fijar
// el suyo con NEXT_PUBLIC_APP_NAME / NEXT_PUBLIC_APP_SHORT_NAME (p. ej. la marca del cliente).
//
// ⚠ Son variables NEXT_PUBLIC_*: se resuelven en tiempo de BUILD. Para conservar una marca
// propia hay que setearlas al buildear (ver Dockerfile / docs/DEPLOY.md), no solo en runtime.
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME?.trim() || "Task Drive Manager";
export const APP_SHORT_NAME = process.env.NEXT_PUBLIC_APP_SHORT_NAME?.trim() || "Task Drive";
