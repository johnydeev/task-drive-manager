// Sin acentos ni mayúsculas, para comparar y buscar. Compartida por Combobox y la lista.
export function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
