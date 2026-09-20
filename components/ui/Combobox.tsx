"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { normalizar } from "@/lib/texto";

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  // strict: solo se puede elegir una opción. Lo tipeado que no coincide se descarta al salir.
  strict?: boolean;
  "aria-label"?: string;
}

// Combobox: input con dropdown estilado (se despliega debajo, como un select) que filtra
// las opciones mientras se escribe. Sin `strict` además permite tipear un valor nuevo
// (proveedor). Con `strict` el texto del input es estado interno y `onChange` solo dispara
// al elegir una opción o al vaciar (edificio).
export function Combobox({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  id,
  strict,
  "aria-label": ariaLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [texto, setTexto] = useState(value);
  // El valor puede cambiar desde afuera (reset del form, URL): resincronizar el texto.
  // Patrón "ajustar estado durante el render" (sin efecto) para evitar un render extra.
  const [valorPrevio, setValorPrevio] = useState(value);
  if (value !== valorPrevio) {
    setValorPrevio(value);
    setTexto(value);
  }
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useId();

  // strict: al salir, tomar la coincidencia exacta, vaciar, o revertir.
  const confirmar = () => {
    if (!strict) return;
    const t = texto.trim();
    if (t === "") {
      if (value !== "") onChange("");
      setTexto("");
      return;
    }
    const exacta = options.find((o) => normalizar(o) === normalizar(t));
    if (exacta) {
      if (exacta !== value) onChange(exacta);
      setTexto(exacta);
    } else {
      setTexto(value);
    }
  };

  // Cerrar al hacer click fuera.
  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  const mostrado = strict ? texto : value;
  const filtered = useMemo(() => {
    const q = normalizar(mostrado.trim());
    // strict recién enfocado (texto === value): mostrar todo, no filtrar por lo ya elegido.
    if (!q || (strict && mostrado === value)) return options;
    return options.filter((o) => normalizar(o).includes(q));
  }, [options, mostrado, strict, value]);

  const openList = () => {
    setOpen(true);
    setHighlight(0);
  };

  const select = (opt: string) => {
    onChange(opt);
    setTexto(opt);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        openList();
        return;
      }
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      if (open && filtered[highlight]) {
        e.preventDefault();
        select(filtered[highlight]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      confirmar();
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <input
        id={id}
        type="text"
        className={strict && value ? "input pr-16" : "input pr-9"}
        value={mostrado}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        onChange={(e) => {
          if (strict) setTexto(e.target.value);
          else onChange(e.target.value);
          openList();
        }}
        onFocus={openList}
        onBlur={() => {
          setOpen(false);
          confirmar();
        }}
        onKeyDown={onKeyDown}
      />
      <div className="absolute inset-y-0 right-0 flex items-center">
        {strict && value && !disabled && (
          <button
            type="button"
            tabIndex={-1}
            aria-label="Limpiar"
            // Evita el blur del input (y su confirmar) antes del click.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onChange("");
              setTexto("");
            }}
            className="flex items-center px-1.5 text-slate-400 hover:text-slate-600"
          >
            <X size={14} />
          </button>
        )}
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          aria-label="Mostrar opciones"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setOpen((o) => !o)}
          className="flex items-center px-2 text-slate-400 disabled:opacity-50"
        >
          <ChevronDown
            size={16}
            className={open ? "rotate-180 transition-transform" : "transition-transform"}
          />
        </button>
      </div>

      {open && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {filtered.length === 0 && (
            <li className="px-3 py-2 text-sm text-slate-400">Sin opciones</li>
          )}
          {filtered.map((opt, i) => (
            <li
              key={opt}
              role="option"
              aria-selected={opt === value}
              onMouseDown={(e) => {
                // Evita que el blur del input cierre el dropdown antes del click.
                e.preventDefault();
                select(opt);
              }}
              onMouseEnter={() => setHighlight(i)}
              className={`cursor-pointer truncate px-3 py-2 text-sm ${
                i === highlight ? "bg-slate-100 text-slate-900" : "text-slate-700"
              }`}
            >
              {opt}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
