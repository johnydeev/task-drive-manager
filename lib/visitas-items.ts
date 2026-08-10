// Los 15 controles del formulario de visita, en los dos bloques del papel.
// Viven UNA sola vez: los comparten el formulario y el PDF, así no pueden divergir.
// La lista es fija (decisión 4 del spec): cambiarla es cambiar código.

export type EstadoItemVisita = "Realizada" | "No realizada";

export interface ItemVisita {
  clave: string; // se usa como name del input y como key del payload
  label: string; // lo que ve el usuario y sale en el PDF
}

export interface BloqueVisita {
  titulo: string;
  items: ItemVisita[];
}

export const BLOQUES_VISITA: BloqueVisita[] = [
  {
    titulo: "Sectores",
    items: [
      { clave: "hall", label: "Hall" },
      { clave: "vereda", label: "Vereda" },
      { clave: "palieres", label: "Palieres" },
      { clave: "sotano", label: "Sótano" },
      { clave: "terraza", label: "Terraza" },
      { clave: "ascensores", label: "Ascensores" },
      { clave: "escaleras", label: "Escaleras" },
      { clave: "cochera", label: "Cochera" },
    ],
  },
  {
    titulo: "Instalaciones",
    items: [
      { clave: "sala_medidores", label: "Sala de Medidores" },
      { clave: "amenities", label: "Amenities" },
      { clave: "luz_palieres", label: "Luz de Palieres" },
      { clave: "luces_emergencia", label: "Luces de Emergencia" },
      { clave: "matafuegos", label: "Matafuegos" },
      { clave: "termotanque", label: "Termotanque" },
      { clave: "obleas", label: "Obleas" },
    ],
  },
];

export const ITEMS_VISITA: ItemVisita[] = BLOQUES_VISITA.flatMap((b) => b.items);

const CLAVES = new Set(ITEMS_VISITA.map((i) => i.clave));

export function esClaveItem(clave: string): boolean {
  return CLAVES.has(clave);
}
