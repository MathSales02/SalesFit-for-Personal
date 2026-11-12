"use client";

import { useEffect, useRef, useState } from "react";

const brl = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const DURATION_MS = 500;

/**
 * A price whose digits run to the new value when it changes (monthly to yearly, for instance).
 * Only the number moves: fixed-width digits keep everything around it still. Screen readers get
 * the final value once, not every frame; with reduced motion the value simply changes.
 */
export function AnimatedPrice({ cents, className = "" }: { cents: number; className?: string }) {
  const [shown, setShown] = useState(cents);
  const from = useRef(cents);

  useEffect(() => {
    const start = from.current;
    if (start === cents) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      from.current = cents;
      const id = requestAnimationFrame(() => setShown(cents));
      return () => cancelAnimationFrame(id);
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / DURATION_MS);
      // Fast at first, settling at the end.
      const eased = 1 - Math.pow(1 - t, 3);
      const value = Math.round(start + (cents - start) * eased);
      from.current = value;
      setShown(value);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [cents]);

  return (
    <>
      <span aria-hidden="true" className={`tabular-nums ${className}`}>
        {brl(shown)}
      </span>
      <span className="sr-only">{brl(cents)}</span>
    </>
  );
}
