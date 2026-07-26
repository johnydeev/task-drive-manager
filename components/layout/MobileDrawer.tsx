"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { useEffect } from "react";
import { Download, LogOut, X } from "lucide-react";
import type { ComponentType } from "react";

interface DrawerItem {
  href: string;
  label: string;
  Icon: ComponentType<{ size?: number }>;
}

interface Props {
  open: boolean;
  onClose: () => void;
  email?: string | null;
  items: DrawerItem[];
  canInstall?: boolean;
  onInstall?: () => void;
}

// Drawer lateral mobile (desde la izquierda). Contiene los destinos de admin
// (Usuarios/Config, ya filtrados por el shell) y "Cerrar sesión" para todos los roles.
export function MobileDrawer({ open, onClose, email, items, canInstall, onInstall }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true">
      <div
        data-testid="drawer-overlay"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div className="absolute left-0 top-0 flex h-full w-72 max-w-[80%] flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4">
          <span className="text-sm font-semibold text-slate-900">Menú</span>
          <button type="button" onClick={onClose} aria-label="Cerrar menú" className="text-slate-600">
            <X size={20} />
          </button>
        </div>
        {email && (
          <p className="truncate border-b border-slate-200 px-4 py-3 text-xs text-slate-500">
            {email}
          </p>
        )}
        <nav className="flex-1 px-2 py-2">
          {items.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              <Icon size={18} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-slate-200 px-2 py-2">
          {canInstall && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onInstall?.();
              }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              <Download size={18} />
              Instalar app
            </button>
          )}
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
          >
            <LogOut size={18} />
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}
