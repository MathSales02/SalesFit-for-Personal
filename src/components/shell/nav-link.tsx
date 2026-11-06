"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; icon: React.ReactNode; badge?: number };

function isActive(pathname: string, href: string) {
  return pathname === href || (href.split("/").length > 2 && pathname.startsWith(`${href}/`));
}

/** Unread count, announced to screen readers as part of the link name. */
function Badge({ n, tone = "light" }: { n?: number; tone?: "light" | "dark" }) {
  if (!n) return null;
  return (
    <span aria-hidden="true" className={`grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[0.7rem] leading-none font-bold ${tone === "dark" ? "bg-signal text-ink" : "bg-turf text-white"}`}>
      {n > 99 ? "99+" : n}
    </span>
  );
}

const withCount = (label: string, n?: number) => (n ? `${label} (${n} não lidas)` : label);

export function SideNavLink({ item, tone = "light", iconOnly = false }: { item: NavItem; tone?: "light" | "dark"; iconOnly?: boolean }) {
  const active = isActive(usePathname(), item.href);
  const base = "relative flex h-10 items-center gap-3 rounded-[var(--radius-control)] px-3 text-[0.95rem] font-semibold transition-colors";
  const cls =
    tone === "dark"
      ? active
        ? "bg-white/12 text-white"
        : "text-white/65 hover:bg-white/8 hover:text-white"
      : active
        ? "bg-turf-tint text-turf"
        : "text-ink-soft hover:bg-turf-tint/60 hover:text-ink";
  return (
    <Link href={item.href} aria-current={active ? "page" : undefined} aria-label={withCount(item.label, item.badge)} className={`${base} ${cls}`}>
      <span className="size-5 shrink-0">{item.icon}</span>
      {iconOnly ? (
        item.badge ? (
          <span className="absolute top-0.5 right-0.5">
            <Badge n={item.badge} />
          </span>
        ) : null
      ) : (
        <>
          <span className="flex-1">{item.label}</span>
          <Badge n={item.badge} tone={tone} />
        </>
      )}
    </Link>
  );
}

export function TabNavLink({ item }: { item: NavItem }) {
  const active = isActive(usePathname(), item.href);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      aria-label={withCount(item.label, item.badge)}
      className={`relative flex flex-1 flex-col items-center gap-1 py-2 text-xs font-semibold ${active ? "text-turf" : "text-muted"}`}
    >
      <span className="size-6">{item.icon}</span>
      {item.label}
    </Link>
  );
}

/** Compact icon link with a badge, for headers (messages, notifications). */
export function HeaderIconLink({ item }: { item: NavItem }) {
  const active = isActive(usePathname(), item.href);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      aria-label={withCount(item.label, item.badge)}
      className={`relative grid size-10 place-items-center rounded-full ${active ? "bg-turf-tint text-turf" : "text-ink-soft hover:bg-turf-tint/60"}`}
    >
      <span className="size-[22px]">{item.icon}</span>
      {item.badge ? (
        <span className="absolute -top-0.5 -right-0.5">
          <Badge n={item.badge} />
        </span>
      ) : null}
    </Link>
  );
}
