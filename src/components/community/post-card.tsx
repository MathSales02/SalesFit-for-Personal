"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { editPostAction, removePostAction, toggleLikeAction, toggleSaveAction } from "@/app/_community/actions";
import type { CommentView, FeedPost } from "@/server/community/service";
import { Avatar } from "./avatar";
import { CommentThread } from "./comments";
import { FollowButton } from "./follow-button";
import { BookmarkIcon, CommentIcon, HeartIcon, MoreIcon, PinIcon, ShareIcon } from "./icons";
import { ReportForm } from "./report-form";
import { TimeAgo } from "./time-ago";
import { useLocale, useT } from "@/i18n/client";

// Other areas (messages, notifications) import these from here.
export { Avatar } from "./avatar";
export { ReportForm } from "./report-form";

/** Who is looking at the feed: drives the comment box and the moderation options. */
export type Viewer = { name: string; avatarUrl: string | null; canModerate: boolean; canComment: boolean };

const kgIn = (locale: string, n: number) => n.toLocaleString(locale, { maximumFractionDigits: 1 });
/** 1234 -> "1,2 mil" / "1.2K", in the reader's language. */
const compactIn = (locale: string, n: number) => new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(n);

export function WorkoutBlock({ w }: { w: NonNullable<FeedPost["workout"]> }) {
  const t = useT();
  const locale = useLocale();
  const kg = (n: number) => kgIn(locale, n);
  const stats = [
    w.durationMinutes ? { v: String(w.durationMinutes), u: "min" } : null,
    { v: String(w.sets), u: w.sets === 1 ? t("série") : t("séries") },
    w.volumeKg ? { v: kg(w.volumeKg), u: t("kg de volume") } : null,
  ].filter((x): x is { v: string; u: string } => !!x);
  return (
    <div className="overflow-hidden rounded-[20px] bg-night text-white">
      <div className="px-4 pt-4 pb-3.5">
        <p className="text-caption text-white/70">{w.programName}</p>
        <p className="mt-0.5 font-display text-[1.35rem] leading-tight font-bold">{w.dayName} {t("concluído")}</p>
        <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
          {stats.map((s) => (
            <div key={s.u}>
              <dd className="font-display text-2xl leading-none font-extrabold tabular-nums">{s.v}</dd>
              <dt className="mt-1 text-xs text-white/70">{s.u}</dt>
            </div>
          ))}
        </dl>
      </div>
      {w.records.length > 0 && (
        <ul className="flex flex-col gap-1.5 border-t border-white/10 px-4 py-3">
          {w.records.map((r) => (
            <li key={r.exerciseName} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
              <span className="rounded-full bg-signal px-2 py-0.5 text-[0.7rem] font-bold text-on-accent">{t("Recorde")}</span>
              <span className="font-semibold">{r.exerciseName}</span>
              <span className="text-white/75 tabular-nums">
                {r.reps} × {kg(r.loadKg)} {t("kg")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Closes a popover on Esc or a click outside it. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open, close]);
  return ref;
}

const actionBtn = "flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition-colors active:scale-95";

export function PostCard({
  post: initialPost,
  basePath,
  viewer,
  detail = false,
  initialComments,
}: {
  post: FeedPost;
  basePath: string;
  viewer: Viewer;
  /** The post's own page: full text, comments open. */
  detail?: boolean;
  initialComments?: CommentView[];
}) {
  const t = useT();
  const locale = useLocale();
  const compact = (n: number) => compactIn(locale, n);
  const router = useRouter();
  const [post, setPost] = useState(initialPost);
  const [liked, setLiked] = useState(post.likedByMe);
  const [likes, setLikes] = useState(post.likeCount);
  const [saved, setSaved] = useState(post.savedByMe);
  const [commentCount, setCommentCount] = useState(post.commentCount);
  const [showComments, setShowComments] = useState(detail);
  const [focusComments, setFocusComments] = useState(false);
  const [expanded, setExpanded] = useState(detail);
  const [burst, setBurst] = useState(0);
  const [menu, setMenu] = useState(false);
  const [mode, setMode] = useState<"view" | "edit" | "report">("view");
  const [draft, setDraft] = useState(post.body ?? "");
  const [hidden, setHidden] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  const menuRef = useDismiss(menu, () => setMenu(false));
  const lastTap = useRef(0);

  if (hidden) return null;
  const published = post.status === "published";
  const profileHref = `${basePath}/membro/${post.author.memberId}`;
  const postHref = `${basePath}/post/${post.id}`;
  const long = (post.body?.length ?? 0) > 320 || (post.body?.split("\n").length ?? 0) > 6;

  function like(force?: boolean) {
    const next = force ?? !liked;
    if (next === liked) return;
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

  function save() {
    const next = !saved;
    setSaved(next);
    startTransition(async () => {
      const res = await toggleSaveAction({ postId: post.id });
      if (res.ok && res.data) {
        setSaved(res.data.saved);
        setNotice({ text: res.data.saved ? t("Salvo. Veja em Salvos.") : t("Removido dos salvos.") });
      } else setSaved(!next);
    });
  }

  async function share() {
    const url = `${window.location.origin}${postHref}`;
    try {
      if (navigator.share) await navigator.share({ title: t("Publicação de {0}", { 0: post.author.name }), text: post.body?.slice(0, 120) ?? undefined, url });
      else {
        await navigator.clipboard.writeText(url);
        setNotice({ text: t("Link copiado. Só quem é da sua comunidade consegue abrir.") });
      }
    } catch {
      // The person closed the share sheet.
    }
  }

  async function copyLink() {
    setMenu(false);
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${postHref}`);
      setNotice({ text: t("Link copiado. Só quem é da sua comunidade consegue abrir.") });
    } catch {
      setNotice({ text: t("Não foi possível copiar o link."), error: true });
    }
  }

  function remove() {
    setMenu(false);
    if (!window.confirm(post.author.isMe ? t("Apagar sua publicação?") : t("Remover esta publicação da comunidade?"))) return;
    startTransition(async () => {
      const res = await removePostAction({ postId: post.id });
      if (!res.ok) return setNotice({ text: res.message, error: true });
      if (detail) router.push(basePath);
      else setHidden(true);
    });
  }

  function saveEdit() {
    startTransition(async () => {
      const res = await editPostAction({ postId: post.id, body: draft });
      if (!res.ok || !res.data) return setNotice({ text: res.ok ? t("Não foi possível salvar.") : res.message, error: true });
      setPost({ ...post, body: res.data.body, status: res.data.status, editedAt: res.data.editedAt });
      setMode("view");
      setNotice({ text: res.message ?? t("Publicação atualizada.") });
    });
  }

  // Double tap (or double click) on the photo likes, like people expect from a social feed.
  function tapImage() {
    const now = Date.now();
    if (now - lastTap.current < 320 && published) {
      like(true);
      setBurst((b) => b + 1);
    }
    lastTap.current = now;
  }

  function openComments() {
    setFocusComments(true);
    setShowComments(true);
  }

  return (
    <article
      aria-labelledby={`p-${post.id}`}
      className={`cm-rise rounded-[28px] bg-paper shadow-[var(--shadow-card)] ${post.pinned ? "ring-2 ring-signal/70" : "border border-line"}`}
    >
      <header className="flex items-center gap-3 px-4 pt-4 sm:px-5">
        <Link href={profileHref} aria-hidden="true" tabIndex={-1}>
          <Avatar name={post.author.name} src={post.author.avatarUrl} size={44} />
        </Link>
        <div className="min-w-0 flex-1">
          <p id={`p-${post.id}`} className="flex items-center gap-1.5 font-semibold">
            <Link href={profileHref} className="truncate hover:underline">
              {post.author.name}
            </Link>
          </p>
          <p className="flex flex-wrap items-center gap-x-1.5 text-[0.8rem] text-muted">
            {post.author.role === "trainer" && <span className="font-semibold text-turf">{t("Treinador ·")}</span>}
            {post.pinned && (
              <span className="inline-flex items-center gap-1 font-semibold text-turf">
                <PinIcon className="size-3.5" /> {t("Aviso fixado ·")}
              </span>
            )}
            {detail ? (
              <TimeAgo iso={post.createdAt} />
            ) : (
              <Link href={postHref} className="inline-flex min-h-6 items-center hover:underline">
                <TimeAgo iso={post.createdAt} />
              </Link>
            )}
            {post.editedAt && <span>{t("· editado")}</span>}
          </p>
        </div>
        {!post.author.isMe && !initialPost.author.followedByMe && published && (
          <FollowButton memberId={post.author.memberId} name={post.author.name} initial={false} size="sm" />
        )}
        <div ref={menuRef} className="relative">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={menu}
            aria-label={t("Mais opções da publicação de {0}", { 0: post.author.name })}
            onClick={() => setMenu((m) => !m)}
            className="grid size-10 place-items-center rounded-full text-ink-soft hover:bg-chalk"
          >
            <MoreIcon />
          </button>
          {menu && (
            <div role="menu" className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-2xl border border-line bg-paper py-1.5 text-[0.92rem] shadow-[var(--shadow-card)]">
              <button type="button" role="menuitem" className="block w-full px-4 py-2.5 text-left hover:bg-chalk" onClick={copyLink}>
                {t("Copiar link")}
              </button>
              {post.author.isMe && (
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full px-4 py-2.5 text-left hover:bg-chalk"
                  onClick={() => {
                    setMenu(false);
                    setDraft(post.body ?? "");
                    setMode("edit");
                  }}
                >
                  {t("Editar texto")}
                </button>
              )}
              {!post.author.isMe && (
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full px-4 py-2.5 text-left hover:bg-chalk"
                  onClick={() => {
                    setMenu(false);
                    setMode("report");
                  }}
                >
                  {t("Denunciar")}
                </button>
              )}
              {(post.author.isMe || viewer.canModerate) && (
                <button type="button" role="menuitem" className="block w-full px-4 py-2.5 text-left font-semibold text-danger hover:bg-danger-tint" onClick={remove}>
                  {post.author.isMe ? t("Apagar") : t("Remover da comunidade")}
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      <div className="flex flex-col gap-3 px-4 pt-3 pb-1 sm:px-5">
        {post.status === "pending_review" && (
          <p className="rounded-2xl bg-signal-tint px-3.5 py-2.5 text-sm text-ink">
            {post.author.isMe ? t("Aguardando revisão do treinador. Só você vê esta publicação por enquanto.") : t("Aguardando revisão. Os alunos ainda não veem esta publicação.")}
          </p>
        )}
        {mode === "edit" ? (
          <div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={2000}
              autoFocus
              aria-label={t("Texto da publicação")}
              className="field-sizing-content min-h-24 w-full resize-none rounded-2xl border border-line-strong bg-paper px-3.5 py-3 leading-relaxed outline-none focus:border-turf"
            />
            <div className="mt-2 flex justify-end gap-2">
              <button type="button" className="h-10 rounded-full px-4 text-sm font-semibold text-ink-soft hover:bg-chalk" onClick={() => setMode("view")}>
                {t("Cancelar")}
              </button>
              <button type="button" disabled={pending} className="h-10 rounded-full bg-signal px-5 text-sm font-semibold text-on-accent disabled:opacity-60" onClick={saveEdit}>
                {pending ? t("Salvando…") : t("Salvar")}
              </button>
            </div>
          </div>
        ) : (
          post.body && (
            <div>
              <p className={`text-[1.02rem] leading-relaxed break-words whitespace-pre-line ${long && !expanded ? "line-clamp-6" : ""}`}>{post.body}</p>
              {long && !expanded && (
                <button type="button" className="mt-1 text-sm font-semibold text-turf hover:underline" onClick={() => setExpanded(true)}>
                  {t("ver mais")}
                </button>
              )}
            </div>
          )
        )}
        {post.workout && <WorkoutBlock w={post.workout} />}
        {post.imageUrl && (
          <div className="relative overflow-hidden rounded-[20px] bg-surface-subtle" onClick={tapImage}>
            {/* Short-lived signed URL; next/image would cache it. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={post.imageUrl} alt={t("Foto publicada por {0}", { 0: post.author.name })} loading="lazy" decoding="async" className="max-h-[36rem] min-h-40 w-full object-cover select-none" draggable={false} />
            {burst > 0 && (
              <span key={burst} aria-hidden="true" className="cm-burst pointer-events-none absolute inset-0 grid place-items-center text-white drop-shadow-[0_4px_18px_rgba(0,0,0,0.45)]">
                <HeartIcon filled className="size-24" />
              </span>
            )}
          </div>
        )}
      </div>

      {published && (
        <footer className="flex items-center gap-0.5 px-2 py-1.5 sm:px-3">
          <button
            type="button"
            onClick={() => like()}
            aria-pressed={liked}
            className={`${actionBtn} ${liked ? "text-turf" : "text-ink-soft hover:bg-chalk"}`}
          >
            <span className="sr-only">{liked ? t("Descurtir:") : t("Curtir:")}</span>
            <span key={String(liked)} className={liked ? "cm-pop" : ""}>
              <HeartIcon filled={liked} className="size-[22px]" />
            </span>
            <span className="tabular-nums">{compact(likes)}</span>
            <span className="sr-only">{likes === 1 ? t("curtida") : t("curtidas")}</span>
          </button>
          {detail ? (
            <span className={`${actionBtn} text-ink-soft`}>
              <CommentIcon className="size-[22px]" />
              <span className="tabular-nums">{compact(commentCount)}</span>
              <span className="sr-only">{commentCount === 1 ? t("comentário") : t("comentários")}</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => (showComments ? setShowComments(false) : openComments())}
              aria-expanded={showComments}
              className={`${actionBtn} ${showComments ? "bg-chalk text-ink" : "text-ink-soft hover:bg-chalk"}`}
            >
              <CommentIcon className="size-[22px]" />
              <span className="tabular-nums">{compact(commentCount)}</span>
              <span className="sr-only">{commentCount === 1 ? t("comentário") : t("comentários")}</span>
            </button>
          )}
          <button type="button" onClick={share} aria-label={t("Compartilhar")} className={`${actionBtn} text-ink-soft hover:bg-chalk`}>
            <ShareIcon className="size-[21px]" />
          </button>
          <button
            type="button"
            onClick={save}
            aria-pressed={saved}
            aria-label={saved ? t("Remover dos salvos") : t("Salvar publicação")}
            className={`${actionBtn} ml-auto ${saved ? "text-turf" : "text-ink-soft hover:bg-chalk"}`}
          >
            <span key={String(saved)} className={saved ? "cm-pop" : ""}>
              <BookmarkIcon filled={saved} className="size-[21px]" />
            </span>
          </button>
        </footer>
      )}

      {notice && (
        <p role="status" className={`px-5 pb-3 text-sm ${notice.error ? "text-danger" : "text-ink-soft"}`}>
          {notice.text}
        </p>
      )}
      {mode === "report" && (
        <div className="border-t border-line">
          <ReportForm
            targetType="post"
            targetId={post.id}
            onDone={(msg) => {
              setMode("view");
              setNotice(msg ? { text: msg } : null);
            }}
          />
        </div>
      )}
      {showComments && published && (
        <div className="border-t border-line px-4 py-4 sm:px-5">
          <CommentThread
            postId={post.id}
            initial={initialComments}
            basePath={basePath}
            canModerate={viewer.canModerate}
            canComment={viewer.canComment}
            me={viewer}
            autoFocus={focusComments}
            onCount={setCommentCount}
          />
        </div>
      )}
    </article>
  );
}
