// Modo demo: bypasea Google Sheets/Drive y la auth real, devolviendo data fake.
// Se activa poniendo DEMO_MODE=1 en .env.local y reiniciando el dev server.
//
// Para desactivar: borrá esa línea (o ponela DEMO_MODE=) y reiniciá npm run dev.
//
// Cuando DEMO_MODE=1:
//   - Cualquier usuario "loguea" sin Google (sesión fake como admin)
//   - Las API routes devuelven datos hardcoded de lib/demo-data.ts
//   - Los uploads devuelven URLs de placeholder (no se sube a Drive)
//   - Un banner amarillo arriba de la app deja claro el modo

import type { Session } from "next-auth";

export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "1";
}

// Sesión fake usada cuando DEMO_MODE está activo. Rol admin para que puedas ver todas las
// secciones (incluso /usuarios y /configuracion que están restringidas a admin).
export function demoSession(): Session {
  return {
    user: {
      name: "Demo Admin",
      email: "demo@morinigo.local",
      image: null,
      rol: "admin",
      activo: true,
    },
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };
}
