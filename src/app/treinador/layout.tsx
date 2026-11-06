import { AppShell } from "@/components/shell/app-shell";
import { requirePageActor } from "@/server/http/next";

export default async function TrainerLayout({ children }: { children: React.ReactNode }) {
  const actor = await requirePageActor("students.read", { allowInactive: true });
  return (
    <AppShell actor={actor} variant="trainer">
      {children}
    </AppShell>
  );
}
