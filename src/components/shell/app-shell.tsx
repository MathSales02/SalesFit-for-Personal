import Link from "next/link";
import { logoutAction } from "@/app/(auth)/actions";
import { Logo } from "@/components/ui/logo";
import type { Actor } from "@/server/authz/policy";
import { daysLeft } from "@/server/billing/access";
import { unreadConversationCount } from "@/server/messaging/service";
import { unreadNotificationCount } from "@/server/notifications/service";
import {
  IconActivity,
  IconAlert,
  IconBuilding,
  IconCard,
  IconBell,
  IconChat,
  IconClipboard,
  IconDumbbell,
  IconHome,
  IconLogout,
  IconMenu,
  IconMessage,
  IconShield,
  IconTrophy,
  IconTrend,
  IconUser,
  IconUsers,
} from "./icons";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { HeaderIconLink, RailLink, SideNavLink, TabNavLink, type NavItem } from "./nav-link";

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
        { href: "/treinador/ranking", label: "Ranking", icon: <IconTrophy /> },
        ...header,
        { href: "/treinador/assinatura", label: "Assinatura", icon: <IconCard /> },
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
        { href: "/aluno/ranking", label: "Ranking", icon: <IconTrophy /> },
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
      { href: "/admin/consultorias", label: "Consultorias", icon: <IconBuilding /> },
      { href: "/admin/usuarios", label: "Usuários", icon: <IconUsers /> },
      { href: "/admin/planos", label: "Planos", icon: <IconCard /> },
      { href: "/admin/cobranca", label: "Cobrança", icon: <IconActivity /> },
      { href: "/admin/seguranca", label: "Segurança", icon: <IconAlert /> },
      { href: "/admin/auditoria", label: "Auditoria", icon: <IconClipboard /> },
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
        className={`flex h-10 w-full items-center gap-3 rounded-[var(--radius-control)] px-3 text-[0.92rem] font-medium transition-colors ${
          tone === "dark"
            ? "text-white/65 hover:bg-white/8 hover:text-white"
            : "text-ink-soft hover:bg-turf-tint/60 hover:text-turf"
        }`}
      >
        <span className="size-5 shrink-0">
          <IconLogout />
        </span>
        Sair
      </button>
    </form>
  );
}

/**
 * Three distinct shells: trainers and admins get an operational sidebar
 * (admins in dark ink with orange highlight); students get a
 * mobile-first layout with a bottom tab bar.
 */
