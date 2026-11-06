"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { removePostAction, reportAction, toggleLikeAction } from "@/app/_community/actions";
import { REPORT_REASONS } from "@/lib/validation/community";
import type { FeedPost } from "@/server/community/service";

const fmt = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const kg = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="grid shrink-0 place-items-center rounded-full bg-turf-tint font-display font-bold text-turf"
      style={{ width: size, height: size, fontSize: size * 0.45 }}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

export function WorkoutBlock({ w }: { w: NonNullable<FeedPost["workout"]> }) {
  return (
    <div className="rounded-[var(--radius-control)] border border-line bg-chalk p-3">
      <p className="text-xs font-semibold text-muted">{w.programName}</p>
      <p className="font-display text-xl font-bold">{w.dayName} concluído</p>
      <p className="mt-0.5 text-sm text-ink-soft tabular-nums">
        {[w.durationMinutes ? `${w.durationMinutes} min` : null, `${w.sets} séries`, w.volumeKg ? `${kg(w.volumeKg)} kg de volume` : null].filter(Boolean).join(" · ")}
      </p>
      {w.records.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {w.records.map((r) => (
            <li key={r.exerciseName} className="flex items-center gap-2 text-sm">
              <span className="rounded bg-signal px-1.5 py-0.5 text-xs font-bold text-ink">Recorde</span>
              <span className="font-medium">{r.exerciseName}</span>
              <span className="text-ink-soft tabular-nums">
                {r.reps} × {kg(r.loadKg)} kg
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PostCard({ post, basePath, canModerate, linkToPost = true }: { post: FeedPost; basePath: string; canModerate: boolean; linkToPost?: boolean }) {
  const router = useRouter();
  const [liked, setLiked] = useState(post.likedByMe);
  const [likes, setLikes] = useState(post.likeCount);
  const [hidden, setHidden] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (hidden) return null;

  function like() {
    const next = !liked;
    setLiked(next);
    setLikes((n) => n + (next ? 1 : -1));
    startTransition(async () => {
      const res = await toggleLikeAction({ postId: post.id });
      if (res.ok && res.data) {
        setLiked(res.data.liked);
        setLikes(res.data.likeCount);
      } else {
        setLiked(!next);
        setLikes((n) => n + (next ? -1 : 1));
      }
    });
  }

  function remove() {
    if (!window.confirm(post.author.isMe ? "Apagar seu post?" : "Remover este post da comunidade?")) return;
    startTransition(async () => {
      const res = await removePostAction({ postId: post.id });
      if (res.ok) {
        setHidden(true);
        router.refresh();
      } else setNotice(res.message);
    });
  }

  const profileHref = `${basePath}/membro/${post.author.memberId}`;
  return (
    <article aria-labelledby={`p-${post.id}`} className={`rounded-[var(--radius-panel)] border bg-paper ${post.pinned ? "border-signal/60" : "border-line"}`}>
      <header className="flex items-center gap-3 px-4 pt-4">
        <Link href={profileHref} aria-hidden="true" tabIndex={-1}>
          <Avatar name={post.author.name} />
        </Link>
        <div className="min-w-0 flex-1">
          <p id={`p-${post.id}`} className="truncate font-semibold">
            <Link href={profileHref} className="hover:underline">
              {post.author.name}
            </Link>
            {post.author.role === "trainer" && <span className="ml-2 rounded bg-turf px-1.5 py-0.5 align-middle text-[0.7rem] font-semibold text-white">Treinador</span>}
          </p>
          <p className="text-xs text-muted">
            {post.pinned ? "Aviso fixado · " : ""}
            {fmt.format(new Date(post.createdAt))}
          </p>
        </div>
        <details className="relative">
          <summary className="grid size-9 cursor-pointer list-none place-items-center rounded-full text-xl text-muted hover:bg-chalk" aria-label="Mais opções">
            ⋯
          </summary>
          <div className="absolute right-0 z-10 mt-1 w-44 rounded-[var(--radius-control)] border border-line bg-paper py-1 text-sm shadow-[var(--shadow-raised)]">
            {!post.author.isMe && (
              <button type="button" className="block w-full px-3 py-2 text-left hover:bg-chalk" onClick={() => setReporting(true)}>
                Denunciar
              </button>
            )}
            {(post.author.isMe || canModerate) && (
              <button type="button" className="block w-full px-3 py-2 text-left text-danger hover:bg-chalk" onClick={remove}>
                {post.author.isMe ? "Apagar" : "Remover"}
              </button>
            )}
          </div>
        </details>
      </header>

      <div className="flex flex-col gap-3 px-4 py-3">
        {post.status === "pending_review" && (
          <p className="rounded-[var(--radius-control)] bg-signal-tint px-3 py-2 text-sm">
            {post.author.isMe ? "Aguardando revisão do treinador. Só você vê este post por enquanto." : "Aguardando revisão. Os alunos ainda não veem este post."}
          </p>
        )}
        {post.body && <p className="leading-relaxed break-words whitespace-pre-line">{post.body}</p>}
        {post.workout && <WorkoutBlock w={post.workout} />}
        {post.imageUrl && (
          // Short-lived signed URL; next/image would cache it.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.imageUrl} alt={`Foto publicada por ${post.author.name}`} loading="lazy" className="max-h-[32rem] w-full rounded-[var(--radius-control)] bg-chalk object-cover" />
        )}
      </div>

      {post.status === "published" && (
        <footer className="flex items-center gap-1 border-t border-line px-2 py-1">
          <button
            type="button"
            onClick={like}
            aria-pressed={liked}
            aria-label={liked ? "Descurtir" : "Curtir"}
            className={`flex h-11 items-center gap-2 rounded-[var(--radius-control)] px-3 text-sm font-semibold hover:bg-chalk ${liked ? "text-turf" : "text-ink-soft"}`}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill={liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.9">
              <path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20Z" />
            </svg>
            <span className="tabular-nums">{likes}</span>
          </button>
          {linkToPost ? (
            <Link href={`${basePath}/post/${post.id}`} className="flex h-11 items-center gap-2 rounded-[var(--radius-control)] px-3 text-sm font-semibold text-ink-soft hover:bg-chalk">
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9">
                <path d="M4 5h16v11H9l-5 4V5Z" />
              </svg>
              <span className="tabular-nums">{post.commentCount}</span>
              <span className="sr-only">comentários</span>
            </Link>
          ) : (
            <span className="px-3 text-sm text-muted tabular-nums">{post.commentCount} comentários</span>
          )}
        </footer>
      )}

      {notice && <p className="px-4 pb-3 text-sm text-danger">{notice}</p>}
      {reporting && (
        <ReportForm
          targetType="post"
          targetId={post.id}
          onDone={(msg) => {
            setReporting(false);
            setNotice(msg);
          }}
        />
      )}
    </article>
  );
}

export function ReportForm({ targetType, targetId, onDone }: { targetType: "post" | "comment" | "member"; targetId: string; onDone: (message: string) => void }) {
  const [reason, setReason] = useState<(typeof REPORT_REASONS)[number][0]>("spam");
  const [details, setDetails] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <div className="border-t border-line px-4 py-3">
      <fieldset>
        <legend className="text-sm font-semibold">Por que você está denunciando?</legend>
        <div className="mt-2 flex flex-col gap-1.5">
          {REPORT_REASONS.map(([v, l]) => (
            <label key={v} className="flex items-center gap-2 text-sm">
              <input type="radio" name={`reason-${targetId}`} checked={reason === v} onChange={() => setReason(v)} className="accent-turf" />
              {l}
            </label>
          ))}
        </div>
      </fieldset>
      <textarea
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        maxLength={500}
        rows={2}
        placeholder="Detalhes (opcional)"
        aria-label="Detalhes da denúncia"
        className="mt-2 w-full rounded-[var(--radius-control)] border border-line-strong px-3 py-2 text-sm outline-none focus:border-turf"
      />
      <div className="mt-2 flex gap-2">
        <button type="button" className="h-10 px-3 text-sm font-semibold text-ink-soft" onClick={() => onDone("")}>
          Cancelar
        </button>
        <button
          type="button"
          disabled={pending}
          className="h-10 rounded-[var(--radius-control)] bg-ink px-4 text-sm font-semibold text-white"
          onClick={() =>
            startTransition(async () => {
              const res = await reportAction({ targetType, targetId, reason, details });
              onDone(res.ok ? (res.message ?? "Denúncia enviada.") : res.message);
            })
          }
        >
          {pending ? "Enviando…" : "Enviar denúncia"}
        </button>
      </div>
    </div>
  );
}
