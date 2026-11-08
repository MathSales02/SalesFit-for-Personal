"use client";

import { useRef } from "react";
import { Beats } from "./brand";
import { BEAT, EASE_OUT, gsap, MQ, SplitText, useGSAP } from "./gsap";
import { BENEFITS, METRICS, TESTIMONIALS } from "./landing-content";

/** Editorial benefits: big type, one line at a time, each tied to a real feature. */
export function Benefits() {
  const scope = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MQ.motion, () => {
        const splits: SplitText[] = [];
        gsap.utils.toArray<HTMLElement>("[data-line]", scope.current).forEach((el) => {
          // Lines reveal through a mask; the real text stays in the DOM for screen readers.
          const split = SplitText.create(el, { type: "lines", mask: "lines", aria: "auto" });
          splits.push(split);
          gsap.from(split.lines, { yPercent: 105, duration: BEAT * 1.8, ease: EASE_OUT, stagger: 0.08, scrollTrigger: { trigger: el, start: "top 85%", once: true } });
        });
        gsap.utils.toArray<HTMLElement>("[data-detail]", scope.current).forEach((el) => {
          gsap.from(el, { y: 16, opacity: 0, duration: BEAT * 1.4, ease: EASE_OUT, scrollTrigger: { trigger: el, start: "top 90%", once: true } });
        });
        return () => splits.forEach((s) => s.revert());
      });
    },
    { scope },
  );

  return (
    <section ref={scope} id="beneficios" aria-labelledby="ben-h" className="lp-dark relative py-24 sm:py-36">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <h2 id="ben-h" className="flex items-center gap-3 text-sm font-semibold tracking-wide text-[var(--lp-orange-on-dark)] uppercase">
          <Beats className="h-4 w-14 text-[var(--lp-orange)]" on={[0, 1, 2, 3, 4, 5, 6]} />
          Por que muda a sua rotina
        </h2>
        <ol className="mt-12 flex flex-col">
          {BENEFITS.map((b, i) => (
            <li key={b.line} className="grid gap-4 border-t border-white/10 py-10 sm:py-14 lg:grid-cols-[5rem_minmax(0,1fr)_18rem] lg:items-end">
              <span aria-hidden="true" className="font-display text-sm font-semibold text-[var(--lp-text-2)] tabular-nums">
                0{i + 1}
              </span>
              <h3 data-line="" className="lp-display text-[2.1rem] sm:text-[3.4rem] lg:text-[3.9rem]">
                {b.line}
              </h3>
              <p data-detail="" className="text-[var(--lp-text-2)] lg:pb-2">
                {b.detail}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** Testimonials and metrics. Renders only real data from landing-content.ts; empty by default. */
export function Proof() {
  if (TESTIMONIALS.length === 0 && METRICS.length === 0) return null;
  return (
    <section aria-labelledby="proof-h" className="lp-light py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <h2 id="proof-h" className="lp-display text-[2.4rem] sm:text-[3.6rem]">
          Quem já treina no ritmo
        </h2>
        {METRICS.length > 0 && (
          <dl className="mt-12 grid gap-8 sm:grid-cols-3">
            {METRICS.map((m) => (
              <div key={m.label}>
                <dt className="text-[var(--lp-dark-2)]">{m.label}</dt>
                <dd className="lp-display mt-2 text-5xl">{m.value}</dd>
                <dd className="mt-1 text-xs text-[var(--lp-dark-2)]">Fonte: {m.source}</dd>
              </div>
            ))}
          </dl>
        )}
        {TESTIMONIALS.length > 0 && (
          <ul className="mt-12 grid gap-6 md:grid-cols-2">
            {TESTIMONIALS.map((t) => (
              <li key={t.name}>
                <figure className="rounded-[var(--lp-radius)] bg-white p-7">
                  <blockquote className="text-lg leading-relaxed">“{t.quote}”</blockquote>
                  <figcaption className="mt-5 text-sm">
                    <span className="font-semibold">{t.name}</span> <span className="text-[var(--lp-dark-2)]">· {t.role}</span>
                  </figcaption>
                </figure>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
