"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { isActive } from "./nav-link";

// Gesture tuning. All distances in CSS pixels, times in milliseconds.
/** Horizontal travel needed to change screens. */
const MIN_DISTANCE_PX = 70;
/** Shorter travel accepted when the finger moves faster than FAST_VELOCITY. */
const MIN_FAST_DISTANCE_PX = 40;
/** Pixels per millisecond above which a swipe counts as fast. */
const FAST_VELOCITY = 0.5;
/** Movement after which the gesture is locked as horizontal or dropped as a scroll. */
const LOCK_PX = 10;
/** Horizontal travel must be at least this many times the vertical travel. */
const MIN_RATIO = 1.5;
/** Slower gestures are a drag or a long press, not a swipe. */
const MAX_DURATION_MS = 600;
/** Touches starting this close to a side edge belong to the system back gesture. */
const EDGE_PX = 24;
/** Entrance of the new screen. */
const TRANSITION_MS = 220;
const SLIDE_PX = 32;
/** The on-screen keyboard is taken as open when it covers at least this much. */
const KEYBOARD_MIN_PX = 120;
/** Releases the lock if a navigation never lands (offline, redirect to the same page). */
const NAVIGATION_TIMEOUT_MS = 4000;

/** Touches that start here never change screens. `data-no-swipe` is the opt-out for future cases. */
const NO_SWIPE = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [draggable="true"], [role="slider"], canvas, video, iframe, [data-no-swipe]';
/** While any of these is on screen the gesture is off. */
const OVERLAYS = 'dialog[open], [role="dialog"], [aria-modal="true"], [role="menu"], #more-menu';
const TEXT_FIELDS = "textarea, select, input:not([type=button], [type=submit], [type=checkbox], [type=radio], [type=file], [type=range])";

// Module state, so it survives the shell remounting between layouts (e.g. into /conta).
let busy = false;
let arriving: { direction: 1 | -1; from: string; timer: number } | null = null;

function startsInExcludedArea(target: EventTarget | null) {
  if (!(target instanceof Element)) return true;
  if (target.closest(NO_SWIPE)) return true;
  // Anything that really scrolls sideways (wide tables, card rails) keeps the gesture.
  for (let el: Element | null = target; el && el !== document.documentElement; el = el.parentElement) {
    if (el.scrollWidth > el.clientWidth + 1) {
      const overflow = getComputedStyle(el).overflowX;
      if (overflow === "auto" || overflow === "scroll") return true;
    }
  }
  return false;
}

const overlayOpen = () => document.querySelector(OVERLAYS) !== null;

function keyboardOpen() {
  const el = document.activeElement;
  if (el instanceof HTMLElement && (el.isContentEditable || el.matches(TEXT_FIELDS))) return true;
  const vv = window.visualViewport;
  return !!vv && window.innerHeight - vv.height > KEYBOARD_MIN_PX;
}

function textSelected() {
  const s = window.getSelection();
  return !!s && !s.isCollapsed && s.toString().trim() !== "";
}

/**
 * Horizontal swipes move between the screens of the main menu, in menu order, on touch devices.
 * `hrefs` must be the list the visible menu is built from; `mobileQuery` the media query of the
 * layout that shows the tab bar. Outside it no touch listener is registered.
 */
