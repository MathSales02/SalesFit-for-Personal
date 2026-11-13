"use client";

import { usePathname } from "next/navigation";
import { useEffect, ViewTransition } from "react";

/**
 * Exit animation classes (motion.css) by navigation type. Swipes between tabs tag their navigation
 * (swipe-navigation.tsx) and leave sideways; every other page change fades.
 */
const PAGE_EXIT = { "swipe-next": "page-swipe-next", "swipe-prev": "page-swipe-prev", default: "page" };

/** Shown on screen: not display:none (e.g. the tab bar on a desktop). */
const shown = (el: Element | null): el is HTMLElement => !!el && el.getClientRects().length > 0;

/**
 * The leaving page is a picture drawn above everything; motion.css cuts it with --vt-clip to the
 * band between the shell's header (.vt-header) and tab bar (.vt-tabbar), so both stay visible and
 * untouched. Measured right as the browser takes the picture: that is when the page is where the
 * picture will be drawn (before the new page scrolls to the top).
 */
function measureClip() {
  const page = document.querySelector(".motion-page");
  if (!page) return;
  const header = document.querySelector(".vt-header");
  const tabbar = document.querySelector(".vt-tabbar");
  const pageTop = page.getBoundingClientRect().top;
  const top = shown(header) ? header.getBoundingClientRect().bottom : 0;
  const bottom = shown(tabbar) ? tabbar.getBoundingClientRect().top : window.innerHeight;
  // In the picture's own coordinates: its top edge is the page's top.
  document.documentElement.style.setProperty("--vt-clip", `inset(${Math.max(0, top - pageTop)}px 0 calc(100% - ${bottom - pageTop}px) 0)`);
}

/** React starts every View Transition through document.startViewTransition: measure first. */
function useClipAtTransitionStart() {
  useEffect(() => {
    const doc = document as Document & { salesfitClip?: true };
    if (doc.salesfitClip || typeof doc.startViewTransition !== "function") return;
    doc.salesfitClip = true;
    const start = doc.startViewTransition.bind(doc);
    doc.startViewTransition = ((arg?: Parameters<Document["startViewTransition"]>[0]) => {
      measureClip();
      return start(arg);
    }) as Document["startViewTransition"];
  }, []);
}

/**
 * Wraps the content area of a layout, once per screen (shell or auth layout, never nested).
 *
 * A new address means a new page. The new page is there at once, real and tappable, and its title
 * and blocks settle in (.motion-page, CSS only). The old one fades out above it as a browser View
 * Transition, so there is no blank frame between them. Navigation is never delayed.
 *
 * Anything that stays on the same address (router.refresh after a form, search filters in the
 * query string) does not animate: `default="none"`.
 */
export function PageTransition({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const pathname = usePathname();
  useClipAtTransitionStart();
  return (
    <ViewTransition key={pathname} exit={PAGE_EXIT} default="none">
      <div className={`motion-page ${className}`}>{children}</div>
    </ViewTransition>
  );
}

/** Wraps a loading placeholder: it fades out as the page's content arrives in its place. */
export function SkeletonTransition({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition exit="skeleton-exit" default="none">
      {children}
    </ViewTransition>
  );
}
