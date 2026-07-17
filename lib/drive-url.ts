// Convierte una URL de Drive (https://drive.google.com/file/d/{id}/view) en la URL
// de su thumbnail. Si la URL no tiene ese formato, la devuelve tal cual.
export function thumbUrl(url: string, size = 400): string {
  const m = url.match(/\/file\/d\/([^/]+)/);
  if (!m) return url;
  return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w${size}`;
}
