"use client";

import { startTransition, useSyncExternalStore } from "react";
import { setThemeAction } from "@/app/_theme/actions";
import { IconMoon, IconSun } from "@/components/shell/icons";

const media = () => window.matchMedia("(prefers-color-scheme: dark)");

function subscribe(onChange: () => void) {
  const mq = media();
  const mo = new MutationObserver(onChange);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  mq.addEventListener("change", onChange);
  return () => {
    mo.disconnect();
    mq.removeEventListener("change", onChange);
  };
}

/** The theme actually on screen: an explicit choice, or the device's. */
function effective(): "light" | "dark" {
  const cls = document.documentElement.classList;
  if (cls.contains("dark")) return "dark";
  if (cls.contains("light")) return "light";
  return media().matches ? "dark" : "light";
}

/** Light/dark switch for headers. Switches instantly, then saves the choice. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  // Unknown on the server: the button renders without a decided icon until it mounts.
  const current = useSyncExternalStore(subscribe, effective, () => null);
  const next = current === "dark" ? "light" : "dark";
  const label = current === null ? "Alternar tema" : next === "dark" ? "Usar tema escuro" : "Usar tema claro";

  function toggle() {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(next);
    const data = new FormData();
    data.set("theme", next);
    startTransition(() => {
      void setThemeAction({ ok: true }, data);
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={`grid size-10 place-items-center rounded-full text-ink-soft transition-colors hover:bg-turf-tint hover:text-turf ${className}`}
    >
      <span className="size-5">{current === "dark" ? <IconSun /> : <IconMoon />}</span>
    </button>
  );
}
