"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useInstallApp } from "@/components/pwa";
import { BrandLogo } from "./brand";
import { BEAT, EASE_OUT, gsap, introAllowed, MQ, ScrollTrigger, useGSAP } from "./gsap";
import { NAV } from "./landing-content";

/** Smooth scroll to a section, below the navbar. Instant when the visitor prefers reduced motion. */
export function scrollToSection(id: string) {
  const reduce = window.matchMedia(MQ.reduce).matches;
  const target = document.getElementById(id);
  if (!target) return;
  gsap.to(window, {
    duration: reduce ? 0 : 0.9,
    ease: "power3.inOut",
    scrollTo: { y: target, offsetY: 88 },
  });
  history.replaceState(null, "", `#${id}`);
}

export function Navbar() {
  const root = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLElement>(null);
  const indicator = useRef<HTMLSpanElement>(null);
  const links = useRef<(HTMLAnchorElement | null)[]>([]);
  const cta = useRef<HTMLAnchorElement>(null);
  const menuBtn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);
  const [beats, setBeats] = useState(0);
  const app = useInstallApp();

  // Liquid distortion only where the browser can render an SVG filter as a backdrop (Chromium).
  useEffect(() => {
    const brands = (navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } }).userAgentData?.brands ?? [];
    const chromium = brands.some((b) => b.brand === "Chromium");
    if (chromium && CSS.supports("backdrop-filter", "blur(1px)")) bar.current?.setAttribute("data-liquid", "");
  }, []);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      if (introAllowed()) gsap.fromTo(bar.current, { y: -28, opacity: 0 }, { y: 0, opacity: 1, duration: BEAT * 2, ease: EASE_OUT, delay: 0.1 });
      else gsap.set(bar.current, { opacity: 1 });

      // Compact and more opaque after the top. The bar stays on screen the whole way down.
      ScrollTrigger.create({
        start: 0,
        end: "max",
        onUpdate: (self) => {
          const y = self.scroll();
          if (y > 40) bar.current?.setAttribute("data-compact", "");
          else bar.current?.removeAttribute("data-compact");
          setBeats(Math.min(7, Math.ceil(self.progress * 7)));
        },
      });

      // Active section.
      NAV.forEach((item, i) => {
        const el = document.getElementById(item.id);
        if (!el) return;
        ScrollTrigger.create({
          trigger: el,
          start: "top 45%",
          end: "bottom 45%",
          // Computed after the pinned features section, which adds scroll space.
          refreshPriority: -1,
          onToggle: (self) => {
            if (self.isActive) setActive(i);
            else setActive((cur) => (cur === i ? -1 : cur));
          },
        });
      });

      // Magnetic CTA (fine pointers only).
      mm.add(MQ.fine, () => {
        const el = cta.current;
        if (!el) return;
        const xTo = gsap.quickTo(el, "x", { duration: 0.4, ease: "power3.out" });
        const yTo = gsap.quickTo(el, "y", { duration: 0.4, ease: "power3.out" });
        const move = (e: PointerEvent) => {
          const r = el.getBoundingClientRect();
          xTo((e.clientX - (r.left + r.width / 2)) * 0.18);
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
    },
    { scope: root },
  );

  // Sliding indicator under the active link.
  useEffect(() => {
    const el = indicator.current;
    const link = active >= 0 ? links.current[active] : null;
    if (!el) return;
    if (!link) {
      gsap.to(el, { autoAlpha: 0, duration: BEAT * 0.5 });
      return;
    }
    gsap.to(el, { x: link.offsetLeft, width: link.offsetWidth, autoAlpha: 1, duration: BEAT, ease: EASE_OUT });
  }, [active]);

  const close = useCallback(() => {
    setOpen(false);
    menuBtn.current?.focus();
  }, []);

  // Mobile menu: lock scroll, trap focus, Esc closes.
  useEffect(() => {
    const r = root.current;
    if (!r) return;
    if (!open) {
      delete r.dataset.menu;
      document.body.style.overflow = "";
      return;
    }
    r.dataset.menu = "open";
    document.body.style.overflow = "hidden";
    const focusables = () => [menuBtn.current, ...(panel.current?.querySelectorAll<HTMLElement>("a,button") ?? [])].filter(Boolean) as HTMLElement[];
    focusables()[1]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
      if (e.key === "Tab") {
        const f = focusables();
        const i = f.indexOf(document.activeElement as HTMLElement);
        if (e.shiftKey && i <= 0) {
          e.preventDefault();
          f[f.length - 1]?.focus();
        } else if (!e.shiftKey && i === f.length - 1) {
          e.preventDefault();
          f[0]?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    if (panel.current && !window.matchMedia(MQ.reduce).matches) {
      // Opacity, not visibility: links stay focusable while they fade in.
      gsap.fromTo(panel.current.querySelectorAll("[data-menu-item]"), { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: BEAT, ease: EASE_OUT, stagger: 0.04 });
    }
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, close]);

  const go = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    setOpen(false);
    scrollToSection(id);
  };

  return (
    <div ref={root} className="pointer-events-none fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-5 sm:pt-4">
      {/* SVG filter for the liquid edge (used by the glass in Chromium). */}
      <svg aria-hidden="true" width="0" height="0" className="absolute">
        <filter id="lp-liquid" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.008 0.02" numOctaves="2" seed="7" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="18" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>

      <header
        ref={bar}
        data-hero-anim=""
        className="lp-glass pointer-events-auto relative mx-auto flex h-16 max-w-6xl items-center gap-3 rounded-full pr-2 pl-5 transition-[height] duration-300 data-[compact]:h-14"
      >
        <Link href="/" aria-label="SalesFit, início" className="shrink-0">
          <BrandLogo />
        </Link>

        <nav aria-label="Seções" className="relative ml-6 hidden flex-1 items-center gap-1 xl:flex">
          <span ref={indicator} aria-hidden="true" className="absolute top-1/2 left-0 h-8 -translate-y-1/2 rounded-full bg-white/12 opacity-0" />
          {NAV.map((item, i) => (
            <a
              key={item.id}
              ref={(el) => {
                links.current[i] = el;
              }}
              href={`#${item.id}`}
              onClick={go(item.id)}
              aria-current={active === i ? "location" : undefined}
              className="group relative rounded-full px-3.5 py-2 text-[0.9rem] font-medium text-white/85 transition-colors hover:text-white"
            >
              <span className="relative inline-block transition-transform duration-300 group-hover:-translate-y-px">{item.label}</span>
            </a>
          ))}
        </nav>

        {/* Reading progress, in seven beats. */}
        <span aria-hidden="true" className="ml-auto hidden h-5 w-12 items-end gap-[3px] md:flex">
          {[40, 70, 55, 100, 80, 45, 60].map((h, i) => (
            <span key={i} className={`flex-1 rounded-full transition-colors duration-300 ${i < beats ? "bg-[var(--lp-orange)]" : "bg-white/20"}`} style={{ height: `${h}%` }} />
          ))}
        </span>

        <Link href="/entrar" className="ml-auto hidden rounded-full px-4 py-2 text-[0.9rem] font-medium text-white/85 hover:text-white sm:inline-flex md:ml-2">
          Entrar
        </Link>
        <Link
          ref={cta}
          href="/cadastro"
          className="hidden h-11 items-center rounded-full bg-[var(--lp-orange)] px-5 text-[0.92rem] font-semibold whitespace-nowrap text-[var(--lp-ink)] transition-colors hover:bg-white sm:inline-flex"
        >
          Começar grátis
        </Link>

        <button
          ref={menuBtn}
          type="button"
          aria-expanded={open}
          aria-controls="lp-menu"
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          onClick={() => (open ? close() : setOpen(true))}
          className="ml-auto grid size-11 place-items-center rounded-full text-white sm:ml-1 xl:hidden"
        >
          <span className="relative block h-3 w-5" aria-hidden="true">
            <span className={`absolute left-0 h-0.5 w-5 rounded bg-current transition-transform duration-300 ${open ? "top-1.5 rotate-45" : "top-0"}`} />
            <span className={`absolute left-0 h-0.5 w-5 rounded bg-current transition-transform duration-300 ${open ? "top-1.5 -rotate-45" : "top-2.5"}`} />
          </span>
        </button>
      </header>

      {open && (
        <div
          id="lp-menu"
          ref={panel}
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className="lp-glass pointer-events-auto relative mx-auto mt-2 flex max-w-6xl flex-col gap-1 rounded-[28px] p-3 xl:hidden"
        >
          {NAV.map((item) => (
            <a key={item.id} data-menu-item="" href={`#${item.id}`} onClick={go(item.id)} className="rounded-2xl px-4 py-3.5 text-lg font-semibold text-white hover:bg-white/10">
              {item.label}
            </a>
          ))}
          {app.state === "prompt" && (
            <button type="button" data-menu-item="" onClick={() => void app.install()} className="rounded-2xl px-4 py-3.5 text-left text-lg font-semibold text-[var(--lp-orange)] hover:bg-white/10">
              Instalar o app
            </button>
          )}
          {app.state === "ios" && (
            <p data-menu-item="" className="px-4 py-2 text-sm text-white/70">
              Para instalar o app: toque em <strong className="text-white">Compartilhar</strong> e depois em{" "}
              <strong className="text-white">Adicionar à Tela de Início</strong>.
            </p>
          )}
          <div data-menu-item="" className="mt-2 grid grid-cols-2 gap-2 border-t border-white/10 pt-3">
            <Link href="/entrar" className="grid h-12 place-items-center rounded-full border border-white/20 font-semibold text-white">
              Entrar
            </Link>
            <Link href="/cadastro" className="grid h-12 place-items-center rounded-full bg-[var(--lp-orange)] font-semibold text-[var(--lp-ink)]">
              Começar grátis
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
