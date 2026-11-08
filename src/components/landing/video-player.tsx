"use client";

import { useEffect, useRef, useState } from "react";
import { gsap, MQ } from "./gsap";

/**
 * Silent looping demo clip.
 *  - loads and plays only while visible; pauses off screen
 *  - no autoplay with reduced motion (the poster shows, play is one click away)
 *  - keyboard-accessible play/pause; space reserved by aspect-ratio (no layout shift)
 */
export function VideoPlayer({ src, poster, width, height, label }: { src: string; poster: string; width: number; height: number; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const cursor = useRef<HTMLSpanElement>(null);
  const [playing, setPlaying] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const v = video.current;
    const el = box.current;
    if (!v || !el) return;
    const reduce = window.matchMedia(MQ.reduce).matches;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setLoaded(true);
          if (!reduce && !userPaused) void v.play().catch(() => undefined);
        } else if (!v.paused) {
          v.pause();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [src, userPaused]);

  // Custom cursor over the video (fine pointers, no reduced motion).
  useEffect(() => {
    const el = box.current;
    const c = cursor.current;
    if (!el || !c || !window.matchMedia(MQ.fine).matches) return;
    const xTo = gsap.quickTo(c, "x", { duration: 0.25, ease: "power3.out" });
    const yTo = gsap.quickTo(c, "y", { duration: 0.25, ease: "power3.out" });
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      xTo(e.clientX - r.left);
      yTo(e.clientY - r.top);
    };
    const enter = () => gsap.to(c, { autoAlpha: 1, scale: 1, duration: 0.25 });
    const leave = () => gsap.to(c, { autoAlpha: 0, scale: 0.6, duration: 0.25 });
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerenter", enter);
    el.addEventListener("pointerleave", leave);
    el.dataset.cursor = "on";
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerenter", enter);
      el.removeEventListener("pointerleave", leave);
      delete el.dataset.cursor;
    };
  }, []);

  function toggle() {
    const v = video.current;
    if (!v) return;
    setLoaded(true);
    if (v.paused) {
      setUserPaused(false);
      void v.play().catch(() => undefined);
    } else {
      setUserPaused(true);
      v.pause();
    }
  }

  return (
    <div ref={box} className="group relative h-full w-full data-[cursor=on]:cursor-none" onClick={toggle}>
      <video
        ref={video}
        muted
        loop
        playsInline
        preload="none"
        poster={poster}
        width={width}
        height={height}
        aria-label={label}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        className="block h-full w-full object-cover object-top"
      >
        {loaded && <source src={`${src}.webm`} type="video/webm" />}
        {loaded && <source src={`${src}.mp4`} type="video/mp4" />}
      </video>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          toggle();
        }}
        aria-label={playing ? `Pausar vídeo: ${label}` : `Reproduzir vídeo: ${label}`}
        aria-pressed={playing}
        className="absolute right-3 bottom-3 grid size-11 cursor-pointer place-items-center rounded-full bg-black/75 text-white ring-1 ring-white/20 backdrop-blur hover:bg-black"
      >
        {playing ? (
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <rect x="3" y="2" width="3.5" height="12" rx="1" fill="currentColor" />
            <rect x="9.5" y="2" width="3.5" height="12" rx="1" fill="currentColor" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 2.5v11l9.5-5.5z" fill="currentColor" />
          </svg>
        )}
      </button>
      <span
        ref={cursor}
        aria-hidden="true"
        className="pointer-events-none absolute top-0 left-0 -mt-9 -ml-9 grid size-18 place-items-center rounded-full bg-[var(--lp-orange)] text-xs font-semibold text-black opacity-0"
      >
        {playing ? "Pausar" : "Assistir"}
      </span>
    </div>
  );
}
