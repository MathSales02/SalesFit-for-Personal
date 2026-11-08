"use client";

import { useEffect, useRef, useState } from "react";
import { BEAT, EASE_OUT, gsap, MQ } from "./gsap";

export type FaqItem = { q: string; a: React.ReactNode };

/** Accessible accordion: real buttons, aria-expanded/aria-controls, animated height. */
export function Faq({ items }: { items: FaqItem[] }) {
  return (
    <section id="faq" aria-labelledby="faq-h" className="lp-dark py-24 sm:py-32">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 sm:px-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <h2 id="faq-h" className="lp-display text-[2.6rem] sm:text-[4rem]">
          Dúvidas antes de começar
        </h2>
        <div className="border-t border-white/10">
          {items.map((item, i) => (
            <Question key={item.q} item={item} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

function Question({ item, index }: { item: FaqItem; index: number }) {
  const [open, setOpen] = useState(false);
  const [rendered, setRendered] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const icon = useRef<HTMLSpanElement>(null);
  const id = `faq-${index}`;

  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    const reduce = window.matchMedia(MQ.reduce).matches;
    gsap.to(icon.current, { rotate: open ? 45 : 0, duration: reduce ? 0 : BEAT * 0.6, ease: EASE_OUT });
    if (open) {
      gsap.fromTo(el, { height: 0, autoAlpha: 0 }, { height: "auto", autoAlpha: 1, duration: reduce ? 0 : BEAT, ease: EASE_OUT });
    } else if (rendered) {
      gsap.to(el, { height: 0, autoAlpha: 0, duration: reduce ? 0 : BEAT * 0.7, ease: "power2.inOut", onComplete: () => setRendered(false) });
    }
  }, [open, rendered]);

  return (
    <div className="border-b border-white/10">
      <h3>
        <button
          type="button"
          id={`${id}-q`}
          aria-expanded={open}
          aria-controls={`${id}-a`}
          onClick={() => {
            if (!open) setRendered(true);
            setOpen(!open);
          }}
          className="flex min-h-16 w-full items-center justify-between gap-6 py-5 text-left text-lg font-semibold text-white"
        >
          {item.q}
          <span ref={icon} aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full border border-white/20 text-xl leading-none">
            +
          </span>
        </button>
      </h3>
      <div id={`${id}-a`} role="region" aria-labelledby={`${id}-q`} ref={panel} hidden={!open && !rendered} className="overflow-hidden">
        <div className="pr-12 pb-6 leading-relaxed text-[var(--lp-text-2)]">{item.a}</div>
      </div>
    </div>
  );
}
