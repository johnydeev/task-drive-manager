import { getSheetId } from "../google-auth";
import type { Configuracion } from "@/types";
import { CONFIGURACION_DEFAULT } from "@/types";
import { isDemoMode } from "../demo-mode";
import { getDemoConfig, updateDemoConfig } from "../demo-data";
import { getSheets, readRange, SHEETS } from "./core";

const CONFIG_TTL_MS = 5 * 60 * 1000;
let configCache: { data: Configuracion; expires: number } | null = null;

// Limpia el cache en memoria. Pensado para los tests: el TTL de 5 min vive a nivel de
// módulo, así que sin esto un test se lleva puesto lo que cacheó el anterior.
// Espejo de resetDemoState() en lib/demo-data.ts.
export function resetConfigCache(): void {
  configCache = null;
}

export async function getConfiguracion(): Promise<Configuracion> {
  if (isDemoMode()) return getDemoConfig();
  if (configCache && configCache.expires > Date.now()) return configCache.data;

  try {
    const rows = await readRange(`${SHEETS.configuracion}!A2:B`);
    const map = new Map<string, string>();
    for (const r of rows) {
      if (r[0]) map.set(r[0].trim(), (r[1] ?? "").toString().trim());
    }

    const data: Configuracion = {
      maxImagenes: Number(map.get("max_imagenes")) || CONFIGURACION_DEFAULT.maxImagenes,
      maxVideos: Number(map.get("max_videos")) || CONFIGURACION_DEFAULT.maxVideos,
      maxDocumentos: Number(map.get("max_documentos")) || CONFIGURACION_DEFAULT.maxDocumentos,
      maxSizeImagenMB: Number(map.get("max_size_imagen_mb")) || CONFIGURACION_DEFAULT.maxSizeImagenMB,
      maxSizeVideoMB: Number(map.get("max_size_video_mb")) || CONFIGURACION_DEFAULT.maxSizeVideoMB,
      maxSizePdfMB: Number(map.get("max_size_pdf_mb")) || CONFIGURACION_DEFAULT.maxSizePdfMB,
      membreteNombre: map.get("membrete_nombre") ?? "",
      membreteEmail: map.get("membrete_email") ?? "",
      membreteDireccion: map.get("membrete_direccion") ?? "",
      membreteTelefono: map.get("membrete_telefono") ?? "",
      membreteLogoUrl: map.get("membrete_logo_url") ?? "",
    };

    configCache = { data, expires: Date.now() + CONFIG_TTL_MS };
    return data;
  } catch {
    return CONFIGURACION_DEFAULT;
  }
}

export async function updateConfiguracion(cfg: Configuracion): Promise<void> {
  if (isDemoMode()) {
    updateDemoConfig(cfg);
    return;
  }
  // Se escriben TODAS las claves juntas, en orden fijo: el update pisa el rango completo
  // A2:B{n+1}, así que dejar afuera las del membrete equivaldría a no guardarlas nunca.
  const entries: [string, string | number][] = [
    ["max_imagenes", cfg.maxImagenes],
    ["max_videos", cfg.maxVideos],
    ["max_documentos", cfg.maxDocumentos],
    ["max_size_imagen_mb", cfg.maxSizeImagenMB],
    ["max_size_video_mb", cfg.maxSizeVideoMB],
    ["max_size_pdf_mb", cfg.maxSizePdfMB],
    ["membrete_nombre", cfg.membreteNombre],
    ["membrete_email", cfg.membreteEmail],
    ["membrete_direccion", cfg.membreteDireccion],
    ["membrete_telefono", cfg.membreteTelefono],
    ["membrete_logo_url", cfg.membreteLogoUrl],
  ];

  // Estrategia simple: limpiar y reescribir desde A2.
  await getSheets().spreadsheets.values.update({
    spreadsheetId: getSheetId(),
    range: `${SHEETS.configuracion}!A2:B${entries.length + 1}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: entries },
  });

  configCache = { data: cfg, expires: Date.now() + CONFIG_TTL_MS };
}
