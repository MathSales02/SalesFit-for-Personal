import { AppShell } from "@/components/shell/app-shell";
import { requirePageActor } from "@/server/http/next";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await requirePageActor("admin.dashboard");
  return (
    <AppShell actor={actor} variant="admin">
      {children}
    </AppShell>
  );
}