export async function AppShell({
  actor,
  variant = variantFor(actor),
  children,
}: {
  actor: Actor;
  variant?: Variant;
  children: React.ReactNode;
}) {
  const badges: Badges = actor.membership
    ? { messages: await unreadConversationCount(actor), notifications: await unreadNotificationCount(actor) }
    : { messages: 0, notifications: 0 };
  const { main, header } = navFor(variant, badges);

  if (variant === "student") {
    return (
      <div className="min-h-dvh pb-20 xl:pb-0 bg-chalk">
        <header className="sticky top-0 z-10 border-b border-line bg-paper/95">
          <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-2 px-4">
            <Link href="/aluno" aria-label="Cadência, início">
              <Logo />
            </Link>
            <div className="flex items-center gap-1">
              <nav aria-label="Principal" className="hidden items-center gap-1 xl:flex">
                {main.map((i) => (
                  <SideNavLink key={i.href} item={i} />
                ))}
              </nav>
              <ThemeToggle />
              {header.map((i) => (
                <HeaderIconLink key={i.href} item={i} />
              ))}
              <span className="hidden xl:block">
                <LogoutButton tone="light" />
              </span>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
        <nav
          aria-label="Principal"
          className="fixed inset-x-0 bottom-0 z-10 flex border-t border-line bg-paper xl:hidden"
        >
          {main.map((i) => (
            <TabNavLink key={i.href} item={i} />
          ))}
        </nav>
      </div>
    );
  }

  if (variant === "trainer") {
    const account = main.filter((i) => i.href === "/conta");
    const nav = main.filter((i) => i.href !== "/conta");
    return (
      <div className="min-h-dvh bg-chalk lg:grid lg:grid-cols-[6.5rem_minmax(0,1fr)]">
        {/* Desktop: a floating icon rail, as in the reference dashboard. */}
        <aside className="sticky top-0 hidden h-dvh py-4 pl-4 lg:block">
          <div className="flex h-full flex-col items-center gap-5 rounded-[var(--radius-panel)] bg-paper py-5 shadow-[var(--shadow-card)]">
            <Link href="/treinador" aria-label="Cadência, início" className="grid size-11 place-items-center">
              <Logo compact />
            </Link>
            <nav aria-label="Principal" className="flex flex-1 flex-col items-center gap-2">
              {nav.map((i) => (
                <RailLink key={i.href} item={i} />
              ))}
            </nav>
            <div className="flex flex-col items-center gap-2 border-t border-line pt-4">
              <ThemeToggle className="size-11" />
              {account.map((i) => (
                <RailLink key={i.href} item={i} />
              ))}
              <form action={logoutAction}>
                <button
                  type="submit"
                  aria-label="Sair"
                  className="group relative grid size-11 place-items-center rounded-full text-ink-soft transition-colors hover:bg-turf-tint hover:text-turf"
                >
                  <span className="size-5">
                    <IconLogout />
                  </span>
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute left-full z-30 ml-3 rounded-full bg-ink px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-paper opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                  >
                    Sair
                  </span>
                </button>
              </form>
              <span className="mt-1 grid size-10 place-items-center rounded-full bg-signal-tint text-sm font-bold text-turf" title={actor.displayName} aria-hidden="true">
                {actor.displayName.trim().charAt(0).toUpperCase()}
              </span>
            </div>
          </div>
        </aside>

        <header className="relative flex h-14 items-center justify-between gap-2 border-b border-line bg-paper px-4 lg:hidden">
          <Link href="/treinador" aria-label="Cadência, início">
            <Logo />
          </Link>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            {header.map((i) => (
              <HeaderIconLink key={i.href} item={i} />
            ))}
            <details className="group">
              <summary className="grid size-10 cursor-pointer list-none place-items-center rounded-full text-ink-soft hover:bg-turf-tint/60" aria-label="Menu">
                <span className="size-[22px]">
                  <IconMenu />
                </span>
              </summary>
              <nav aria-label="Principal" className="absolute inset-x-0 top-14 z-20 flex flex-col gap-1 border-b border-line bg-paper px-4 py-3 shadow-[var(--shadow-raised)]">
                {main.map((i) => (
                  <SideNavLink key={i.href} item={i} />
                ))}
                <LogoutButton tone="light" />
              </nav>
            </details>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-8 lg:py-8">
          <BillingBanner actor={actor} />
          {children}
        </main>
      </div>
    );
  }

  const dark = variant === "admin";
  return (
    <div className="min-h-dvh bg-chalk lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)]">
      <aside
        className={`hidden flex-col gap-6 px-4 py-6 lg:flex ${
          dark ? "border-r border-[#2A2A2D] bg-[#0C0C0D]" : "border-r border-line bg-paper"
        }`}
      >
        <Link href={main[0]!.href} className="px-3" aria-label="Cadência, início">
          <Logo tone={dark ? "light" : "ink"} />
        </Link>
        <div className={`px-3 ${dark ? "text-white" : ""}`}>
          <p className={`text-[0.7rem] uppercase tracking-wider font-bold ${dark ? "text-turf" : "text-muted"}`}>
            {dark ? "Administração" : "Consultoria"}
          </p>
          <p className="mt-0.5 truncate font-semibold text-sm">
            {dark ? "Cadência Platform" : actor.membership?.workspaceName}
          </p>
        </div>
        <nav aria-label="Principal" className="flex flex-col gap-1">
          {main.map((i) => (
            <SideNavLink key={i.href} item={i} tone={dark ? "dark" : "light"} />
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-1">
          <p className={`truncate px-3 text-xs ${dark ? "text-white/50" : "text-muted"}`}>
            {actor.displayName}
          </p>
          <LogoutButton tone={dark ? "dark" : "light"} />
        </div>
      </aside>

      {/* Small screens: logo, badge icons and expandable menu */}
      <header
        className={`relative flex h-14 items-center justify-between gap-2 border-b px-4 lg:hidden ${
          dark ? "border-[#2A2A2D] bg-[#0C0C0D]" : "border-line bg-paper"
        }`}
      >
        <Logo tone={dark ? "light" : "ink"} />
        <div className="flex items-center gap-1">
          {header.map((i) => (
            <HeaderIconLink key={i.href} item={i} />
          ))}
          <details className="group">
            <summary
              className={`grid size-10 cursor-pointer list-none place-items-center rounded-full ${
                dark ? "text-white" : "text-ink-soft hover:bg-turf-tint/60"
              }`}
              aria-label="Menu"
            >
              <span className="size-[22px]">
                <IconMenu />
              </span>
            </summary>
            <nav
              aria-label="Principal"
              className={`absolute inset-x-0 top-14 z-20 flex flex-col gap-1 border-b px-4 py-3 shadow-[var(--shadow-raised)] ${
                dark ? "border-[#2A2A2D] bg-[#0C0C0D]" : "border-line bg-paper"
              }`}
            >
              {main.map((i) => (
                <SideNavLink key={i.href} item={i} tone={dark ? "dark" : "light"} />
              ))}
              <LogoutButton tone={dark ? "dark" : "light"} />
            </nav>
          </details>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8 lg:py-10">
        {children}
      </main>
    </div>
  );
}

/** Trainer-only reminder when the trial is ending, a payment is late or access is paused. */
function BillingBanner({ actor }: { actor: Actor }) {
  const a = actor.membership?.access;
  if (!a) return null;
  const left = daysLeft(a.until);
  let text: string | null = null;
  if (a.state === "blocked") text = "Acesso pausado: a assinatura está inativa. Seus alunos também estão sem acesso.";
  else if (a.state === "grace") text = `Pagamento pendente. O acesso será pausado em ${left} ${left === 1 ? "dia" : "dias"}.`;
  else if (a.state === "trial" && left !== null && left <= 5)
    text = `Seu teste grátis termina em ${left} ${left === 1 ? "dia" : "dias"}.`;
  if (!text) return null;
  return (
    <div
      className={`mb-6 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-panel)] border px-4 py-3 text-sm ${
        a.state === "trial"
          ? "border-signal/50 bg-signal-tint text-ink"
          : "border-danger/40 bg-danger-tint text-danger"
      }`}
    >
      <span className="font-semibold">{text}</span>
      <Link href="/treinador/assinatura" className="font-semibold text-turf underline-offset-2 hover:underline">
        Ver planos
      </Link>
    </div>
  );
}
