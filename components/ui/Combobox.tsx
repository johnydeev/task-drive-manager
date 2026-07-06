"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  disabled?: boolean;
  id?: string;
}

// Normaliza para filtrar sin importar acentos/mayúsculas.
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

// Combobox: input con dropdown estilado (se despliega debajo, como un select),
// filtra las opciones mientras se escribe y además permite tipear un valor nuevo.
export function Combobox({ value, onChange, options, placeholder, disabled, id }: Props) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useId();

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

  const filtered = useMemo(() => {
    const q = normalize(value.trim());
    if (!q) return options;
    return options.filter((o) => normalize(o).includes(q));
  }, [options, value]);

  const openList = () => {
    setOpen(true);
    setHighlight(0);
  };

  const select = (opt: string) => {
    onChange(opt);
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
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <input
        id={id}
        type="text"
        className="input pr-9"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        onChange={(e) => {
          onChange(e.target.value);
          openList();
        }}
        onFocus={openList}
        onKeyDown={onKeyDown}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        aria-label="Mostrar opciones"
        onClick={() => setOpen((o) => !o)}
        className="absolute inset-y-0 right-0 flex items-center px-2 text-slate-400 disabled:opacity-50"
      >
        <ChevronDown size={16} className={open ? "rotate-180 transition-transform" : "transition-transform"} />
      </button>

      {open && filtered.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {filtered.map((opt, i) => (
            <li key={opt} role="option" aria-selected={opt === value}>
              <button
                type="button"
                onMouseDown={(e) => {
                  // Evita que el blur del input cierre el dropdown antes del click.
                  e.preventDefault();
                  select(opt);
                }}
                onMouseEnter={() => setHighlight(i)}
                className={`block w-full truncate px-3 py-2 text-left text-sm ${
                  i === highlight ? "bg-slate-100 text-slate-900" : "text-slate-700"
                }`}
              >
                {opt}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
