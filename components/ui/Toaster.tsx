"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Tipo = "success" | "error";
interface Toast {
  id: number;
  tipo: Tipo;
  mensaje: string;
}
interface Api {
  success: (mensaje: string) => void;
  error: (mensaje: string) => void;
}

const DURACION_MS = 4000;
const MAXIMO = 3;

// Sin provider (tests de hooks/componentes sueltos) los avisos se descartan en silencio.
const noop: Api = { success: () => {}, error: () => {} };
const ToastContext = createContext<Api>(noop);

export function useToast(): Api {
  return useContext(ToastContext);
}

// Avisos breves de éxito/error, apilados abajo (sobre el bottom nav en mobile). Se cierran
// solos a los 4 s o al tocarlos. Reemplazan los modales de "listo" que pedían un tap extra.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const siguienteId = useRef(1);

  const cerrar = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const agregar = useCallback(
    (tipo: Tipo, mensaje: string) => {
      const id = siguienteId.current++;
      setToasts((prev) => [...prev, { id, tipo, mensaje }].slice(-MAXIMO));
      window.setTimeout(() => cerrar(id), DURACION_MS);
    },
    [cerrar]
  );

  const api = useMemo<Api>(
    () => ({ success: (m) => agregar("success", m), error: (m) => agregar("error", m) }),
    [agregar]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6"
      >
        {toasts.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => cerrar(t.id)}
            className={cn(
              "pointer-events-auto flex max-w-sm items-center gap-2 rounded-full border bg-white px-4 py-2 text-sm shadow-lg",
              t.tipo === "success" ? "border-emerald-200 text-slate-800" : "border-red-200 text-red-800"
            )}
          >
            {t.tipo === "success" ? (
              <CheckCircle2 size={16} className="shrink-0 text-emerald-600" />
            ) : (
              <XCircle size={16} className="shrink-0 text-red-600" />
            )}
            {t.mensaje}
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
