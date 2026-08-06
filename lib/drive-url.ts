// Convierte una URL de Drive (https://drive.google.com/file/d/{id}/view) en la URL
// de su thumbnail. Si la URL no tiene ese formato, la devuelve tal cual.
export function thumbUrl(url: string, size = 400): string {
  const m = url.match(/\/file\/d\/([^/]+)/);
  if (!m) return url;
  return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w${size}`;
}

// URL del logo del membrete, lista para un <img> o para el <Image> del PDF.
//
// El link que da "Compartir" en Drive (https://drive.google.com/file/d/{id}/view?usp=sharing)
// apunta a una PÁGINA HTML, no al archivo: pegado tal cual no renderiza en ningún lado.
// Se traduce al endpoint de thumbnail, que sí devuelve la imagen. Sin esto hay que armar
// la URL a mano, y es el error natural al configurar el membrete.
//
// Las rutas del propio sitio ("/mi-logo.png") y cualquier otra URL pasan sin tocar.
export function logoMembreteUrl(url: string | undefined, size = 400): string {
  const limpio = url?.trim();
  if (!limpio) return "";
  return thumbUrl(limpio, size);
}
