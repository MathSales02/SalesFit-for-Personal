import Link from "next/link";
import { logoutAction } from "@/app/(auth)/actions";
import { Logo } from "@/components/ui/logo";
import type { Actor } from "@/server/authz/policy";
import { IconActivity, IconChat, IconClipboard, IconTrend, IconDumbbell, IconHome, IconLogout, IconShield, IconUser, IconUsers } from "./icons";
import { SideNavLink, TabNavLink, type NavItem } from "./nav-link";

type Variant = "trainer" | "student" | "admin";

const NAV: Record<Variant, NavItem[]> = {
  trainer: [
    { href: "/treinador", label: "Visão geral", icon: <IconHome /> },
    { href: "/treinador/alunos", label: "Alunos", icon: <IconUsers /> },
    { href: "/treinador/treinos", label: "Treinos", icon: <IconClipboard /> },
    { href: "/treinador/exercicios", label: "Exercícios", icon: <IconDumbbell /> },
    { href: "/treinador/comunidade", label: "Comunidade", icon: <IconChat /> },
    { href: "/conta", label: "Conta", icon: <IconUser /> },
  ],
  student: [
    { href: "/aluno", label: "Início", icon: <IconActivity /> },
    { href: "/aluno/comunidade", label: "Comunidade", icon: <IconChat /> },
    { href: "/aluno/historico", label: "Histórico", icon: <IconClipboard /> },
    { href: "/aluno/progresso", label: "Progresso", icon: <IconTrend /> },
    { href: "/conta", label: "Perfil", icon: <IconUser /> },
  ],
  admin: [
    { href: "/admin", label: "Plataforma", icon: <IconShield /> },
    { href: "/conta", label: "Conta", icon: <IconUser /> },
  ],
};

export function variantFor(actor: Actor): Variant {
  if (actor.membership?.role === "trainer") return "trainer";
  if (actor.membership?.role === "student") return "student";
  return "admin";
}

function LogoutButton({ tone }: { tone: "light" | "dark" }) {
  return (
    <form action={logoutAction}>
      <button
        type="submit"
        className={`flex h-10 w-full items-center gap-3 rounded-[var(--radius-control)] px-3 text-[0.95rem] font-semibold transition-colors ${
          tone === "dark" ? "text-white/65 hover:bg-white/8 hover:text-white" : "text-ink-soft hover:bg-turf-tint/60 hover:text-ink"
        }`}
      >
        <span className="size-5">
          <IconLogout />
        </span>
        Sair
      </button>
    </form>
  );
}

/**
 * Three distinct shells: trainers and admins get an operational sidebar
 * (admins in dark ink so the context is unmistakable); students get a
 * mobile-first layout with a bottom tab bar.
 */
export function AppShell({ actor, variant = variantFor(actor), children }: { actor: Actor; variant?: Variant; children: React.ReactNode }) {
  const nav = NAV[variant];
  if (variant === "student") {
    return (
      <div className="min-h-dvh pb-20 sm:pb-0">
        <header className="sticky top-0 z-10 border-b border-line bg-chalk/95 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
            <Link href="/aluno" aria-label="Início">
              <Logo />
            </Link>
            <nav aria-label="Principal" className="hidden items-center gap-1 sm:flex">
              {nav.map((i) => (
                <SideNavLink key={i.href} item={i} />
              ))}
              <LogoutButton tone="light" />
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
        <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 z-10 flex border-t border-line bg-paper sm:hidden">
          {nav.map((i) => (
            <TabNavLink key={i.href} item={i} />
          ))}
        </nav>
      </div>
    );
  }

  const dark = variant === "admin";
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)]">
      <aside className={`hidden flex-col gap-8 px-4 py-6 lg:flex ${dark ? "bg-ink" : "border-r border-line bg-paper"}`}>
        <Link href={nav[0]!.href} className="px-3" aria-label="Início">
          <Logo tone={dark ? "light" : "ink"} />
        </Link>
        <div className={`px-3 ${dark ? "text-white" : ""}`}>
          <p className={`text-xs font-semibold ${dark ? "text-signal" : "text-muted"}`}>{dark ? "Administração" : "Consultoria"}</p>
          <p className="mt-0.5 truncate font-semibold">{dark ? "Cadência" : actor.membership?.workspaceName}</p>
        </div>
        <nav aria-label="Principal" className="flex flex-col gap-1">
          {nav.map((i) => (
            <SideNavLink key={i.href} item={i} tone={dark ? "dark" : "light"} />
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-1">
          <p className={`truncate px-3 text-sm ${dark ? "text-white/60" : "text-muted"}`}>{actor.displayName}</p>
          <LogoutButton tone={dark ? "dark" : "light"} />
        </div>
      </aside>
      <header className={`flex h-14 items-center justify-between border-b px-4 lg:hidden ${dark ? "border-ink bg-ink" : "border-line bg-paper"}`}>
        <Logo tone={dark ? "light" : "ink"} />
        <nav aria-label="Principal" className="flex items-center gap-1">
          {nav.map((i) => (
            <SideNavLink key={i.href} item={i} iconOnly tone={dark ? "dark" : "light"} />
          ))}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8 lg:py-10">{children}</main>
    </div>
  );
}
