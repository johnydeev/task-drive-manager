"use client";

import { CheckCircle2 } from "lucide-react";

interface Props {
  open: boolean;
  message: string;
  buttonLabel?: string;
  onClose: () => void;
}

// Modal informativo de éxito para operaciones (crear/editar/eliminar tarea).
export function SuccessDialog({ open, message, buttonLabel = "Aceptar", onClose }: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <CheckCircle2 className="mx-auto text-emerald-500" size={40} />
        <p className="mt-3 text-base font-medium text-slate-900">{message}</p>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          {buttonLabel}
        </button>
      </div>
    </div>
  );
}
