"use client";

import { useRef, useState } from "react";
import { Beats } from "./brand";
import { BEAT, EASE_OUT, gsap, MQ, useGSAP } from "./gsap";
import { DEMOS } from "./landing-content";
import { PhoneFrame } from "./mockups";
import { VideoPlayer } from "./video-player";
import { useT } from "@/i18n/client";

/** "Uma gestão mais inteligente." Real recordings, one chapter at a time. */
export function Demo() {
  const t = useT();
  const clips = DEMOS.filter((d) => d.src);
  const [index, setIndex] = useState(0);
  const scope = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MQ.motion, () => {
        gsap.from("[data-reveal]", { y: 40, opacity: 0, duration: BEAT * 1.6, ease: EASE_OUT, stagger: 0.08, scrollTrigger: { trigger: scope.current, start: "top 75%", once: true } });
      });
    },
    { scope },
  );

  if (clips.length === 0) return null;
  const clip = clips[index]!;

  function select(i: number) {
    if (i === index) return;
    setIndex(i);
    if (stage.current && !window.matchMedia(MQ.reduce).matches) {
      gsap.fromTo(stage.current, { autoAlpha: 0.2, scale: 0.985 }, { autoAlpha: 1, scale: 1, duration: BEAT, ease: EASE_OUT });
    }
  }

  function onKey(e: React.KeyboardEvent, i: number) {
    const keys: Record<string, number> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
    let next = -1;
    if (e.key in keys) next = (i + keys[e.key]! + clips.length) % clips.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = clips.length - 1;
    if (next < 0) return;
    e.preventDefault();
    select(next);
    tabs.current[next]?.focus();
  }

  return (
    <section ref={scope} id="demonstracao" aria-labelledby="demo-h" className="lp-dark relative py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <h2 id="demo-h" data-reveal="" className="lp-display max-w-3xl text-[2.6rem] sm:text-[4rem]">
            {t("Uma gestão mais inteligente.")} <span className="text-[var(--lp-orange-on-dark)]">{t("Em cada movimento.")}</span>
          </h2>
          <p data-reveal="" className="max-w-sm text-[var(--lp-text-2)]">
            {t("Gravações do sistema real, com dados de exemplo. Escolha um capítulo.")}
          </p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <div role="tablist" aria-label={t("Capítulos da demonstração")} aria-orientation="vertical" data-reveal="" className="lp-no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
            {clips.map((c, i) => (
              <button
                key={c.id}
                ref={(el) => {
                  tabs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`demo-tab-${c.id}`}
                aria-selected={i === index}
                aria-controls="demo-panel"
                tabIndex={i === index ? 0 : -1}
                onClick={() => select(i)}
                onKeyDown={(e) => onKey(e, i)}
                className={`shrink-0 rounded-2xl border px-4 py-3 text-left transition-colors lg:shrink ${
                  i === index ? "border-[var(--lp-orange)] bg-white/[0.06]" : "border-white/10 hover:border-white/30"
                }`}
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-white">
                  <span className="text-xs text-[var(--lp-text-2)] tabular-nums">0{i + 1}</span>
                  {t(c.title)}
                </span>
                <span className="mt-1 hidden text-sm leading-snug text-[var(--lp-text-2)] lg:block">{t(c.text)}</span>
              </button>
            ))}
          </div>

          <div id="demo-panel" role="tabpanel" aria-labelledby={`demo-tab-${clip.id}`} data-reveal="">
            <div ref={stage} className="relative aspect-[16/10] overflow-hidden rounded-[var(--lp-radius)] border border-white/10 bg-[var(--lp-ink-2)]">
              {clip.frame === "desktop" ? (
                <div className="absolute inset-0 flex flex-col">
                  <div aria-hidden="true" className="flex h-8 shrink-0 items-center gap-1.5 border-b border-white/10 px-4">
                    <span className="size-2.5 rounded-full bg-white/20" />
                    <span className="size-2.5 rounded-full bg-white/20" />
                    <span className="size-2.5 rounded-full bg-white/20" />
                  </div>
                  <div className="min-h-0 flex-1">
                    <VideoPlayer key={clip.id} src={clip.src} poster={clip.poster} width={clip.width} height={clip.height} label={t(clip.title)} />
                  </div>
                </div>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center gap-10 p-4 sm:p-6">
                  <Beats className="hidden h-40 w-28 text-white/15 sm:grid" heights={[30, 55, 45, 85, 70, 40, 50]} on={[]} />
                  <PhoneFrame className="h-full">
                    <div className="aspect-[390/844] h-[calc(100%)] max-h-full">
                      <VideoPlayer key={clip.id} src={clip.src} poster={clip.poster} width={clip.width} height={clip.height} label={t(clip.title)} />
                    </div>
                  </PhoneFrame>
                  <Beats className="hidden h-40 w-28 text-white/15 sm:grid" heights={[50, 40, 70, 85, 45, 55, 30]} on={[]} />
                </div>
              )}
            </div>
            <p className="mt-4 text-[var(--lp-text-2)] lg:hidden">{t(clip.text)}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
