"use client";

import Link from "next/link";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { useT } from "@/i18n/client";

export type NewsCard = { id: string; title: string; body: string; cta?: { href: string; label: string } };

/** Ids already shown on this device. */
const SEEN_KEY = "salesfit:news-seen";
const CHANGED = "salesfit:news-seen";

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}
function readSeen() {
  try {
    return localStorage.getItem(SEEN_KEY) ?? "[]";
  } catch {
    // No storage (private mode, blocked): say everything was seen rather than repeat it on every page.
    return null;
  }
}
function markSeen(ids: string[]) {
  try {
    const seen = new Set<string>(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]"));
    ids.forEach((id) => seen.add(id));
    // Only the latest ids matter; keep the list short.
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-50)));
  } catch {}
  window.dispatchEvent(new Event(CHANGED));
}

/**
 * The "Novidades" pop-up: what launched since the person's last visit, once per device. The list
 * comes from lib/whats-new.ts, already filtered by the server (audience, account date) and translated.
 */
export function WhatsNew({ items }: { items: NewsCard[] }) {
  const t = useT();
  const dialog = useRef<HTMLDialogElement>(null);
  // On the server and in the first render nothing is known about this device: show nothing.
  const raw = useSyncExternalStore(subscribe, readSeen, () => null);
  let seen: string[] = [];
  try {
    seen = raw === null ? items.map((i) => i.id) : JSON.parse(raw);
  } catch {}
  const unseen = items.filter((i) => !seen.includes(i.id)).slice(0, 3);
  const ids = unseen.map((i) => i.id).join(",");

  useEffect(() => {
    if (ids && !dialog.current?.open) dialog.current?.showModal();
  }, [ids]);

  if (!unseen.length) return null;

  const close = () => {
    dialog.current?.close();
  };

  return (
    <dialog ref={dialog} aria-labelledby="news-h" className="cm-sheet" onClose={() => markSeen(unseen.map((i) => i.id))}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <h2 id="news-h" className="flex items-center gap-2 font-display text-lg font-bold">
          <span className="rounded-full bg-signal px-2.5 py-0.5 text-xs font-bold text-on-accent">{t("Novo")}</span>
          {t("Novidades no SalesFit")}
        </h2>
        <button type="button" onClick={close} aria-label={t("Fechar")} className="grid size-10 place-items-center rounded-full text-ink-soft hover:bg-chalk">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="size-5">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
      <div className="flex max-h-[min(70dvh,34rem)] flex-col gap-5 overflow-y-auto px-5 py-5">
        {unseen.map((n) => (
          <section key={n.id} className="flex flex-col gap-1.5">
            <h3 className="text-lg leading-snug font-semibold">{n.title}</h3>
            <p className="text-sm leading-relaxed text-ink-soft">{n.body}</p>
            {n.cta && (
              <Link href={n.cta.href} onClick={close} className="mt-1 self-start text-sm font-semibold text-turf hover:underline">
                {n.cta.label} →
              </Link>
            )}
          </section>
        ))}
        <button type="button" onClick={close} className="h-11 rounded-full bg-ink px-5 font-semibold text-paper hover:bg-ink/85">
          {t("Entendi")}
        </button>
      </div>
    </dialog>
  );
}
