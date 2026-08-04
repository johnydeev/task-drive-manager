"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { agruparParaInforme, nombreArchivoInforme } from "@/lib/informes";

// Primer día del mes actual y hoy, en formato ISO corto (lo que espera <input type="date">).
function rangoPorDefecto(): { desde: string; hasta: string } {
  const hoy = new Date();
  const primero = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { desde: iso(primero), hasta: iso(hoy) };
}

export function useInforme() {
  const inicial = useMemo(() => rangoPorDefecto(), []);
  const [edificio, setEdificio] = useState("");
  const [desde, setDesde] = useState(inicial.desde);
  const [hasta, setHasta] = useState(inicial.hasta);
  const [errorExport, setErrorExport] = useState<string | null>(null);

  const edificiosQ = useQuery({
    queryKey: ["edificios"],
    queryFn: api.edificios.list,
    staleTime: 5 * 60_000,
  });

  const configQ = useQuery({ queryKey: ["configuracion"], queryFn: api.configuracion.get });

  const tareasQ = useQuery({
    queryKey: ["informe", edificio, desde, hasta],
    queryFn: () => api.tareas.list({ edificio, desde, hasta }),
    enabled: !!edificio,
  });

  const grupos = useMemo(() => agruparParaInforme(tareasQ.data ?? []), [tareasQ.data]);
  const total = tareasQ.data?.length ?? 0;

  // La descarga no puede ir por api-client (devuelve JSON): se pide el blob y se dispara
  // un <a download> temporal.
  const exportar = useMutation({
    mutationFn: async () => {
      const p = new URLSearchParams({ edificio });
      if (desde) p.set("desde", desde);
      if (hasta) p.set("hasta", hasta);
      const res = await fetch(`/api/informes/pdf?${p.toString()}`);
      if (!res.ok) throw new Error("No se pudo generar el PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nombreArchivoInforme(edificio, desde, hasta);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
    onSuccess: () => setErrorExport(null),
    onError: (e: Error) => setErrorExport(e.message),
  });

  return {
    edificio,
    setEdificio,
    desde,
    setDesde,
    hasta,
    setHasta,
    edificios: edificiosQ.data ?? [],
    config: configQ.data,
    grupos,
    total,
    cargando: tareasQ.isLoading,
    error: tareasQ.isError,
    exportar,
    errorExport,
  };
}
