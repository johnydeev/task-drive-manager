import type { MetadataRoute } from "next";

// Manifest de la PWA. Next 16 genera /manifest.webmanifest a partir de este archivo.
// Cambiar valores acá no requiere otros ajustes — los <link rel="manifest"> se inyectan solos.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Administración Morinigo",
    short_name: "Morinigo",
    description: "Gestión de tareas y seguimiento de consorcios",
    start_url: "/tareas",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // Theme: slate-blue del logo, para que el status bar del celu se integre con el header.
    theme_color: "#7c92aa",
    background_color: "#f8fafc",
    lang: "es-AR",
    categories: ["productivity", "business"],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    // Shortcuts: accesos directos al hacer long-press del ícono en Android.
    shortcuts: [
      {
        name: "Nueva tarea",
        short_name: "Nueva",
        description: "Crear una tarea rápidamente",
        url: "/tareas/nueva",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Dashboard",
        short_name: "Dashboard",
        description: "Ver KPIs y análisis",
        url: "/dashboard",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
