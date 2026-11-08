"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; icon: React.ReactNode; badge?: number };

function isActive(pathname: string, href: string) {
  return pathname === href || (href.split("/").length > 2 && pathname.startsWith(`${href}/`));
}

/** Unread count. Visually a pill; screen readers hear the count through <UnreadText>. */
// Same colours on light and dark surfaces: dark orange with white text (5.2:1).
function Badge({ n }: { n?: number; tone?: "light" | "dark" }) {
  if (!n) return null;
  return (
    <span aria-hidden="true" className="grid h-5 min-w-5 place-items-center rounded-full bg-turf-solid px-1.5 text-[0.7rem] leading-none font-bold text-white">
      {n > 99 ? "99+" : n}
    </span>
  );
}

const withCount = (label: string, n?: number) => (n ? `${label} (${n} não lidas)` : label);
/** Screen-reader-only count, so the link name keeps the visible label (WCAG 2.5.3). */
const UnreadText = ({ n }: { n?: number }) => (n ? <span className="sr-only"> ({n} não lidas)</span> : null);

export function SideNavLink({
  item,
  tone = "light",
  iconOnly = false,
}: {
  item: NavItem;
  tone?: "light" | "dark";
  iconOnly?: boolean;
}) {
  const active = isActive(usePathname(), item.href);
  const base =
    "relative flex h-10 items-center gap-3 rounded-[var(--radius-control)] px-3 text-[0.92rem] font-medium transition-all duration-150";
  const cls =
    tone === "dark"
      ? active
        ? "bg-white/10 text-turf font-semibold shadow-sm"
        : "text-white/65 hover:bg-white/5 hover:text-white"
      : active
        ? "bg-turf-tint text-turf font-semibold shadow-sm"
        : "text-ink-soft hover:bg-turf-tint/40 hover:text-ink";
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      aria-label={iconOnly ? withCount(item.label, item.badge) : undefined}
      className={`${base} ${cls}`}
    >
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
          <UnreadText n={item.badge} />
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
      className={`relative flex min-w-0 flex-1 flex-col items-center gap-1 py-2 text-[0.66rem] tracking-[-0.01em] font-medium transition-colors ${
        active ? "text-turf font-semibold" : "text-muted hover:text-ink"
      }`}
    >
      <span className="size-5">{item.icon}</span>
      {item.label}
      <UnreadText n={item.badge} />
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
      className={`relative grid size-10 place-items-center rounded-full transition-colors ${
        active ? "bg-turf-tint text-turf" : "text-ink-soft hover:bg-turf-tint/50 hover:text-turf"
      }`}
    >
      <span className="size-[20px]">{item.icon}</span>
      {item.badge ? (
        <span className="absolute -top-0.5 -right-0.5">
          <Badge n={item.badge} />
        </span>
      ) : null}
    </Link>
  );
}

/**
 * Icon-only rail link (desktop sidebar). The name is read by screen readers;
 * sighted users get the label as a tooltip on hover and keyboard focus.
 */
export function RailLink({ item }: { item: NavItem }) {
  const active = isActive(usePathname(), item.href);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`group relative grid size-11 place-items-center rounded-full transition-colors ${
        active ? "bg-signal text-on-accent shadow-sm" : "text-ink-soft hover:bg-turf-tint hover:text-turf"
      }`}
    >
      <span className="size-5">{item.icon}</span>
      {item.badge ? (
        <span className="absolute -top-0.5 -right-0.5">
          <Badge n={item.badge} />
        </span>
      ) : null}
      {/* The tooltip text is also the link's accessible name (no aria-label, so name = visible label). */}
      <span
        className="pointer-events-none absolute left-full z-30 ml-3 rounded-full bg-ink px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-paper opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        {item.label}
        <UnreadText n={item.badge} />
      </span>
    </Link>
  );
}
