"use client";

import { useState } from "react";
import { youtubeEmbed, youtubeId, youtubeThumbnail } from "@/lib/exercise-video";
import { useT } from "@/i18n/client";

const PlayIcon = ({ className = "size-6" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
    <path d="M8 5.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 8 5.5Z" />
  </svg>
);

/**
 * The animated demonstration linked to an exercise (a looping GIF drawn on white). It plays by
 * itself, silently, and is only fetched when it gets close to the screen.
 */
export function DemoAnimation({ url, title, className = "" }: { url: string; title: string; className?: string }) {
  const t = useT();
  return (
    <span className={`block overflow-hidden rounded-[var(--radius-panel)] border border-line bg-white ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={t("Demonstração animada: {0}", { 0: title })} loading="lazy" decoding="async" className="aspect-square size-full object-contain" />
    </span>
  );
}

/**
 * Demonstration of an exercise, in order of preference: the trainer's uploaded file (signed
 * `src`, native player), a YouTube link (thumbnail first; the player loads after a press, so
 * nothing with sound starts by itself), then the animation linked automatically.
 * `placeholder` shows the "coming soon" state when there is nothing at all.
 */
export function ExerciseVideo({
  src,
  externalUrl,
  demoUrl,
  title,
  placeholder = false,
  preload = "metadata",
  className = "",
}: {
  src?: string | null;
  externalUrl?: string | null;
  demoUrl?: string | null;
  title: string;
  placeholder?: boolean;
  preload?: "metadata" | "none";
  className?: string;
}) {
  const t = useT();
  const [playing, setPlaying] = useState(false);
  const frame = `aspect-video w-full overflow-hidden rounded-[var(--radius-panel)] ${className}`;

  if (src) {
    // Captions are not available for trainer uploads yet; the written instructions cover the same content.
    return <video src={src} controls playsInline preload={preload} aria-label={t("Vídeo: {0}", { 0: title })} className={`${frame} bg-black`} />;
  }

  const id = youtubeId(externalUrl);
  if (id) {
    if (playing) {
      return (
        <iframe
          src={youtubeEmbed(id)}
          title={t("Vídeo: {0}", { 0: title })}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className={`${frame} border-0 bg-black`}
        />
      );
    }
    return (
      <button type="button" onClick={() => setPlaying(true)} className={`group relative block ${frame} bg-black`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={youtubeThumbnail(id)} alt="" loading="lazy" decoding="async" className="size-full object-cover opacity-90 transition-opacity group-hover:opacity-100" />
        <span className="absolute inset-0 grid place-items-center">
          <span className="grid size-16 place-items-center rounded-full bg-signal text-on-accent shadow-lg transition-transform group-active:scale-95">
            <PlayIcon className="ml-0.5 size-7" />
          </span>
        </span>
        <span className="sr-only">{t("Reproduzir vídeo:")} {title}</span>
      </button>
    );
  }

  if (demoUrl) return <DemoAnimation url={demoUrl} title={title} className={`mx-auto w-full max-w-md ${className}`} />;

  if (!placeholder) return null;
  return (
    <div className={`${frame} grid place-items-center border border-dashed border-line-strong bg-surface-subtle px-6 text-center`}>
      <div>
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-paper text-ink-soft">
          <PlayIcon className="ml-0.5 size-5" />
        </span>
        <p className="mt-3 font-semibold text-ink">{t("Demonstração em breve")}</p>
        <p className="mt-1 text-sm text-ink-soft">{t("A demonstração deste exercício ainda não está disponível. Siga o passo a passo abaixo.")}</p>
      </div>
    </div>
  );
}

/** Small square preview for lists: the animation or video thumbnail when there is one, else a neutral tile. */
export function ExerciseThumb({ externalUrl, demoUrl, hasVideo }: { externalUrl: string | null; demoUrl?: string | null; hasVideo: boolean }) {
  const id = youtubeId(externalUrl);
  const media = id || demoUrl;
  return (
    <span className={`relative grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl ${id ? "bg-black" : demoUrl ? "border border-line bg-white" : hasVideo ? "bg-signal-tint text-turf" : "bg-surface-subtle text-ink-soft"}`}>
      {id ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={youtubeThumbnail(id)} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
      ) : demoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={demoUrl} alt="" loading="lazy" decoding="async" className="size-full object-contain" />
      ) : hasVideo ? (
        <PlayIcon />
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" className="size-6">
          <path d="M6.5 8v8M17.5 8v8M3.5 10.5v3M20.5 10.5v3M6.5 12h11" />
        </svg>
      )}
      {(id || (hasVideo && media)) && (
        <span className="absolute right-1 bottom-1 grid size-5 place-items-center rounded-full bg-signal text-on-accent">
          <PlayIcon className="ml-px size-3" />
        </span>
      )}
    </span>
  );
}
