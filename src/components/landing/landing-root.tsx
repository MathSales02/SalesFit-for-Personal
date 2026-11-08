"use client";

import { useRef } from "react";
import { ScrollTrigger, useGSAP } from "./gsap";

/**
 * Root of the landing page. Marks that the motion code is running (which turns
 * off the CSS fallback for the hero entrance) and refreshes scroll positions
 * once fonts and images have settled.
 */
export function LandingRoot({ children }: { children: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      root.current?.setAttribute("data-motion", "");
      void document.fonts?.ready.then(() => ScrollTrigger.refresh());
      const onLoad = () => ScrollTrigger.refresh();
      window.addEventListener("load", onLoad);
      return () => window.removeEventListener("load", onLoad);
    },
    { scope: root },
  );
  return (
    <div ref={root} className="lp">
      {children}
    </div>
  );
}
