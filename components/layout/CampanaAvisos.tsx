"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { formatDistance } from "date-fns";
import { es } from "date-fns/locale";
import { AVISOS_KEY, useAvisos } from "@/hooks/queries";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { AvisoGuardado } from "@/types";

type Datos = { avisos: AvisoGuardado[]; noLeidos: number };

function haceCuanto(iso: string, ahora: number): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  return formatDistance(new Date(t), new Date(ahora), { addSuffix: true, locale: es });
}

// Campana con badge de no leídos y panel con el historial (30 días). Al abrir se marcan
// todos leídos (optimista + PATCH); los que estaban sin leer al abrir siguen en negrita
// hasta que se cierre, para que se vea qué era nuevo.
export function CampanaAvisos() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data, isError } = useAvisos();
  const [abierto, setAbierto] = useState(false);
  const [nuevosAlAbrir, setNuevosAlAbrir] = useState<Set<string>>(() => new Set());
  const [ahora, setAhora] = useState(() => Date.now());
  const raiz = useRef<HTMLDivElement>(null);

  // Un push recibido con la app abierta: el SW avisa y refrescamos sin esperar el polling.
  useEffect(() => {
    const refrescar = () => void queryClient.invalidateQueries({ queryKey: AVISOS_KEY });
    window.addEventListener("aviso-nuevo", refrescar);
    return () => window.removeEventListener("aviso-nuevo", refrescar);
  }, [queryClient]);

  // Cierra con click afuera o Escape.
  useEffect(() => {
    if (!abierto) return;
    const onMouseDown = (e: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAbierto(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [abierto]);

  const avisos = data?.avisos ?? [];
  const noLeidos = data?.noLeidos ?? 0;

  const abrir = () => {
    setAhora(Date.now());
    setNuevosAlAbrir(new Set(avisos.filter((a) => !a.leidoEn).map((a) => a.id)));
    setAbierto(true);
    if (noLeidos === 0) return;
    const leidoEn = new Date().toISOString();
    queryClient.setQueryData<Datos>(AVISOS_KEY, (prev) =>
      prev
        ? { avisos: prev.avisos.map((a) => ({ ...a, leidoEn: a.leidoEn ?? leidoEn })), noLeidos: 0 }
        : prev
    );
    api.avisos.leer().catch(() => queryClient.invalidateQueries({ queryKey: AVISOS_KEY }));
  };

  const elegir = (a: AvisoGuardado) => {
    setAbierto(false);
    router.push(a.url);
  };

  return (
    <div ref={raiz} className="relative">
      <button
        type="button"
        aria-label="Avisos"
        aria-expanded={abierto}
        onClick={() => (abierto ? setAbierto(false) : abrir())}
        className="relative rounded-lg p-1.5 text-slate-700 hover:bg-slate-100"
      >
        <Bell size={20} />
        {noLeidos > 0 && (
          <span
            data-testid="avisos-badge"
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-none text-white"
          >
            {noLeidos > 9 ? "9+" : noLeidos}
          </span>
        )}
      </button>

      {abierto && (
        <div
          role="dialog"
          aria-label="Avisos"
          className="absolute right-0 top-full z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white shadow-lg"
        >
          <div className="border-b border-slate-100 px-4 py-2 text-sm font-semibold text-slate-900">Avisos</div>
          <div className="max-h-[70vh] overflow-y-auto">
            {isError ? (
              <p className="px-4 py-6 text-center text-sm text-slate-500">No se pudieron cargar los avisos</p>
            ) : avisos.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-500">Sin avisos</p>
            ) : (
              <ul>
                {avisos.map((a) => {
                  const nuevo = nuevosAlAbrir.has(a.id);
                  return (
                    <li key={a.id} className="border-b border-slate-100 last:border-b-0">
                      <button
                        type="button"
                        onClick={() => elegir(a)}
                        className={cn(
                          "block w-full px-4 py-3 text-left hover:bg-slate-50",
                          nuevo && "bg-blue-50/40"
                        )}
                      >
                        <p className={cn("text-sm text-slate-900", nuevo && "font-semibold")}>{a.titulo}</p>
                        {a.cuerpo && <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">{a.cuerpo}</p>}
                        <p className="mt-1 text-[11px] text-slate-400">{haceCuanto(a.creadoEn, ahora)}</p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
