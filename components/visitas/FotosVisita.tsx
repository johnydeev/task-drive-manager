"use client";

import { useState } from "react";
import { Camera, Loader2, X } from "lucide-react";
import { thumbUrl } from "@/lib/drive-url";
import { apiFetch } from "@/lib/api-client";

interface Props {
  edificio: string;
  fotos: string[];
  onChange: (fotos: string[]) => void;
  disabled?: boolean;
}

// Fotos de la visita: se suben a Drive apenas se eligen y el PDF las embebe por URL.
// No se listan en la planilla (decisión 6 del spec): viven en el PDF y en la carpeta.
export function FotosVisita({ edificio, fotos, onChange, disabled }: Props) {
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cada foto se resuelve por separado. Antes un `throw` a mitad de la tanda descartaba
  // las que YA se habían subido a Drive: no entraban al formulario, no salían en el PDF
  // y quedaban huérfanas en la carpeta del consorcio. Ahora lo que subió, subió.
  const subir = async (files: FileList) => {
    setSubiendo(true);
    setError(null);

    const subidas: string[] = [];
    const fallidas: string[] = [];

    for (const file of Array.from(files)) {
      try {
        const form = new FormData();
        form.append("file", file);
        form.append("destino", "visita");
        form.append("edificio", edificio);
        const res = await apiFetch("/api/upload", { method: "POST", body: form });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? "No se pudo subir");
        }
        const { url } = (await res.json()) as { url: string };
        subidas.push(url);
      } catch (e) {
        fallidas.push(`${file.name}: ${e instanceof Error ? e.message : "no se pudo subir"}`);
      }
    }

    if (subidas.length > 0) onChange([...fotos, ...subidas]);
    if (fallidas.length > 0) setError(fallidas.join(" · "));
    setSubiendo(false);
  };

  return (
    <div>
      <label className="flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
        {subiendo ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
        Agregar fotos
        <input
          type="file"
          // Explícito en vez de `image/*`: así el selector del celular ya filtra los
          // formatos que el PDF no puede dibujar (HEIC), en vez de fallar al subir.
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          disabled={disabled || subiendo || !edificio}
          onChange={(e) => {
            if (e.target.files?.length) subir(e.target.files);
            e.target.value = "";
          }}
        />
      </label>

      {!edificio && <p className="mt-1 text-xs text-slate-500">Elegí primero el edificio.</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}

      {fotos.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {fotos.map((url) => (
            <li key={url} className="relative">
              {/* Imagen externa de Drive: <img> evita configurar remotePatterns. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={thumbUrl(url, 200)}
                alt=""
                className="h-20 w-20 rounded-lg border border-slate-200 object-cover"
              />
              <button
                type="button"
                onClick={() => {
                  onChange(fotos.filter((f) => f !== url));
                  // La foto ya está en Drive: sacarla del formulario también la manda a
                  // la papelera, si no queda huérfana en la carpeta del consorcio.
                  void apiFetch(`/api/upload?url=${encodeURIComponent(url)}`, { method: "DELETE" });
                }}
                aria-label="Quitar foto"
                className="absolute -right-1.5 -top-1.5 rounded-full bg-white p-0.5 text-slate-500 shadow hover:text-red-600"
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
