"use client";

import { useRef } from "react";
import { BEAT, EASE_OUT, gsap, introAllowed, MQ, useGSAP } from "./gsap";
import { scrollToSection } from "./navbar";

/** Anchor that scrolls smoothly to a landing section. Works as a plain link without JS. */
export function SectionLink({ id, className, children }: { id: string; className?: string; children: React.ReactNode }) {
  return (
    <a
      href={`#${id}`}
      className={className}
      onClick={(e) => {
        e.preventDefault();
        scrollToSection(id);
      }}
    >
      {children}
    </a>
  );
}

/** Hero choreography: one timeline; content is readable within ~1.2 s. */
export function HeroMotion({ children }: { children: React.ReactNode }) {
  const scope = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const q = gsap.utils.selector(scope);
      const anim = q("[data-hero-anim]");
      if (!introAllowed()) {
        gsap.set(anim, { opacity: 1 });
        return;
      }
      const tl = gsap.timeline({ defaults: { ease: EASE_OUT, duration: BEAT * 1.6 } });
      tl.fromTo(anim[0] ?? [], { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: BEAT * 1.2 }, 0.05)
        .fromTo(q(".lp-beats > span"), { scaleY: 0.2 }, { scaleY: 1, stagger: 0.05, duration: BEAT }, 0.1)
        .fromTo(anim.slice(1), { y: 48, opacity: 0, rotate: -2 }, { y: 0, opacity: 1, rotate: 0, stagger: 0.12 }, 0.35);
      // Counters inside the example screens.
      q("[data-count]").forEach((el) => {
        const end = Number(el.getAttribute("data-count"));
        const o = { v: 0 };
        tl.to(o, { v: end, duration: BEAT * 2, ease: "power2.out", onUpdate: () => (el.textContent = String(Math.round(o.v))) }, 0.5);
      });

      const mm = gsap.matchMedia();
      mm.add(MQ.desktop, () => {
        // Gentle float, each layer on its own phase.
        q("[data-float]").forEach((el, i) => {
          gsap.to(el, { y: "+=8", duration: 3 + i * 0.6, ease: "sine.inOut", yoyo: true, repeat: -1, delay: 1.5 + i * 0.3 });
        });
        // Parallax by pointer: deeper layers move more.
        const layers = q("[data-depth]").map((el) => ({
          x: gsap.quickTo(el, "x", { duration: 0.8, ease: "power3.out" }),
          y: gsap.quickTo(el, "y", { duration: 0.8, ease: "power3.out" }),
          d: Number(el.getAttribute("data-depth")),
        }));
        const onMove = (e: PointerEvent) => {
          const nx = e.clientX / window.innerWidth - 0.5;
          const ny = e.clientY / window.innerHeight - 0.5;
          layers.forEach((l) => {
            l.x(nx * -16 * l.d);
            l.y(ny * -12 * l.d);
          });
        };
        window.addEventListener("pointermove", onMove, { passive: true });
        return () => window.removeEventListener("pointermove", onMove);
      });
      mm.add(MQ.fine, () => {
        // Magnetic primary button.
        const cleanups = (q("[data-magnetic]") as HTMLElement[]).map((el) => {
          const xTo = gsap.quickTo(el, "x", { duration: 0.4, ease: "power3.out" });
          const yTo = gsap.quickTo(el, "y", { duration: 0.4, ease: "power3.out" });
          const move = (e: PointerEvent) => {
            const r = el.getBoundingClientRect();
            xTo((e.clientX - (r.left + r.width / 2)) * 0.15);
            yTo((e.clientY - (r.top + r.height / 2)) * 0.25);
          };
          const leave = () => {
            xTo(0);
            yTo(0);
          };
          el.addEventListener("pointermove", move);
          el.addEventListener("pointerleave", leave);
          return () => {
            el.removeEventListener("pointermove", move);
            el.removeEventListener("pointerleave", leave);
          };
        });
        return () => cleanups.forEach((c) => c());
      });
    },
    { scope },
  );

  return <div ref={scope}>{children}</div>;
}
