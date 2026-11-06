"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; icon: React.ReactNode };

function isActive(pathname: string, href: string) {
  return pathname === href || (href.split("/").length > 2 && pathname.startsWith(`${href}/`));
}

export function SideNavLink({ item, tone = "light", iconOnly = false }: { item: NavItem; tone?: "light" | "dark"; iconOnly?: boolean }) {
  const active = isActive(usePathname(), item.href);
  const base = "flex h-10 items-center gap-3 rounded-[var(--radius-control)] px-3 text-[0.95rem] font-semibold transition-colors";
  const cls =
    tone === "dark"
      ? active
        ? "bg-white/12 text-white"
        : "text-white/65 hover:bg-white/8 hover:text-white"
      : active
        ? "bg-turf-tint text-turf"
        : "text-ink-soft hover:bg-turf-tint/60 hover:text-ink";
  return (
    <Link href={item.href} aria-current={active ? "page" : undefined} className={`${base} ${cls}`}>
      <span className="size-5 shrink-0">{item.icon}</span>
      {iconOnly ? <span className="sr-only">{item.label}</span> : item.label}
    </Link>
  );
}

export function TabNavLink({ item }: { item: NavItem }) {
  const active = isActive(usePathname(), item.href);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`flex flex-1 flex-col items-center gap-1 py-2 text-xs font-semibold ${active ? "text-turf" : "text-muted"}`}
    >
      <span className="size-6">{item.icon}</span>
      {item.label}
    </Link>
  );
}
