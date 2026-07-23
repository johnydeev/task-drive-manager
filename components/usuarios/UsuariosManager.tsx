"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { cn, formatFecha } from "@/lib/utils";
import { Loader2, UserPlus } from "lucide-react";
import type { Rol } from "@/types";

export function UsuariosManager() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ email: "", nombre: "", rol: "supervisor" as Rol });
  const [error, setError] = useState<string | null>(null);

  const usuariosQ = useQuery({ queryKey: ["usuarios"], queryFn: api.usuarios.list });

  const createM = useMutation({
    mutationFn: () => api.usuarios.create({ ...form, activo: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["usuarios"] });
      setForm({ email: "", nombre: "", rol: "supervisor" });
      setShowForm(false);
      setError(null);
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Error al crear"),
  });

  const toggleM = useMutation({
    mutationFn: ({ email, activo }: { email: string; activo: boolean }) =>
      api.usuarios.setActivo(email, activo),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["usuarios"] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">
          {usuariosQ.data ? `${usuariosQ.data.length} usuario${usuariosQ.data.length !== 1 ? "s" : ""}` : "Cargando…"}
        </p>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          <UserPlus size={16} /> Nuevo
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.email || !form.nombre) {
              setError("Email y nombre son requeridos");
              return;
            }
            createM.mutate();
          }}
          className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4"
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">Email</span>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="input"
                placeholder="ejemplo@gmail.com"
                required
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">Nombre</span>
              <input
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                className="input"
                required
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">Rol</span>
              <select
                value={form.rol}
                onChange={(e) => setForm({ ...form, rol: e.target.value as Rol })}
                className="input"
              >
                <option value="supervisor">Supervisor</option>
                <option value="admin">Admin</option>
              </select>
            </label>
          </div>
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>
          )}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={createM.isPending}
              className="flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-60 disabled:hover:bg-slate-900"
            >
              {createM.isPending && <Loader2 size={14} className="animate-spin" />} Crear usuario
            </button>
          </div>
        </form>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Nombre</th>
              <th className="px-4 py-2">Rol</th>
              <th className="px-4 py-2">Creado</th>
              <th className="px-4 py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {usuariosQ.data?.map((u) => (
              <tr key={u.email} className="border-t border-slate-100">
                <td className="px-4 py-2 text-slate-900">{u.email}</td>
                <td className="px-4 py-2 text-slate-700">{u.nombre}</td>
                <td className="px-4 py-2">
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-xs",
                      u.rol === "admin"
                        ? "border-purple-200 bg-purple-50 text-purple-700"
                        : "border-slate-200 bg-slate-50 text-slate-700"
                    )}
                  >
                    {u.rol}
                  </span>
                </td>
                <td className="px-4 py-2 text-slate-600">{formatFecha(u.creadoEn)}</td>
                <td className="px-4 py-2">
                  <button
                    disabled={toggleM.isPending && toggleM.variables?.email === u.email}
                    onClick={() => toggleM.mutate({ email: u.email, activo: !u.activo })}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition",
                      u.activo
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        : "border-slate-300 bg-slate-100 text-slate-600 hover:bg-slate-200"
                    )}
                  >
                    {toggleM.isPending && toggleM.variables?.email === u.email && (
                      <Loader2 size={12} className="animate-spin" />
                    )}
                    {u.activo ? "Activo" : "Inactivo"}
                  </button>
                </td>
              </tr>
            ))}
            {usuariosQ.data?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  No hay usuarios cargados todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
