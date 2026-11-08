"use client";

import { gsap } from "gsap";
import { ScrollToPlugin } from "gsap/ScrollToPlugin";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";

// Registered once for the whole landing page.
gsap.registerPlugin(useGSAP, ScrollTrigger, ScrollToPlugin, SplitText);

/** Motion tokens (one beat = 0.5 s). */
export const BEAT = 0.5;
export const EASE_OUT = "expo.out";
export const EASE_IN_OUT = "power2.inOut";

export const MQ = {
  desktop: "(min-width: 1024px) and (pointer: fine) and (prefers-reduced-motion: no-preference)",
  motion: "(prefers-reduced-motion: no-preference)",
  reduce: "(prefers-reduced-motion: reduce)",
  fine: "(pointer: fine) and (prefers-reduced-motion: no-preference)",
};

/**
 * Entrance animations only run while the page is still fresh. If JavaScript arrived
 * late, the CSS fallback has already shown everything: animating it again would flicker.
 */
export const introAllowed = () => performance.now() < 1300 && window.matchMedia(MQ.motion).matches;

export { gsap, ScrollTrigger, ScrollToPlugin, SplitText, useGSAP };
