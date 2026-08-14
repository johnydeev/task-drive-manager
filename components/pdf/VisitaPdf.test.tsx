// @vitest-environment node
import { describe, it, expect } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { VisitaPdf } from "./VisitaPdf";
import { CONFIGURACION_DEFAULT, EDIFICIO_FICHA_VACIA } from "@/types";

// Cuenta las páginas del PDF generado, para fijar dónde caen las fotos.
function paginas(buffer: Buffer): number {
  return (buffer.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}

function render(fotos: string[]) {
  return renderToBuffer(
    <VisitaPdf
      edificio="ALMIRANTE BROWN 706"
      fecha="2026-08-12"
      ficha={{ edificio: "ALMIRANTE BROWN 706", ...EDIFICIO_FICHA_VACIA }}
      controles={{ hall: "Realizada", cochera: "No realizada" }}
      informeGeneral="Todo en orden."
      fotos={fotos}
      supervisorNombre="Supervisor de Prueba"
      config={CONFIGURACION_DEFAULT}
    />
  );
}

// URLs inexistentes: react-pdf loguea el fallo pero mantiene el tamaño reservado, que es
// lo que importa para verificar la paginación.
const foto = (n: number) => `https://example.com/foto-${n}.jpg`;
const fotos = (n: number) => Array.from({ length: n }, (_, i) => foto(i));

describe("VisitaPdf — dónde caen las cosas", () => {
  it("sin fotos entra todo en una hoja", async () => {
    expect(paginas(await render([]))).toBe(1);
  }, 30_000);

  // Las fotos son anexo: arrancan en hoja nueva aunque sobre lugar en la primera, así el
  // informe general se queda con todo el espacio libre.
  it("con una sola foto igual la manda a la segunda hoja", async () => {
    expect(paginas(await render(fotos(1)))).toBe(2);
  }, 30_000);

  it("entran 6 fotos por hoja (2 por fila, 3 filas)", async () => {
    expect(paginas(await render(fotos(6)))).toBe(2);
  }, 30_000);

  it("la séptima foto abre una hoja más", async () => {
    expect(paginas(await render(fotos(7)))).toBe(3);
  }, 30_000);

  it("12 fotos ocupan dos hojas de anexo", async () => {
    expect(paginas(await render(fotos(12)))).toBe(3);
  }, 30_000);
});
