"use client";

import { useState } from "react";
import { youtubeEmbed, youtubeId, youtubeThumbnail } from "@/lib/exercise-video";

const PlayIcon = ({ className = "size-6" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
    <path d="M8 5.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 8 5.5Z" />
  </svg>
);

/**
 * Demonstration of an exercise. An uploaded file (signed `src`) plays in the native player;
 * a YouTube link shows its thumbnail and only loads the player after the person presses play,
 * so nothing starts by itself. `placeholder` shows the "coming soon" state when there is no video.
 */
export function ExerciseVideo({
  src,
  externalUrl,
  title,
  placeholder = false,
  preload = "metadata",
  className = "",
}: {
  src?: string | null;
  externalUrl?: string | null;
  title: string;
  placeholder?: boolean;
  preload?: "metadata" | "none";
  className?: string;
}) {
  const [playing, setPlaying] = useState(false);
  const frame = `aspect-video w-full overflow-hidden rounded-[var(--radius-panel)] ${className}`;

  if (src) {
    // Captions are not available for trainer uploads yet; the written instructions cover the same content.
    return <video src={src} controls playsInline preload={preload} aria-label={`Vídeo: ${title}`} className={`${frame} bg-black`} />;
  }

  const id = youtubeId(externalUrl);
  if (id) {
    if (playing) {
      return (
        <iframe
          src={youtubeEmbed(id)}
          title={`Vídeo: ${title}`}
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
        <span className="sr-only">Reproduzir vídeo: {title}</span>
      </button>
    );
  }

  if (!placeholder) return null;
  return (
    <div className={`${frame} grid place-items-center border border-dashed border-line-strong bg-surface-subtle px-6 text-center`}>
      <div>
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-paper text-ink-soft">
          <PlayIcon className="ml-0.5 size-5" />
        </span>
        <p className="mt-3 font-semibold text-ink">Demonstração em breve</p>
        <p className="mt-1 text-sm text-ink-soft">O vídeo deste exercício ainda não está disponível. Siga o passo a passo abaixo.</p>
      </div>
    </div>
  );
}

/** Small square preview for lists: the video thumbnail when there is one, else a neutral tile. */
export function ExerciseThumb({ externalUrl, hasVideo }: { externalUrl: string | null; hasVideo: boolean }) {
  const id = youtubeId(externalUrl);
  return (
    <span className={`relative grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl ${id ? "bg-black" : hasVideo ? "bg-signal-tint text-turf" : "bg-surface-subtle text-ink-soft"}`}>
      {id ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={youtubeThumbnail(id)} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
          <span className="absolute grid size-7 place-items-center rounded-full bg-signal text-on-accent">
            <PlayIcon className="ml-px size-3.5" />
          </span>
        </>
      ) : hasVideo ? (
        <PlayIcon />
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" className="size-6">
          <path d="M6.5 8v8M17.5 8v8M3.5 10.5v3M20.5 10.5v3M6.5 12h11" />
        </svg>
      )}
    </span>
  );
}
