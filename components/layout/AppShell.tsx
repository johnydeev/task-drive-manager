"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { ReactNode, useState } from "react";
import { cn } from "@/lib/utils";
import { OfflineIndicator } from "./OfflineIndicator";
import { MobileDrawer } from "./MobileDrawer";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import {
  ClipboardList,
  LayoutDashboard,
  Users,
  Settings,
  LogOut,
  Plus,
  Building2,
  Menu,
  Download,
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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { canInstall, promptInstall } = useInstallPrompt();

  const items = NAV.filter((n) => !n.adminOnly || isAdmin);
  const bottomItems = items.filter((n) => !n.adminOnly); // Tareas, Edificios, Dashboard
  const drawerItems = items.filter((n) => n.adminOnly); // Usuarios, Config (solo admin)

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Sidebar desktop (sin cambios salvo el indicador) */}
      <aside className="hidden md:flex md:w-60 md:flex-col md:border-r md:border-slate-200 md:bg-white">
        <div className="px-6 py-5">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-lg font-semibold text-slate-900">Gestión Morinigo</h1>
            <OfflineIndicator />
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
          {canInstall && (
            <button
              onClick={() => promptInstall()}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
            >
              <Download size={18} />
              Instalar app
            </button>
          )}
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
          >
            <LogOut size={18} />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Contenido + header/bottom nav mobile */}
      <main className="flex-1 pb-24 md:pb-0">
        <header className="sticky top-0 z-30 grid grid-cols-3 items-center border-b border-slate-200 bg-white px-4 py-3 md:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Abrir menú"
            className="justify-self-start text-slate-700"
          >
            <Menu size={22} />
          </button>
          <h1 className="text-center text-base font-semibold text-slate-900">Gestión Morinigo</h1>
          <div className="justify-self-end">
            <OfflineIndicator />
          </div>
        </header>
        {children}
      </main>

      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        email={session?.user?.email}
        items={drawerItems}
        canInstall={canInstall}
        onInstall={promptInstall}
      />

      {/* Bottom nav mobile */}
      <nav
        data-testid="bottom-nav"
        className="fixed bottom-0 left-0 right-0 z-20 flex items-stretch border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {bottomItems.map(({ href, label, Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className="flex flex-1 flex-col items-center justify-center py-2.5 text-xs"
            >
              <span
                className={cn(
                  "flex flex-col items-center gap-1 rounded-xl px-4 py-1.5 transition",
                  active ? "bg-slate-100 font-medium text-slate-900" : "text-slate-500"
                )}
              >
                <Icon size={20} />
                {label}
              </span>
            </Link>
          );
        })}
        <Link
          href="/tareas/nueva"
          className="flex flex-1 flex-col items-center justify-center gap-1 bg-slate-900 py-2.5 text-xs text-white"
        >
          <Plus size={20} />
          Nueva
        </Link>
      </nav>
    </div>
  );
}
