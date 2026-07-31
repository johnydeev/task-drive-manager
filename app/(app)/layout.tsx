import { AppShell } from "@/components/layout/AppShell";
import { OfflineSyncProvider } from "@/components/providers/OfflineSyncProvider";
import { getActiveSession } from "@/lib/auth";
import { redirect } from "next/navigation";

// Las páginas autenticadas son SIEMPRE dinámicas (requieren sesión + datos en vivo). En prod
// ya lo son porque este layout lee cookies; pero en DEMO_MODE la sesión es fake (sin cookies),
// y sin esto Next intentaría prerenderarlas estáticamente y /tareas rompe por useSearchParams()
// sin Suspense. Forzarlo acá cubre todo el grupo (app) sin cambiar el comportamiento de prod.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getActiveSession();
  if (!session?.user?.email) redirect("/login");
  return (
    <OfflineSyncProvider>
      <AppShell>{children}</AppShell>
    </OfflineSyncProvider>
  );
}
