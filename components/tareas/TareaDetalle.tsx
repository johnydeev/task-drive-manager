"use client";

import Link from "next/link";
import { cn, formatFecha, formatDateTime } from "@/lib/utils";
import { thumbUrl } from "@/lib/drive-url";
import { TareaForm } from "./TareaForm";
import { AccionesTarea } from "./AccionesTarea";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SuccessDialog } from "@/components/ui/SuccessDialog";
import { useTareaDetalle } from "./hooks/useTareaDetalle";
import { useUsuarios } from "@/hooks/edificios-queries";
import { displayName } from "@/lib/user-display";
import type { EstadoTarea, Prioridad, Tarea } from "@/types";
import { ArrowLeft, Edit3, FileDown, FileText, Film, Loader2, Trash2 } from "lucide-react";

const estadoBadge: Record<EstadoTarea, string> = {
  "Sin asignar": "bg-slate-100 text-slate-700 border-slate-200",
  Asignada: "bg-amber-100 text-amber-800 border-amber-200",
  Aceptada: "bg-indigo-100 text-indigo-800 border-indigo-200",
  "En Proceso": "bg-blue-100 text-blue-800 border-blue-200",
  "En Revisión": "bg-purple-100 text-purple-800 border-purple-200",
  Realizada: "bg-green-100 text-green-800 border-green-200",
};

const prioridadBadge: Record<Prioridad, string> = {
  Alta: "bg-red-100 text-red-800 border-red-200",
  Media: "bg-amber-100 text-amber-800 border-amber-200",
  Baja: "bg-slate-100 text-slate-700 border-slate-200",
};

