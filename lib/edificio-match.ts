// Comparación de nombres de edificio, tolerante a mayúsculas, acentos y espacios extra.
//
// Vive en su PROPIO módulo, sin dependencias, porque también la usan componentes de
// cliente (el panel de visitas). Si estuviera en lib/sheets/edificios.ts, importarla
// arrastraría `googleapis` al bundle del navegador y el build falla con
// "Can't resolve 'child_process' / 'fs'".
//
// Necesaria porque los edificios vienen de _Consorcios con el nombre canónico
// (ej. "BELGRANO 1429") pero otras hojas los referencian con el nombre de la app vieja
// (ej. "Belgrano 1429").

export function normalizeEdificio(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

export function edificioMatches(a: string, b: string): boolean {
  const na = normalizeEdificio(a);
  const nb = normalizeEdificio(b);
  return na !== "" && na === nb;
}
