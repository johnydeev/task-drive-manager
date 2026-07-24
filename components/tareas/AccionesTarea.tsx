"use client";

import { useState } from "react";
import type { UseMutationResult } from "@tanstack/react-query";
import { formatDateTime, formatFecha } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { Tarea, Usuario } from "@/types";
import { Loader2 } from "lucide-react";

export type TransicionInput = {
  accion:
    | "aceptar"
    | "empezar"
    | "revisar"
    | "cerrar"
    | "comentar"
    | "objetar"
    | "editarComentarioProceso"
    | "editarComentarioRevision";
  comentario?: string;
  nota?: string;
};

// Estilos de botón compartidos (hover notorio + transición).
const BTN_DARK =
  "flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50 disabled:hover:bg-slate-900";
const BTN_OUTLINE =
  "flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50";
const BTN_GREEN =
  "flex items-center gap-1 rounded-lg bg-green-700 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-green-800 disabled:opacity-50 disabled:hover:bg-green-700";
const BTN_RED =
  "flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50 disabled:hover:bg-red-600";

// Panel de acciones del ciclo de vida de la tarea, según rol y estado.
// Cada estado muestra SOLO su paso: pasar a revisión es un paso aparte (se
// despliega al pedirlo), no un formulario más dentro de "En Proceso".
export function AccionesTarea({
  t,
  isAdmin,
  esAsignado,
  asignar,
  transicionar,
  usuarios,
}: {
  t: Tarea;
  isAdmin: boolean;
  esAsignado: boolean;
  asignar: UseMutationResult<Tarea, Error, string>;
  transicionar: UseMutationResult<Tarea, Error, TransicionInput>;
  usuarios?: Usuario[];
}) {
  const [nuevoAsignado, setNuevoAsignado] = useState("");
  const [comProceso, setComProceso] = useState(t.comentarioEnProceso ?? "");
  const [comRevision, setComRevision] = useState("");
  const [notaCierre, setNotaCierre] = useState("");
  // Paso explícito para mandar a revisión desde "En Proceso".
  const [pasandoARevision, setPasandoARevision] = useState(false);
  // Confirmación de las acciones destructivas/terminales del admin.
  const [confirmAccion, setConfirmAccion] = useState<null | "cerrar" | "objetar">(null);

  if (!isAdmin && !esAsignado) return null;

  const integrantes = (usuarios ?? []).filter((u) => u.activo);
  const puedeAsignar = isAdmin && (t.estado === "Sin asignar" || t.estado === "Asignada");
  const puedeCerrar = isAdmin && t.estado === "En Revisión";
  const trPend = (accion: string) => transicionar.isPending && transicionar.variables?.accion === accion;

  // Evita la tarjeta "Acciones" vacía en estados sin acción para el rol actual.
  const mostrarPanel =
    puedeAsignar ||
    puedeCerrar ||
    t.estado === "En Revisión" ||
    (esAsignado && ["Asignada", "Aceptada", "En Proceso", "Objetada"].includes(t.estado));
  if (!mostrarPanel) return null;

  // Fecha de cierre automático (revisionEn + 72h). Pura: no lee el reloj actual.
  const venceISO = t.revisionEn
    ? new Date(new Date(t.revisionEn).getTime() + 72 * 3600 * 1000).toISOString()
    : null;

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-center text-sm font-medium text-slate-700">Acciones</p>

      {puedeAsignar && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">
              {t.estado === "Sin asignar" ? "Asignar a" : "Reasignar a"}
            </span>
            <select value={nuevoAsignado} onChange={(e) => setNuevoAsignado(e.target.value)} className="input">
              <option value="">Elegí un integrante…</option>
              {integrantes.map((u) => (
                <option key={u.email} value={u.email}>{u.nombre || u.email}</option>
              ))}
            </select>
          </label>
          <button
            disabled={!nuevoAsignado || asignar.isPending}
            onClick={() => asignar.mutate(nuevoAsignado)}
            className={BTN_DARK}
          >
            {asignar.isPending && <Loader2 size={14} className="animate-spin" />}
            {t.estado === "Sin asignar" ? "Asignar" : "Reasignar"}
          </button>
        </div>
      )}

      {esAsignado && t.estado === "Asignada" && (
        <button
          disabled={trPend("aceptar")}
          onClick={() => transicionar.mutate({ accion: "aceptar" })}
          className={BTN_DARK}
        >
          {trPend("aceptar") && <Loader2 size={14} className="animate-spin" />}
          Aceptar tarea
        </button>
      )}

      {esAsignado && t.estado === "Aceptada" && (
        <button
          disabled={trPend("empezar")}
          onClick={() => transicionar.mutate({ accion: "empezar" })}
          className={BTN_DARK}
        >
          {trPend("empezar") && <Loader2 size={14} className="animate-spin" />}
          Comenzar en Proceso
        </button>
      )}

      {esAsignado && t.estado === "En Proceso" && (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm text-slate-600">Comentario (en proceso)</label>
            <textarea value={comProceso} onChange={(e) => setComProceso(e.target.value)} rows={2} className="input w-full" />
            <button
              disabled={transicionar.isPending}
              onClick={() => transicionar.mutate({ accion: "comentar", comentario: comProceso })}
              className={`mt-1 ${BTN_OUTLINE}`}
            >
              {trPend("comentar") && <Loader2 size={14} className="animate-spin" />}
              Guardar comentario
            </button>
          </div>

          {/* Paso siguiente: se inicia explícitamente y recién ahí pide su comentario.
              El botón primario aparece SOLO cuando ya hay un comentario en proceso guardado
              (dato del servidor, así también aparece al reabrir una tarea que ya lo tenía).
              Como el comentario es opcional, si no hay ninguno se ofrece una salida discreta. */}
          {!pasandoARevision ? (
            t.comentarioEnProceso?.trim() ? (
              <button onClick={() => setPasandoARevision(true)} className={BTN_DARK}>
                Pasar a En Revisión
              </button>
            ) : (
              <button
                onClick={() => setPasandoARevision(true)}
                className="text-sm text-slate-500 underline underline-offset-2 hover:text-slate-700"
              >
                pasar a revisión sin comentar
              </button>
            )
          ) : (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <label className="mb-1 block text-sm text-slate-600">Comentario de revisión (qué hiciste)</label>
              <textarea value={comRevision} onChange={(e) => setComRevision(e.target.value)} rows={2} className="input w-full" />
              <div className="mt-2 flex gap-2">
                <button
                  disabled={transicionar.isPending}
                  onClick={() => transicionar.mutate({ accion: "revisar", comentario: comRevision })}
                  className={BTN_DARK}
                >
                  {trPend("revisar") && <Loader2 size={14} className="animate-spin" />}
                  Confirmar y pasar a En Revisión
                </button>
                <button onClick={() => setPasandoARevision(false)} className={BTN_OUTLINE}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {t.estado === "En Revisión" && (
        <div className="space-y-2">
          {venceISO && <p className="text-xs text-purple-700">Cierre automático: {formatDateTime(venceISO)}</p>}
          {esAsignado && !isAdmin && (
            <p className="text-xs text-slate-500">Enviada a revisión. Esperando el cierre del admin.</p>
          )}
          {puedeCerrar && (
            <div>
              <label className="mb-1 block text-sm text-slate-600">
                Comentario (nota de cierre / motivo de objeción) <span className="text-red-600">*</span>
              </label>
              <textarea value={notaCierre} onChange={(e) => setNotaCierre(e.target.value)} rows={2} className="input w-full" />
              <div className="mt-1 flex gap-2">
                <button
                  disabled={!notaCierre.trim() || transicionar.isPending}
                  onClick={() => setConfirmAccion("cerrar")}
                  className={BTN_GREEN}
                >
                  {trPend("cerrar") && <Loader2 size={14} className="animate-spin" />}
                  Cerrar (dar por realizada)
                </button>
                <button
                  disabled={!notaCierre.trim() || transicionar.isPending}
                  onClick={() => setConfirmAccion("objetar")}
                  className={BTN_RED}
                >
                  {trPend("objetar") && <Loader2 size={14} className="animate-spin" />}
                  Objetar
                </button>
              </div>
              {!notaCierre.trim() && (
                <p className="mt-1 text-xs text-slate-500">
                  Escribí un comentario para poder cerrar u objetar.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {esAsignado && t.estado === "Objetada" && (
        <div className="space-y-2">
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
            <p className="text-xs font-medium text-red-700">
              Objeción del admin{t.objetadaEn ? ` - ${formatFecha(t.objetadaEn)}` : ""}
            </p>
            <p className="text-sm whitespace-pre-wrap text-red-800">{t.notaObjecion}</p>
          </div>
          <label className="mb-1 block text-sm text-slate-600">Comentario de revisión (qué corregiste)</label>
          <textarea value={comRevision} onChange={(e) => setComRevision(e.target.value)} rows={2} className="input w-full" />
          <button
            disabled={transicionar.isPending}
            onClick={() => transicionar.mutate({ accion: "revisar", comentario: comRevision })}
            className={BTN_DARK}
          >
            {trPend("revisar") && <Loader2 size={14} className="animate-spin" />}
            Reenviar a revisión
          </button>
        </div>
      )}

      {transicionar.isError && <p className="text-xs text-red-600">{transicionar.error?.message}</p>}
      {asignar.isError && <p className="text-xs text-red-600">{asignar.error?.message}</p>}

      <ConfirmDialog
        open={confirmAccion !== null}
        title={confirmAccion === "objetar" ? "Objetar tarea" : "Cerrar tarea"}
        message={
          confirmAccion === "objetar"
            ? "La tarea vuelve al responsable como Objetada, con tu comentario como motivo. ¿Confirmás?"
            : "Se va a dar por Realizada y se generará el reporte. Esta acción no se puede deshacer desde la app. ¿Confirmás?"
        }
        loading={transicionar.isPending}
        onConfirm={() => {
          if (confirmAccion) transicionar.mutate({ accion: confirmAccion, nota: notaCierre });
          setConfirmAccion(null);
        }}
        onCancel={() => setConfirmAccion(null)}
      />
    </div>
  );
}
