import { describe, it, expect, vi } from "vitest";
import { compartirEnlace, compartirArchivo } from "./compartir";

const URL_PDF = "https://drive.google.com/file/d/abc/view";

describe("compartirEnlace", () => {
  it("usa el menú nativo cuando está disponible", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const r = await compartirEnlace({ url: URL_PDF, titulo: "Visita" }, { share });
    expect(r).toBe("compartido");
    expect(share).toHaveBeenCalledWith({ title: "Visita", url: URL_PDF });
  });

  it("cae al portapapeles si no hay menú nativo", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const r = await compartirEnlace({ url: URL_PDF }, { clipboard: { writeText } });
    expect(r).toBe("copiado");
    expect(writeText).toHaveBeenCalledWith(URL_PDF);
  });

  // Cerrar el menú nativo sin elegir destino lanza AbortError: es una cancelación del
  // usuario, no un fallo — no hay que copiar al portapapeles ni mostrar error.
  it("devuelve 'cancelado' si el usuario cierra el menú nativo", async () => {
    const share = vi.fn().mockRejectedValue(
      Object.assign(new Error("Share canceled"), { name: "AbortError" })
    );
    const writeText = vi.fn();
    const r = await compartirEnlace({ url: URL_PDF }, { share, clipboard: { writeText } });
    expect(r).toBe("cancelado");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("si el menú nativo falla de verdad, cae al portapapeles", async () => {
    const share = vi.fn().mockRejectedValue(new Error("NotAllowedError"));
    const writeText = vi.fn().mockResolvedValue(undefined);
    const r = await compartirEnlace({ url: URL_PDF }, { share, clipboard: { writeText } });
    expect(r).toBe("copiado");
  });

  it("devuelve error si no hay ninguna vía", async () => {
    expect(await compartirEnlace({ url: URL_PDF }, {})).toBe("error");
  });

  it("devuelve error si el portapapeles rechaza", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    expect(await compartirEnlace({ url: URL_PDF }, { clipboard: { writeText } })).toBe("error");
  });
});

describe("compartirArchivo", () => {
  const archivo = new File(["x"], "visita.pdf", { type: "application/pdf" });

  it("comparte el archivo cuando el dispositivo lo soporta", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn().mockReturnValue(true);
    const r = await compartirArchivo({ archivo, titulo: "Visita" }, { share, canShare });
    expect(r).toBe("compartido");
    expect(share).toHaveBeenCalledWith({ files: [archivo], title: "Visita" });
  });

  it("devuelve 'no-soportado' si canShare rechaza los archivos", async () => {
    const share = vi.fn();
    const canShare = vi.fn().mockReturnValue(false);
    const r = await compartirArchivo({ archivo }, { share, canShare });
    expect(r).toBe("no-soportado");
    expect(share).not.toHaveBeenCalled();
  });

  it("devuelve 'no-soportado' si no hay Web Share", async () => {
    expect(await compartirArchivo({ archivo }, {})).toBe("no-soportado");
  });

  it("respeta la cancelación del usuario", async () => {
    const share = vi.fn().mockRejectedValue(
      Object.assign(new Error("cancel"), { name: "AbortError" })
    );
    const r = await compartirArchivo({ archivo }, { share, canShare: () => true });
    expect(r).toBe("cancelado");
  });
});
