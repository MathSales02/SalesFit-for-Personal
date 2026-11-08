"use client";

import { useRef, useState } from "react";
import { BEAT, EASE_OUT, gsap, MQ, ScrollTrigger, useGSAP } from "./gsap";
import { FEATURES, type FeatureId } from "./landing-content";
import {
  MockAlunos,
  MockBuilder,
  MockComunidade,
  MockConstancia,
  MockEvolucao,
  MockPlayer,
  MockRanking,
  PhoneFrame,
} from "./mockups";

function Screen({ id }: { id: FeatureId }) {
  switch (id) {
    case "treinos":
      return <MockBuilder />;
    case "celular":
      return (
        <PhoneFrame className="mx-auto w-[min(300px,100%)]">
          <MockPlayer />
        </PhoneFrame>
      );
    case "evolucao":
      return <MockEvolucao />;
    case "constancia":
      return (
        <div className="grid gap-4">
          <MockConstancia />
          <MockRanking />
        </div>
      );
    case "comunidade":
      return <MockComunidade />;
    case "alunos":
      return <MockAlunos />;
  }
}

/**
 * Desktop with motion: the section pins and the screen follows the scroll (or the
 * selected item). Mobile / reduced motion: plain tabs. Same tab semantics in both.
 */
export function Features() {
  const scope = useRef<HTMLElement>(null);
  const pinBox = useRef<HTMLDivElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const trigger = useRef<ScrollTrigger | null>(null);
  const [active, setActive] = useState(0);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MQ.desktop, () => {
        const n = FEATURES.length;
        trigger.current = ScrollTrigger.create({
          trigger: pinBox.current,
          start: "top top+=96",
          end: () => `+=${window.innerHeight * 0.55 * n}`,
          pin: true,
          onUpdate: (self) =>
            setActive(Math.min(n - 1, Math.floor(self.progress * n * 0.999))),
        });
        return () => {
          trigger.current = null;
        };
      });
      mm.add(MQ.motion, () => {
        gsap.from("[data-reveal]", {
          y: 40,
          opacity: 0,
          duration: BEAT * 1.6,
          ease: EASE_OUT,
          stagger: 0.08,
          scrollTrigger: {
            trigger: scope.current,
            start: "top 75%",
            once: true,
          },
        });
      });
    },
    { scope },
  );

  // Crossfade between screens.
  useGSAP(
    () => {
      const panels = gsap.utils.toArray<HTMLElement>(
        "[data-screen]",
        scope.current,
      );
      const reduce = window.matchMedia(MQ.reduce).matches;
      panels.forEach((p, i) => {
        const on = i === active;
        gsap.to(p, {
          autoAlpha: on ? 1 : 0,
          y: on || reduce ? 0 : 16,
          duration: reduce ? 0.15 : BEAT,
          ease: EASE_OUT,
          overwrite: "auto",
        });
      });
    },
    { scope, dependencies: [active] },
  );

  function select(i: number, focus = false) {
    const t = trigger.current;
    if (t) {
      // Pinned: move the scroll to that item's slot, the screen follows.
      const y = t.start + ((t.end - t.start) * (i + 0.5)) / FEATURES.length;
      gsap.to(window, {
        scrollTo: y,
        duration: BEAT * 1.4,
        ease: "power2.inOut",
      });
    }
    setActive(i);
    if (focus) tabs.current[i]?.focus();
  }

  function onKey(e: React.KeyboardEvent, i: number) {
    const n = FEATURES.length;
    const map: Record<string, number> = {
      ArrowDown: (i + 1) % n,
      ArrowRight: (i + 1) % n,
      ArrowUp: (i - 1 + n) % n,
      ArrowLeft: (i - 1 + n) % n,
      Home: 0,
      End: n - 1,
    };
    if (!(e.key in map)) return;
    e.preventDefault();
    select(map[e.key]!, true);
  }

  return (
    <section
      ref={scope}
      id="funcionalidades"
      aria-labelledby="feat-h"
      className="lp-light relative py-24 sm:py-32"
    >
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <h2
          id="feat-h"
          data-reveal=""
          className="lp-display max-w-3xl text-[2.6rem] sm:text-[4rem]"
        >
          Do primeiro convite ao recorde do aluno.
        </h2>
        <p
          data-reveal=""
          className="mt-5 max-w-xl text-lg text-[var(--lp-dark-2)]"
        >
          Seis peças que já funcionam hoje, todas incluídas em qualquer plano.
        </p>

        <div
          ref={pinBox}
          className="mt-12 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-start"
        >
          <div
            role="tablist"
            aria-label="Funcionalidades"
            aria-orientation="vertical"
            className="flex flex-col gap-2"
          >
            {FEATURES.map((f, i) => (
              <button
                key={f.id}
                ref={(el) => {
                  tabs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`feat-tab-${f.id}`}
                aria-selected={i === active}
                aria-controls={`feat-panel-${f.id}`}
                tabIndex={i === active ? 0 : -1}
                onClick={() => select(i)}
                onKeyDown={(e) => onKey(e, i)}
                className={`group rounded-[20px] border px-5 py-4 text-left transition-colors duration-300 ${
                  i === active
                    ? "border-[var(--lp-dark)] bg-white shadow-[0_18px_40px_-28px_rgba(0,0,0,0.5)]"
                    : "border-[var(--lp-line-light)] hover:border-[var(--lp-dark-2)]"
                }`}
              >
                <span className="flex items-baseline gap-3">
                  <span
                    className={`text-xs font-semibold tabular-nums ${i === active ? "text-[var(--lp-orange-ink)]" : "text-[var(--lp-dark-2)]"}`}
                  >
                    0{i + 1}
                  </span>
                  <span className="text-lg font-semibold">{f.name}</span>
                </span>
                <span
                  className={`grid transition-[grid-template-rows] duration-500 ${i === active ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
                >
                  <span className="overflow-hidden">
                    <span className="mt-2 block text-[0.95rem] leading-relaxed text-[var(--lp-dark-2)]">
                      {f.pitch}
                    </span>
                    <span className="mt-2 block text-[0.95rem] font-semibold text-[var(--lp-dark)]">
                      {f.gain}
                    </span>
                  </span>
                </span>
              </button>
            ))}
          </div>

          <div>
            <div className="relative min-h-[480px] rounded-[var(--lp-radius)] bg-[var(--lp-bone-2)] p-5 sm:min-h-[520px] sm:p-8">
              {FEATURES.map((f, i) => (
                <div
                  key={f.id}
                  id={`feat-panel-${f.id}`}
                  role="tabpanel"
                  aria-labelledby={`feat-tab-${f.id}`}
                  data-screen=""
                  aria-hidden={i !== active}
                  className={`absolute inset-5 flex items-center justify-center sm:inset-8 ${i === active ? "" : "pointer-events-none opacity-0"}`}
                >
                  <div className="w-full max-w-md">
                    <Screen id={f.id} />
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-right text-xs text-[var(--lp-dark-2)]">
              Tela do sistema com dados de exemplo
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
