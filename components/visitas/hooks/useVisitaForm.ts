"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { EDIFICIO_FICHA_VACIA, type EdificioFicha, type Visita } from "@/types";

type DatosFicha = Omit<EdificioFicha, "edificio" | "actualizadoEn">;

export function useVisitaForm() {
  const router = useRouter();
  const [edificio, setEdificio] = useState("");
  const fichaVacia = useMemo(() => ({ ...EDIFICIO_FICHA_VACIA }), []);
  const [ficha, setFicha] = useState<DatosFicha>(fichaVacia);
  const [controles, setControles] = useState<Record<string, "Realizada" | "No realizada">>({});
  const [informeGeneral, setInformeGeneral] = useState("");
  const [fotos, setFotos] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const edificiosQ = useQuery({
    queryKey: ["edificios"],
    queryFn: api.edificios.list,
    staleTime: 5 * 60_000,
  });

  // Al elegir el edificio se traen sus datos fijos para no reescribirlos (decisión 2).
  const fichaQ = useQuery({
    queryKey: ["edificio-ficha", edificio],
    enabled: !!edificio,
    queryFn: async (): Promise<EdificioFicha> => {
      const res = await fetch(`/api/edificio-ficha?edificio=${encodeURIComponent(edificio)}`);
      if (!res.ok) throw new Error("No se pudo cargar la ficha del edificio");
      return res.json();
    },
  });

  useEffect(() => {
    if (!fichaQ.data) return;
    const { edificio: _e, actualizadoEn: _a, ...datos } = fichaQ.data;
    void _e;
    void _a;
    setFicha(datos);
  }, [fichaQ.data]);

  // Las fotos se suben a Drive apenas se eligen, antes de guardar la visita. Si el
  // formulario se abandona, quedarían huérfanas en la carpeta del consorcio: al
  // desmontar se mandan a la papelera.
  //
  // El ref con el guardado es CRÍTICO: después de guardar bien se navega a /informes y
  // el form se desmonta igual — sin esta guarda, borraría las fotos de la visita que
  // acaba de emitirse.
  const fotosRef = useRef<string[]>([]);
  const guardadaRef = useRef(false);

  // El cleanup de abajo corre una sola vez (deps vacías) y necesita las fotos del momento
  // del desmonte, no las del primer render: por eso el ref se sincroniza acá y no durante
  // el render (mutar un ref mientras se renderiza rompe las reglas de React).
  useEffect(() => {
    fotosRef.current = fotos;
  }, [fotos]);

  useEffect(() => {
    return () => {
      if (guardadaRef.current) return;
      for (const url of fotosRef.current) {
        // keepalive: el request tiene que sobrevivir a la navegación que lo dispara.
        void fetch(`/api/upload?url=${encodeURIComponent(url)}`, {
          method: "DELETE",
          keepalive: true,
        });
      }
    };
  }, []);

  // Visita recién emitida: sostiene el modal de éxito con las acciones sobre su PDF.
  // La navegación se difiere hasta que el usuario cierra el modal.
  const [emitida, setEmitida] = useState<Visita | null>(null);

  const guardar = useMutation({
    mutationFn: () => api.visitas.create({ edificio, ficha, controles, informeGeneral, fotos }),
    onSuccess: (visita) => {
      guardadaRef.current = true;
      setError(null);
      setEmitida(visita);
    },
    onError: (e: Error) => setError(e.message),
  });

  // Vuelve a la pestaña Visitas, no a Tareas: es donde queda la visita recién cargada.
  const cerrarEmitida = () => router.push("/informes?tab=visitas");

  const setControl = (clave: string, valor: "Realizada" | "No realizada") =>
    setControles((c) => ({ ...c, [clave]: valor }));

  const setCampoFicha = (campo: keyof DatosFicha, valor: string) =>
    setFicha((f) => ({ ...f, [campo]: valor }));

  return {
    edificio,
    setEdificio,
    edificios: edificiosQ.data ?? [],
    ficha,
    setCampoFicha,
    cargandoFicha: fichaQ.isFetching,
    controles,
    setControl,
    informeGeneral,
    setInformeGeneral,
    fotos,
    setFotos,
    guardar,
    error,
    emitida,
    cerrarEmitida,
  };
}
