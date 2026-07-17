"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { OfflineBadge } from "./OfflineBadge";
import {
  ClipboardList,
  LayoutDashboard,
  Users,
  Settings,
  LogOut,
  Plus,
  Building2,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  Icon: typeof ClipboardList;
  adminOnly?: boolean;
}

const NAV: NavItem[] = [
  { href: "/tareas", label: "Tareas", Icon: ClipboardList },
  { href: "/edificios", label: "Edificios", Icon: Building2 },
  { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/usuarios", label: "Usuarios", Icon: Users, adminOnly: true },
  { href: "/configuracion", label: "Config", Icon: Settings, adminOnly: true },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isAdmin = session?.user?.rol === "admin";
  const items = NAV.filter((n) => !n.adminOnly || isAdmin);

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Sidebar desktop */}
      <aside className="hidden md:flex md:w-60 md:flex-col md:border-r md:border-slate-200 md:bg-white">
        <div className="px-6 py-5">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-lg font-semibold text-slate-900">Gestión Morinigo</h1>
            <OfflineBadge />
          </div>
          {session?.user?.email && (
            <p className="mt-1 truncate text-xs text-slate-500">{session.user.email}</p>
          )}
        </div>
        <nav className="flex-1 px-3">
          {items.map(({ href, label, Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                  active
                    ? "bg-slate-900 text-white"
                    : "text-slate-700 hover:bg-slate-100"
                )}
              >
                <Icon size={18} />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="px-3 pb-5">
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
          >
            <LogOut size={18} />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Contenido + bottom nav mobile */}
      <main className="flex-1 pb-20 md:pb-0">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
          <h1 className="text-base font-semibold text-slate-900">Gestión Morinigo</h1>
          <div className="flex items-center gap-2">
            <OfflineBadge />
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="text-xs text-slate-600"
              aria-label="Cerrar sesión"
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>
        {children}
      </main>

      {/* Bottom nav mobile */}
      <nav className="fixed bottom-0 left-0 right-0 z-20 flex items-stretch border-t border-slate-200 bg-white md:hidden">
        {items.map(({ href, label, Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 py-2 text-xs",
                active ? "text-slate-900" : "text-slate-500"
              )}
            >
              <Icon size={20} />
              {label}
            </Link>
          );
        })}
        <Link
          href="/tareas/nueva"
          className="flex flex-1 flex-col items-center justify-center gap-1 bg-slate-900 py-2 text-xs text-white"
        >
          <Plus size={20} />
          Nueva
        </Link>
      </nav>
    </div>
  );
}
