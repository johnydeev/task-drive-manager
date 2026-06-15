import { AppShell } from "@/components/layout/AppShell";
import { OfflineSyncProvider } from "@/components/providers/OfflineSyncProvider";
import { getActiveSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getActiveSession();
  if (!session?.user?.email) redirect("/login");
  return (
    <OfflineSyncProvider>
      <AppShell>{children}</AppShell>
    </OfflineSyncProvider>
  );
}
