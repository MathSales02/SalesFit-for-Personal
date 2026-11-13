"use client";

import { useEffect, useState } from "react";

/**
 * Keeps a menu or panel on the page while its closing animation plays, then removes it.
 *
 *   const { mounted, state, attach } = usePresence(open);
 *   {mounted && <div ref={attach} data-state={state} className="motion-pop">…</div>}
 *
 * The animation itself is CSS (.motion-pop in motion.css). When nothing animates (reduced
 * motion), it is removed at once. Opening again while it closes simply reopens it.
 */
export function usePresence<T extends HTMLElement = HTMLDivElement>(open: boolean) {
  const [node, setNode] = useState<T | null>(null);
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);

  useEffect(() => {
    if (open || !mounted) return;
    let live = true;
    const remove = () => {
      if (live) setMounted(false);
    };
    // The closing animation starts with this render; wait for it (none: next microtask).
    Promise.all((node?.getAnimations() ?? []).map((a) => a.finished)).then(remove, remove);
    return () => {
      live = false;
    };
  }, [open, mounted, node]);

  return { mounted, attach: setNode, state: open ? ("open" as const) : ("closed" as const) };
}
