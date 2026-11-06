import Link from "next/link";
import { logoutAction } from "@/app/(auth)/actions";
import { Logo } from "@/components/ui/logo";
import type { Actor } from "@/server/authz/policy";
import { unreadConversationCount } from "@/server/messaging/service";
import { unreadNotificationCount } from "@/server/notifications/service";
import {
  IconActivity,
  IconBell,
  IconChat,
  IconClipboard,
  IconDumbbell,
  IconHome,
  IconLogout,
  IconMenu,
  IconMessage,
  IconShield,
  IconTrend,
  IconUser,
  IconUsers,
} from "./icons";
import { HeaderIconLink, SideNavLink, TabNavLink, type NavItem } from "./nav-link";

type Variant = "trainer" | "student" | "admin";
type Badges = { messages: number; notifications: number };

function navFor(variant: Variant, b: Badges): { main: NavItem[]; header: NavItem[] } {
  if (variant === "trainer") {
    const header = [
      { href: "/treinador/mensagens", label: "Mensagens", icon: <IconMessage />, badge: b.messages },
      { href: "/treinador/notificacoes", label: "Notificações", icon: <IconBell />, badge: b.notifications },
    ];
    return {
      main: [
        { href: "/treinador", label: "Visão geral", icon: <IconHome /> },
        { href: "/treinador/alunos", label: "Alunos", icon: <IconUsers /> },
        { href: "/treinador/treinos", label: "Treinos", icon: <IconClipboard /> },
        { href: "/treinador/exercicios", label: "Exercícios", icon: <IconDumbbell /> },
        { href: "/treinador/comunidade", label: "Comunidade", icon: <IconChat /> },
        ...header,
        { href: "/conta", label: "Conta", icon: <IconUser /> },
      ],
      header,
    };
  }
  if (variant === "student") {
    return {
      main: [
        { href: "/aluno", label: "Início", icon: <IconActivity /> },
        { href: "/aluno/comunidade", label: "Comunidade", icon: <IconChat /> },
        { href: "/aluno/historico", label: "Histórico", icon: <IconClipboard /> },
        { href: "/aluno/progresso", label: "Progresso", icon: <IconTrend /> },
        { href: "/conta", label: "Perfil", icon: <IconUser /> },
      ],
      header: [
        { href: "/aluno/mensagens", label: "Mensagens", icon: <IconMessage />, badge: b.messages },
        { href: "/aluno/notificacoes", label: "Notificações", icon: <IconBell />, badge: b.notifications },
      ],
    };
  }
  return {
    main: [
      { href: "/admin", label: "Plataforma", icon: <IconShield /> },
      { href: "/conta", label: "Conta", icon: <IconUser /> },
    ],
    header: [],
  };
}

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
 * mobile-first layout with a bottom tab bar. Unread counts are read on the server.
 */
export async function AppShell({ actor, variant = variantFor(actor), children }: { actor: Actor; variant?: Variant; children: React.ReactNode }) {
  const badges: Badges = actor.membership
    ? { messages: await unreadConversationCount(actor), notifications: await unreadNotificationCount(actor) }
    : { messages: 0, notifications: 0 };
  const { main, header } = navFor(variant, badges);

  if (variant === "student") {
    return (
      <div className="min-h-dvh pb-20 sm:pb-0">
        <header className="sticky top-0 z-10 border-b border-line bg-chalk/95 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-2 px-4">
            <Link href="/aluno" aria-label="Início">
              <Logo />
            </Link>
            <div className="flex items-center gap-1">
              <nav aria-label="Principal" className="hidden items-center gap-1 sm:flex">
                {main.map((i) => (
                  <SideNavLink key={i.href} item={i} />
                ))}
              </nav>
              {header.map((i) => (
                <HeaderIconLink key={i.href} item={i} />
              ))}
              <span className="hidden sm:block">
                <LogoutButton tone="light" />
              </span>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
        <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 z-10 flex border-t border-line bg-paper sm:hidden">
          {main.map((i) => (
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
        <Link href={main[0]!.href} className="px-3" aria-label="Início">
          <Logo tone={dark ? "light" : "ink"} />
        </Link>
        <div className={`px-3 ${dark ? "text-white" : ""}`}>
          <p className={`text-xs font-semibold ${dark ? "text-signal" : "text-muted"}`}>{dark ? "Administração" : "Consultoria"}</p>
          <p className="mt-0.5 truncate font-semibold">{dark ? "Cadência" : actor.membership?.workspaceName}</p>
        </div>
        <nav aria-label="Principal" className="flex flex-col gap-1">
          {main.map((i) => (
            <SideNavLink key={i.href} item={i} tone={dark ? "dark" : "light"} />
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-1">
          <p className={`truncate px-3 text-sm ${dark ? "text-white/60" : "text-muted"}`}>{actor.displayName}</p>
          <LogoutButton tone={dark ? "dark" : "light"} />
        </div>
      </aside>
      {/* Small screens: logo, the two badge icons and a menu with everything else. */}
      <header className={`relative flex h-14 items-center justify-between gap-2 border-b px-4 lg:hidden ${dark ? "border-ink bg-ink" : "border-line bg-paper"}`}>
        <Logo tone={dark ? "light" : "ink"} />
        <div className="flex items-center gap-1">
          {header.map((i) => (
            <HeaderIconLink key={i.href} item={i} />
          ))}
          <details className="group">
            <summary className={`grid size-10 cursor-pointer list-none place-items-center rounded-full ${dark ? "text-white" : "text-ink-soft hover:bg-turf-tint/60"}`} aria-label="Menu">
              <span className="size-[22px]">
                <IconMenu />
              </span>
            </summary>
            <nav aria-label="Principal" className={`absolute inset-x-0 top-14 z-20 flex flex-col gap-1 border-b px-4 py-3 shadow-[var(--shadow-raised)] ${dark ? "border-ink bg-ink" : "border-line bg-paper"}`}>
              {main.map((i) => (
                <SideNavLink key={i.href} item={i} tone={dark ? "dark" : "light"} />
              ))}
              <LogoutButton tone={dark ? "dark" : "light"} />
            </nav>
          </details>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8 lg:py-10">{children}</main>
    </div>
  );
}
