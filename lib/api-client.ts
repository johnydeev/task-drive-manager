// Cliente HTTP tipado del lado del browser.
// No usar desde el servidor — para eso están las funciones de google-sheets directamente.

import type {
  Asignacion,
  Configuracion,
  Directiva,
  DirectivaNuevaInput,
  DirectivaPatchInput,
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
  proveedores: {
    list: () => request<string[]>("/api/proveedores"),
  },
  partesComunes: {
    list: () => request<string[]>("/api/partes-comunes"),
    add: (nombre: string) =>
      request<{ nombre: string }>("/api/partes-comunes", {
        method: "POST",
        body: JSON.stringify({ nombre }),
      }),
  },
  tareas: {
    list: (filters: {
      edificio?: string;
      estado?: EstadoTarea;
      prioridad?: Prioridad;
      supervisor?: string;
      asignado?: string;
      sinAsignar?: boolean;
      desde?: string;
      hasta?: string;
    } = {}) => {
      const p = new URLSearchParams();
      for (const [k, v] of Object.entries(filters)) {
        if (v === undefined || v === false || v === "") continue;
        p.set(k, v === true ? "1" : String(v));
      }
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
    asignar: (rowId: string, asignadoA: string) =>
      request<Tarea>(`/api/tareas/${encodeURIComponent(rowId)}`, {
        method: "PATCH",
        body: JSON.stringify({ asignadoA }),
      }),
    transicionar: (
      rowId: string,
      input: {
        accion: "aceptar" | "empezar" | "revisar" | "cerrar" | "comentar";
        comentario?: string;
        nota?: string;
      }
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
    remove: (rowId: string) =>
      request<{ ok: true }>(`/api/tareas/${encodeURIComponent(rowId)}`, {
        method: "DELETE",
      }),
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
  asignaciones: {
    list: () => request<Asignacion[]>("/api/asignaciones"),
    sinAsignar: () => request<string[]>("/api/asignaciones/sin-asignar"),
    add: (email: string, edificio: string) =>
      request<Asignacion>("/api/asignaciones", {
        method: "POST",
        body: JSON.stringify({ email, edificio }),
      }),
    remove: (email: string, edificio: string) =>
      request<{ ok: true }>(
        `/api/asignaciones?email=${encodeURIComponent(email)}&edificio=${encodeURIComponent(edificio)}`,
        { method: "DELETE" }
      ),
  },
  directivas: {
    list: () => request<Directiva[]>("/api/directivas"),
    create: (input: DirectivaNuevaInput) =>
      request<Directiva>("/api/directivas", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    remove: (id: string) =>
      request<{ ok: true }>(`/api/directivas?id=${encodeURIComponent(id)}`, { method: "DELETE" }),
    patch: (input: DirectivaPatchInput) =>
      request<Directiva>("/api/directivas", { method: "PATCH", body: JSON.stringify(input) }),
  },
  upload: Object.assign(
    async (
      file: File,
      edificio: string,
      objetivo: string,
      dpto: string,
      rowId: string
    ): Promise<{ url: string; kind: "imagen" | "video" | "documento" }> => {
      const form = new FormData();
      form.append("file", file);
      form.append("edificio", edificio);
      form.append("objetivo", objetivo);
      form.append("dpto", dpto);
      form.append("rowId", rowId);
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
    {
      // Manda a papelera de Drive un archivo ya subido (por su URL).
      remove: (url: string) =>
        request<{ ok: true }>(`/api/upload?url=${encodeURIComponent(url)}`, { method: "DELETE" }),
    }
  ),
};