export function useSwipeNavigation(hrefs: readonly string[], mobileQuery: string) {
  const pathname = usePathname();
  const router = useRouter();
  // Same rule as the menu's highlight, so sub-pages count as their parent item.
  const index = hrefs.findIndex((h) => isActive(pathname, h));
  const previous = index > 0 ? hrefs[index - 1] : undefined;
  const next = index >= 0 && index < hrefs.length - 1 ? hrefs[index + 1] : undefined;

  // The new screen slides in from the side the finger pulled it from.
  useEffect(() => {
    const a = arriving;
    if (!a || a.from === pathname) return;
    window.clearTimeout(a.timer);
    arriving = null;
    const main = document.querySelector("main");
    if (!main || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      busy = false;
      return;
    }
    const animation = main.animate(
      [
        { transform: `translateX(${a.direction * SLIDE_PX}px)`, opacity: 0 },
        { transform: "translateX(0)", opacity: 1 },
      ],
      { duration: TRANSITION_MS, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" },
    );
    const release = () => {
      busy = false;
    };
    animation.addEventListener("finish", release);
    animation.addEventListener("cancel", release);
  }, [pathname]);

  useEffect(() => {
    if (!previous && !next) return;
    const media = window.matchMedia(`(pointer: coarse) and ${mobileQuery}`);

    function attach() {
      // Neighbours are fetched ahead, so the change is immediate.
      if (previous) router.prefetch(previous);
      if (next) router.prefetch(next);

      let gesture: { x: number; y: number; at: number; horizontal: boolean } | null = null;

      // Menus close themselves on pointerdown, which comes before touchstart: the touch that
      // dismisses one must not also change screens, so the state is read here, in capture.
      let overlayAtPress = false;
      const onPress = () => {
        overlayAtPress = overlayOpen();
      };

      const onStart = (e: TouchEvent) => {
        gesture = null;
        const t = e.touches[0];
        if (e.touches.length !== 1 || !t || busy) return;
        if (t.clientX < EDGE_PX || t.clientX > window.innerWidth - EDGE_PX) return;
        if (overlayAtPress || overlayOpen() || keyboardOpen() || startsInExcludedArea(e.target)) return;
        gesture = { x: t.clientX, y: t.clientY, at: e.timeStamp, horizontal: false };
      };

      const onMove = (e: TouchEvent) => {
        const t = e.touches[0];
        if (!gesture || !t) return;
        if (e.touches.length !== 1) {
          gesture = null;
          return;
        }
        if (gesture.horizontal) return;
        const dx = Math.abs(t.clientX - gesture.x);
        const dy = Math.abs(t.clientY - gesture.y);
        if (Math.max(dx, dy) < LOCK_PX) return;
        // A vertical start is a scroll: ignored until the finger lifts.
        if (dy > dx) gesture = null;
        else gesture.horizontal = true;
      };

      const onEnd = (e: TouchEvent) => {
        const g = gesture;
        gesture = null;
        const t = e.changedTouches[0];
        if (!g || !g.horizontal || !t || e.touches.length > 0 || busy) return;
        const dx = t.clientX - g.x;
        const distance = Math.abs(dx);
        const elapsed = e.timeStamp - g.at;
        if (elapsed > MAX_DURATION_MS) return;
        if (distance < Math.abs(t.clientY - g.y) * MIN_RATIO) return;
        const fast = elapsed > 0 && distance / elapsed > FAST_VELOCITY;
        if (distance < (fast ? MIN_FAST_DISTANCE_PX : MIN_DISTANCE_PX)) return;
        if (textSelected() || overlayOpen() || keyboardOpen()) return;
        // Finger moving left brings the next screen; moving right, the previous one.
        const target = dx < 0 ? next : previous;
        if (!target) return;
        busy = true;
        arriving = {
          direction: dx < 0 ? 1 : -1,
          from: window.location.pathname,
          timer: window.setTimeout(() => {
            busy = false;
            arriving = null;
          }, NAVIGATION_TIMEOUT_MS),
        };
        router.push(target);
      };

      const onCancel = () => {
        gesture = null;
      };

      const passive = { passive: true } as const;
      document.addEventListener("pointerdown", onPress, { capture: true, passive: true });
      document.addEventListener("touchstart", onStart, passive);
      document.addEventListener("touchmove", onMove, passive);
      document.addEventListener("touchend", onEnd, passive);
      document.addEventListener("touchcancel", onCancel, passive);
      return () => {
        document.removeEventListener("pointerdown", onPress, { capture: true });
        document.removeEventListener("touchstart", onStart);
        document.removeEventListener("touchmove", onMove);
        document.removeEventListener("touchend", onEnd);
        document.removeEventListener("touchcancel", onCancel);
      };
    }

    let detach: (() => void) | null = null;
    const sync = () => {
      if (media.matches && !detach) detach = attach();
      else if (!media.matches && detach) {
        detach();
        detach = null;
      }
    };
    sync();
    media.addEventListener("change", sync);
    return () => {
      media.removeEventListener("change", sync);
      detach?.();
    };
  }, [previous, next, mobileQuery, router]);
}

/** Mounts the gesture from a server-rendered shell. Renders nothing. */
export function SwipeNavigation({ hrefs, mobileQuery }: { hrefs: string[]; mobileQuery: string }) {
  useSwipeNavigation(hrefs, mobileQuery);
  return null;
}
