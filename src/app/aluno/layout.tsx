import { AppShell } from "@/components/shell/app-shell";
import { requirePageActor } from "@/server/http/next";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const actor = await requirePageActor("training.read_own", { allowInactive: true });
  return (
    <AppShell actor={actor} variant="student">
      {children}
    </AppShell>
  );
}
