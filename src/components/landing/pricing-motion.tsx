"use client";

import { useRef } from "react";
import { BEAT, EASE_OUT, gsap, MQ, useGSAP } from "./gsap";

/** Price cards: staggered entrance and a light tilt under a fine pointer. */
export function PricingMotion({ children }: { children: React.ReactNode }) {
  const scope = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const cards = gsap.utils.toArray<HTMLElement>("[data-card]", scope.current);
      const mm = gsap.matchMedia();
      mm.add(MQ.motion, () => {
        gsap.from(cards, { y: 48, opacity: 0, duration: BEAT * 1.6, ease: EASE_OUT, stagger: 0.08, scrollTrigger: { trigger: scope.current, start: "top 80%", once: true } });
      });
      mm.add(MQ.fine, () => {
        const off = cards.map((card) => {
          const rx = gsap.quickTo(card, "rotationX", { duration: 0.5, ease: "power3.out" });
          const ry = gsap.quickTo(card, "rotationY", { duration: 0.5, ease: "power3.out" });
          gsap.set(card, { transformPerspective: 900 });
          const move = (e: PointerEvent) => {
            const r = card.getBoundingClientRect();
            ry(((e.clientX - r.left) / r.width - 0.5) * 6);
            rx(-((e.clientY - r.top) / r.height - 0.5) * 6);
          };
          const leave = () => {
            rx(0);
            ry(0);
          };
          card.addEventListener("pointermove", move);
          card.addEventListener("pointerleave", leave);
          return () => {
            card.removeEventListener("pointermove", move);
            card.removeEventListener("pointerleave", leave);
          };
        });
        return () => off.forEach((f) => f());
      });
    },
    { scope },
  );
  return <div ref={scope}>{children}</div>;
}
