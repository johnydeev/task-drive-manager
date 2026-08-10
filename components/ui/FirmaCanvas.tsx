"use client";

import { useRef, useState } from "react";
import { Eraser, Loader2, Save } from "lucide-react";

interface Props {
  onGuardar: (blob: Blob) => void;
  guardando: boolean;
}

// Recuadro para firmar con el dedo o el mouse. Usa Pointer Events: un solo camino
// para touch y mouse, sin dependencias externas.
export function FirmaCanvas({ onGuardar, guardando }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);
  const [tieneTrazo, setTieneTrazo] = useState(false);

  const ctx = () => canvasRef.current?.getContext("2d") ?? null;

  // El canvas tiene un buffer fijo (480x160) pero se muestra estirado con `w-full`.
  // Las coordenadas del puntero vienen en píxeles de pantalla: hay que pasarlas a la
  // escala del buffer, si no el trazo aparece corrido respecto del cursor.
  const posicion = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const escalaX = rect.width > 0 ? canvas.width / rect.width : 1;
    const escalaY = rect.height > 0 ? canvas.height / rect.height : 1;
    return {
      x: (e.clientX - rect.left) * escalaX,
      y: (e.clientY - rect.top) * escalaY,
    };
  };

  const empezar = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = ctx();
    if (!c) return;
    dibujando.current = true;
    setTieneTrazo(true);
    c.lineWidth = 2;
    c.lineCap = "round";
    c.strokeStyle = "#0f172a";
    const { x, y } = posicion(e);
    c.beginPath();
    c.moveTo(x, y);
  };

  const mover = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dibujando.current) return;
    const c = ctx();
    if (!c) return;
    const { x, y } = posicion(e);
    c.lineTo(x, y);
    c.stroke();
  };

  const soltar = () => {
    dibujando.current = false;
  };

  const borrar = () => {
    const c = ctx();
    const canvas = canvasRef.current;
    if (c && canvas) c.clearRect(0, 0, canvas.width, canvas.height);
    setTieneTrazo(false);
  };

  const guardar = () => {
    canvasRef.current?.toBlob((blob) => {
      if (blob) onGuardar(blob);
    }, "image/png");
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        data-testid="firma-canvas"
        width={480}
        height={160}
        onPointerDown={empezar}
        onPointerMove={mover}
        onPointerUp={soltar}
        onPointerLeave={soltar}
        className="w-full touch-none rounded-lg border border-dashed border-slate-300 bg-white"
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={borrar}
          className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          <Eraser size={14} /> Borrar
        </button>
        <button
          type="button"
          onClick={guardar}
          disabled={!tieneTrazo || guardando}
          className="flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60 disabled:hover:bg-slate-900"
        >
          {guardando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Guardar firma
        </button>
      </div>
    </div>
  );
}
