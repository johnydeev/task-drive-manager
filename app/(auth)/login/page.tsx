"use client";

import { signIn } from "next-auth/react";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

function LoginContent() {
  const [loading, setLoading] = useState(false);
  const params = useSearchParams();
  const from = params.get("from") || "/tareas";
  const error = params.get("error");

  const onClick = async () => {
    setLoading(true);
    await signIn("google", { callbackUrl: from });
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm border border-slate-200">
        <h1 className="text-2xl font-semibold text-slate-900">Gestión Morinigo</h1>
        <p className="mt-2 text-sm text-slate-600">
          Iniciá sesión con tu cuenta de Google autorizada por la administración.
        </p>

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {error === "AccessDenied"
              ? "Tu cuenta no tiene acceso. Pedile al administrador que te agregue."
              : "Hubo un problema al iniciar sesión. Intentá de nuevo."}
          </div>
        )}

        <button
          onClick={onClick}
          disabled={loading}
          className="mt-6 flex w-full items-center justify-center gap-3 rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
            <path
              fill="#FFC107"
              d="M21.8 10.2H12v3.7h5.6c-.5 2.3-2.5 3.9-5.6 3.9-3.4 0-6.1-2.7-6.1-6.1S8.6 5.6 12 5.6c1.5 0 2.9.5 4 1.4l2.7-2.7C16.9 2.7 14.6 1.8 12 1.8 6.5 1.8 2 6.3 2 11.8s4.5 10 10 10c5.8 0 9.6-4.1 9.6-9.8 0-.6-.1-1.2-.2-1.8z"
            />
            <path
              fill="#FF3D00"
              d="M3.2 7.3l3 2.2c.8-2 2.8-3.4 5.1-3.4 1.4 0 2.7.5 3.7 1.4l2.8-2.8C16.2 3 14.2 2 12 2 8 2 4.6 4.2 3.2 7.3z"
            />
            <path
              fill="#4CAF50"
              d="M12 22c2.6 0 4.9-1 6.6-2.6l-3-2.5c-.9.6-2.1 1-3.6 1-3.1 0-5.6-2-6.5-4.7l-3 2.3C4.4 19.5 7.9 22 12 22z"
            />
            <path
              fill="#1976D2"
              d="M21.8 10.2H12v3.7h5.6c-.3 1.2-1 2.2-2.1 3l3 2.5c-.2.2 3.3-2.4 3.3-7.4 0-.6-.1-1.2-.2-1.8z"
            />
          </svg>
          {loading ? "Conectando…" : "Continuar con Google"}
        </button>

        <p className="mt-6 text-xs text-slate-500">
          Solo emails registrados como supervisor o admin pueden ingresar.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