export function TareaDetalle({ rowId }: { rowId: string }) {
  const {
    tareaQ,
    eliminar,
    asignar,
    transicionar,
    generarReporte,
    isAdmin,
    esAsignado,
    canEditFields,
    editing,
    setEditing,
    confirmDelete,
    setConfirmDelete,
    deleteDone,
    onEditSuccess,
    onDeleteDoneClose,
  } = useTareaDetalle(rowId);
  const usuariosQ = useUsuarios();

  if (tareaQ.isLoading) {
    return (
      <div className="px-4 py-10 text-center text-slate-500">
        <Loader2 className="mx-auto animate-spin" />
        <p className="mt-2 text-sm">Cargando tarea…</p>
      </div>
    );
  }

  if (tareaQ.isError || !tareaQ.data) {
    return (
      <div className="px-4 py-10 text-center">
        <p className="text-slate-600">No se pudo cargar la tarea.</p>
        <Link href="/tareas" className="mt-2 inline-block text-sm text-slate-900 underline">
          Volver al listado
        </Link>
      </div>
    );
  }

  // Narrowing local: tras los guards de arriba, tareaQ.data está definido.
  const t: Tarea = tareaQ.data;

  if (editing) {
    return (
      <div className="px-4 py-4 md:px-8 md:py-6 max-w-3xl mx-auto w-full">
        <button
          onClick={() => setEditing(false)}
          className="mb-3 flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft size={14} /> Cancelar edición
        </button>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-6">
          <TareaForm mode="edit" initial={t} onSubmitSuccess={onEditSuccess} />
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-4 md:px-8 md:py-6 max-w-3xl mx-auto w-full">
      <div className="flex items-center justify-between">
        <Link href="/tareas" className="flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
          <ArrowLeft size={14} /> Tareas
        </Link>
        <div className="flex items-center gap-2">
          {canEditFields && (
            <>
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Edit3 size={14} /> Editar
              </button>
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                <Trash2 size={14} /> Eliminar
              </button>
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Eliminar tarea"
        message={`Se va a eliminar "${t.objetivo || "esta tarea"}" y su carpeta de Drive se moverá a la papelera (recuperable). ¿Confirmás?`}
        loading={eliminar.isPending}
        onConfirm={() => eliminar.mutate()}
        onCancel={() => setConfirmDelete(false)}
      />

      <SuccessDialog open={deleteDone} message="Tarea eliminada exitosamente" onClose={onDeleteDoneClose} />

      {eliminar.isError && (
        <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          No se pudo eliminar la tarea.
        </div>
      )}

      <div className="mt-4 space-y-4">
        <header>
          <h2 className="text-xl font-semibold text-slate-900">{t.objetivo || "(sin objetivo)"}</h2>
          <p className="mt-1 text-sm text-slate-600">
            {t.edificio} · {t.dpto || "Sin especificar"}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={cn("rounded-full border px-2 py-0.5 text-xs", estadoBadge[t.estado])}>{t.estado}</span>
            <span className={cn("rounded-full border px-2 py-0.5 text-xs", prioridadBadge[t.prioridad])}>{t.prioridad}</span>
            {t.parteComun && (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700">
                Parte común
              </span>
            )}
          </div>
        </header>

        {/* Acciones del ciclo de vida — según rol y estado. */}
        <AccionesTarea
          t={t}
          isAdmin={isAdmin}
          esAsignado={esAsignado}
          asignar={asignar}
          transicionar={transicionar}
          usuarios={usuariosQ.data}
        />

        {/* Reporte PDF — descargar lo puede cualquiera; generar/regenerar solo admin. */}
        {(isAdmin || t.reporteUrl) && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-medium text-slate-700">Reporte PDF</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {t.reporteUrl && (
                <a
                  href={t.reporteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <FileDown size={14} /> Descargar reporte
                </a>
              )}
              {isAdmin && (
                <button
                  onClick={() => generarReporte.mutate()}
                  disabled={generarReporte.isPending}
                  className={cn(
                    "flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-60",
                    t.reporteUrl
                      ? "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                      : "bg-slate-900 text-white"
                  )}
                >
                  {generarReporte.isPending ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <FileText size={14} />
                  )}
                  {t.reporteUrl ? "Regenerar" : "Generar reporte"}
                </button>
              )}
            </div>
            {isAdmin && generarReporte.isError && (
              <p className="mt-1 text-xs text-red-600">No se pudo generar el reporte.</p>
            )}
            {isAdmin && t.estado === "Realizada" && !t.reporteUrl && (
              <p className="mt-2 text-xs text-slate-500">
                El reporte se genera automáticamente al cerrar la tarea. Si no apareció todavía, puede tardar unos segundos.
              </p>
            )}
          </div>
        )}

        <Section title="Datos">
          <Row label="Responsable">
            {t.asignadoA ? displayName(t.asignadoA, usuariosQ.data) : "Sin asignar"}
          </Row>
          <Row label="Fecha inicio">{formatFecha(t.fechaInicio)}</Row>
          <Row label="Fecha estimada">{formatFecha(t.fechaEstimada)}</Row>
          {t.fechaRealizado && <Row label="Fecha realizado">{formatFecha(t.fechaRealizado)}</Row>}
          {t.proveedor && <Row label="Proveedor">{t.proveedor}</Row>}
          {t.presupuesto != null && (
            <Row label="Presupuesto">${t.presupuesto.toLocaleString("es-AR")}</Row>
          )}
          <Row label="Supervisor">{displayName(t.supervisor, usuariosQ.data)}</Row>
          <Row label="Creada">{formatDateTime(t.rowId)}</Row>
        </Section>

        {t.informe && (
          <Section title="Informe">
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{t.informe}</p>
          </Section>
        )}

        {(t.comentarioEnProceso || t.comentarioRevision || t.comentarioRealizado) && (
          <Section title="Comentarios">
            {t.comentarioEnProceso && (
              <div>
                <p className="text-xs font-medium text-slate-500">En proceso</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{t.comentarioEnProceso}</p>
              </div>
            )}
            {t.comentarioRevision && (
              <div className="mt-2">
                <p className="text-xs font-medium text-slate-500">Revisión</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{t.comentarioRevision}</p>
              </div>
            )}
            {t.comentarioRealizado && (
              <div className="mt-2">
                <p className="text-xs font-medium text-slate-500">Cierre</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{t.comentarioRealizado}</p>
              </div>
            )}
          </Section>
        )}

        {t.imagenes.length > 0 && (
          <Section title={`Imágenes (${t.imagenes.length})`}>
            <div className="grid grid-cols-3 gap-2">
              {t.imagenes.map((url) => (
                <a key={url} href={url} target="_blank" rel="noreferrer" className="block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={thumbUrl(url, 800)} alt="" className="aspect-square w-full rounded-lg border border-slate-200 object-cover" />
                </a>
              ))}
            </div>
          </Section>
        )}

        {t.videos.length > 0 && (
          <Section title={`Videos (${t.videos.length})`}>
            <ul className="space-y-1">
              {t.videos.map((url) => (
                <li key={url}>
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 underline"
                  >
                    <Film size={14} /> Ver video
                  </a>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {t.documentos.length > 0 && (
          <Section title={`Documentos (${t.documentos.length})`}>
            <ul className="space-y-1">
              {t.documentos.map((url) => (
                <li key={url}>
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 underline"
                  >
                    <FileText size={14} /> Documento adjunto
                  </a>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-medium text-slate-700">{title}</h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between border-b border-slate-100 py-1.5 text-sm last:border-b-0">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-900 text-right">{children}</span>
    </div>
  );
}
