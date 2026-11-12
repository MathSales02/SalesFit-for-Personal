"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { isActive, MoreTab, type NavItem } from "@/components/shell/nav-link";
import { useT } from "@/i18n/client";

/**
 * Tubelight navbar: a floating pill of tabs where a small lamp hangs over the current one and
 * slides to the next when the page changes.
 *
 * Adapted from the "tubelight-navbar" component to this app: the current tab comes from the
 * route (not from a click), the icons are the app's own, every tab keeps its written label, and
 * the lamp slides with a CSS transition, so no animation library is needed. `more` adds a last
 * slot that opens a sheet with the remaining destinations.
 */
export function TubelightNavBar({
  items,
  more,
  moreFooter,
  className = "",
}: {
  items: NavItem[];
  more?: NavItem[];
  moreFooter?: React.ReactNode;
  /** Usually the breakpoint where the bar gives way to the desktop navigation, e.g. "lg:hidden". */
  className?: string;
}) {
  const t = useT();
  const pathname = usePathname();
  const pill = useRef<HTMLDivElement>(null);
  // Where the lamp sits, measured from the tab that is current. Null: no tab is current.
  const [lamp, setLamp] = useState<{ x: number; w: number } | null>(null);
  const [measured, setMeasured] = useState(false);

  useEffect(() => {
    const el = pill.current;
    if (!el) return;
    const measure = () => {
      const tab = el.querySelector<HTMLElement>('[aria-current="page"], [data-active]');
      setLamp(tab ? { x: tab.offsetLeft, w: tab.offsetWidth } : null);
      setMeasured(true);
    };
    // Fires once on observe, then whenever the bar changes size (rotation, font size).
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [pathname]);

  return (
    <nav
      aria-label={t("Principal")}
      className={`pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center bg-gradient-to-t from-chalk via-chalk/85 to-transparent px-3 pt-6 pb-[max(0.75rem,env(safe-area-inset-bottom))] ${className}`}
    >
      <div ref={pill} className="pointer-events-auto relative flex w-full max-w-md items-stretch rounded-full border border-line bg-paper/95 p-1.5 shadow-[var(--shadow-card)] backdrop-blur-lg">
        {lamp && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1.5 bottom-1.5 left-0 rounded-full bg-turf-tint transition-[transform,width] duration-300 ease-[cubic-bezier(0.3,1.25,0.5,1)] motion-reduce:transition-none"
            style={{ width: lamp.w, transform: `translateX(${lamp.x}px)` }}
          >
            <Lamp />
          </span>
        )}
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`relative z-10 flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-full px-1 py-1.5 text-[0.66rem] tracking-[-0.01em] transition-colors ${
                active ? "font-semibold text-turf" : "font-medium text-muted hover:text-ink"
              } ${active && !measured ? "bg-turf-tint" : ""}`}
            >
              {/* Before the first measurement the current tab carries its own lamp, so nothing flashes. */}
              {active && !measured && <Lamp />}
              <span className="size-5">{item.icon}</span>
              <span className="max-w-full truncate">{item.label}</span>
            </Link>
          );
        })}
        {more && more.length > 0 && <MoreTab items={more} footer={moreFooter} />}
      </div>
    </nav>
  );
}

/** The tube light: a short bright bar on the pill's top edge and its glow falling on the tab. */
function Lamp() {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute -top-1.5 left-1/2 h-1 w-8 -translate-x-1/2 rounded-t-full bg-signal">
      <span className="absolute -top-2 -left-2 h-6 w-12 rounded-full bg-signal/25 blur-md" />
      <span className="absolute -top-1 left-0 h-6 w-8 rounded-full bg-signal/25 blur-md" />
      <span className="absolute top-0 left-2 size-4 rounded-full bg-signal/25 blur-sm" />
    </span>
  );
}
