// Cliente HTTP tipado del lado del browser.
// No usar desde el servidor — para eso están las funciones de google-sheets directamente.

import type {
  Configuracion,
  Dpto,
  Edificio,
  EstadoTarea,
  Prioridad,
  Tarea,
  TareaNuevaInput,
  Usuario,
} from "@/types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let message = `Error ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  edificios: {
    list: () => request<Edificio[]>("/api/edificios"),
  },
  dptos: {
    list: (edificio?: string) =>
      request<Dpto[]>(
        edificio ? `/api/dptos?edificio=${encodeURIComponent(edificio)}` : "/api/dptos"
      ),
  },
  tareas: {
    list: (filters: {
      edificio?: string;
      estado?: EstadoTarea;
      prioridad?: Prioridad;
      supervisor?: string;
      desde?: string;
      hasta?: string;
    } = {}) => {
      const p = new URLSearchParams();
      for (const [k, v] of Object.entries(filters)) if (v) p.set(k, v);
      const q = p.toString();
      return request<Tarea[]>(q ? `/api/tareas?${q}` : "/api/tareas");
    },
    get: (rowId: string) =>
      request<Tarea>(`/api/tareas/${encodeURIComponent(rowId)}`),
    create: (input: TareaNuevaInput) =>
      request<Tarea>("/api/tareas", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    update: (rowId: string, input: Partial<TareaNuevaInput> & {
      comentarioEnProceso?: string;
      comentarioRealizado?: string;
      fechaRealizado?: string;
    }) =>
      request<Tarea>(`/api/tareas/${encodeURIComponent(rowId)}`, {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    patchEstado: (
      rowId: string,
      input: { estado: EstadoTarea; comentarioEnProceso?: string; comentarioRealizado?: string }
    ) =>
      request<Tarea>(`/api/tareas/${encodeURIComponent(rowId)}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    generarReporte: (rowId: string) =>
      request<{ reporteUrl: string }>(
        `/api/tareas/${encodeURIComponent(rowId)}/reporte`,
        { method: "POST" }
      ),
  },
  usuarios: {
    list: () => request<Usuario[]>("/api/usuarios"),
    create: (input: { email: string; nombre: string; rol: "admin" | "supervisor"; activo?: boolean }) =>
      request<Usuario>("/api/usuarios", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    setActivo: (email: string, activo: boolean) =>
      request<{ ok: true }>(
        `/api/usuarios?email=${encodeURIComponent(email)}`,
        { method: "PATCH", body: JSON.stringify({ activo }) }
      ),
  },
  configuracion: {
    get: () => request<Configuracion>("/api/configuracion"),
    update: (input: Configuracion) =>
      request<Configuracion>("/api/configuracion", {
        method: "PUT",
        body: JSON.stringify(input),
      }),
  },
  upload: async (
    file: File,
    edificio: string,
    objetivo: string
  ): Promise<{ url: string; kind: "imagen" | "video" | "documento" }> => {
    const form = new FormData();
    form.append("file", file);
    form.append("edificio", edificio);
    form.append("objetivo", objetivo);
    const res = await fetch("/api/upload", { method: "POST", body: form });
    if (!res.ok) {
      let message = `Error ${res.status}`;
      try {
        const body = await res.json();
        if (body?.error) message = body.error;
      } catch {}
      throw new Error(message);
    }
    return res.json();
  },
};
