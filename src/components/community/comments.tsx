"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { loadCommentsAction, postCommentAction, removeCommentAction } from "@/app/_community/actions";
import type { CommentView } from "@/server/community/service";
import { Avatar } from "./avatar";
import { CloseIcon, SendIcon } from "./icons";
import { ReportForm } from "./report-form";
import { TimeAgo } from "./time-ago";
import { useT } from "@/i18n/client";

function CommentItem({
  c,
  basePath,
  canModerate,
  onReply,
  onRemoved,
}: {
  c: CommentView;
  basePath: string;
  canModerate: boolean;
  onReply?: () => void;
  onRemoved: () => void;
}) {
  const t = useT();
  const [reporting, setReporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const reply = !!c.parentCommentId;
  return (
    <div className={`cm-rise flex gap-2.5 ${pending ? "opacity-50" : ""}`}>
      <Link href={`${basePath}/membro/${c.author.memberId}`} tabIndex={-1} aria-hidden="true">
        <Avatar name={c.author.name} src={c.author.avatarUrl} size={reply ? 28 : 34} />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="inline-block max-w-full rounded-[18px] rounded-tl-md bg-chalk px-3.5 py-2">
          <p className="text-[0.85rem] font-semibold">
            <Link href={`${basePath}/membro/${c.author.memberId}`} className="hover:underline">
              {c.author.name}
            </Link>
            {c.author.role === "trainer" && <span className="ml-1.5 text-xs font-semibold text-turf">{t("Treinador")}</span>}
          </p>
          <p className="text-[0.92rem] leading-relaxed break-words whitespace-pre-line">{c.body}</p>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3.5 gap-y-1 px-2 text-xs text-muted">
          <TimeAgo iso={c.createdAt} />
          {onReply && (
            <button type="button" className="font-semibold hover:text-ink" onClick={onReply}>
              {t("Responder")}
            </button>
          )}
          {!c.author.isMe && (
            <button type="button" className="font-semibold hover:text-ink" onClick={() => setReporting((r) => !r)}>
              {t("Denunciar")}
            </button>
          )}
          {(c.author.isMe || canModerate) && (
            <button
              type="button"
              className="font-semibold text-danger"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await removeCommentAction({ commentId: c.id });
                  if (res.ok) onRemoved();
                  else setNotice(t(res.message));
                })
              }
            >
              {c.author.isMe ? t("Apagar") : t("Remover")}
            </button>
          )}
        </div>
        {notice && (
          <p role="status" className="px-2 pt-1 text-xs text-ink-soft">
            {notice}
          </p>
        )}
        {reporting && (
          <div className="mt-2 rounded-2xl border border-line">
            <ReportForm
              targetType="comment"
              targetId={c.id}
              onDone={(m) => {
                setReporting(false);
                setNotice(m || null);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

const SkeletonRows = () => (
  <div aria-hidden="true" className="flex flex-col gap-3">
    {[0, 1].map((i) => (
      <div key={i} className="flex gap-2.5">
        <span className="cm-skeleton size-[34px] shrink-0 rounded-full" />
        <span className="cm-skeleton h-12 flex-1 rounded-[18px]" style={{ maxWidth: i ? "55%" : "75%" }} />
      </div>
    ))}
  </div>
);

/**
 * Comments of one post, with one level of replies. Loads on demand when it is
 * opened inside the feed; the post page passes the list it already has.
 */
export function CommentThread({
  postId,
  initial,
  basePath,
  canModerate,
  canComment,
  me,
  autoFocus = false,
  onCount,
}: {
  postId: string;
  initial?: CommentView[];
  basePath: string;
  canModerate: boolean;
  canComment: boolean;
  me: { name: string; avatarUrl: string | null };
  autoFocus?: boolean;
  onCount?: (n: number) => void;
}) {
  const t = useT();
  const [list, setList] = useState<CommentView[] | null>(initial ?? null);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<CommentView | null>(null);
  const [sending, startSending] = useTransition();
  const input = useRef<HTMLTextAreaElement>(null);
  const report = useRef(onCount);
  useEffect(() => {
    report.current = onCount;
  });

  useEffect(() => {
    if (initial) return;
    let alive = true;
    void loadCommentsAction({ postId }).then((res) => {
      if (!alive) return;
      if (res.ok && res.data) {
        setList(res.data.comments);
        report.current?.(res.data.commentCount);
      } else setError(res.ok ? t("Não foi possível carregar os comentários.") : t(res.message));
    });
    return () => {
      alive = false;
    };
  }, [postId, initial, t]);

  useEffect(() => {
    if (autoFocus) input.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  function update(next: CommentView[]) {
    setList(next);
    onCount?.(next.length);
  }

  function send() {
    const text = body.trim();
    if (!text) return;
    setError(null);
    startSending(async () => {
      const res = await postCommentAction({ postId, parentCommentId: replyTo?.id ?? "", body: text });
      if (!res.ok || !res.data) return setError(res.ok ? t("Não foi possível comentar.") : t(res.message));
      update([...(list ?? []), res.data]);
      setBody("");
      setReplyTo(null);
    });
  }

  const top = (list ?? []).filter((c) => !c.parentCommentId);
  return (
    <section aria-label={t("Comentários")} className="flex flex-col gap-3.5">
      {list === null && !error && <SkeletonRows />}
      {list !== null && top.length === 0 && <p className="text-sm text-muted">{canComment ? t("Ninguém comentou ainda. Comece a conversa.") : t("Sem comentários.")}</p>}
      {top.map((c) => (
        <div key={c.id} className="flex flex-col gap-2.5">
          <CommentItem
            c={c}
            basePath={basePath}
            canModerate={canModerate}
            onReply={
              canComment
                ? () => {
                    setReplyTo(c);
                    input.current?.focus();
                  }
                : undefined
            }
            // Removing a comment takes its replies with it from the view.
            onRemoved={() => update(list!.filter((x) => x.id !== c.id && x.parentCommentId !== c.id))}
          />
          {list!.some((r) => r.parentCommentId === c.id) && (
            <div className="flex flex-col gap-2.5 pl-11">
              {list!
                .filter((r) => r.parentCommentId === c.id)
                .map((r) => (
                  <CommentItem key={r.id} c={r} basePath={basePath} canModerate={canModerate} onRemoved={() => update(list!.filter((x) => x.id !== r.id))} />
                ))}
            </div>
          )}
        </div>
      ))}

      {canComment && (
        <div>
          {replyTo && (
            <p className="mb-1.5 flex items-center gap-1 pl-11 text-xs text-muted">
              {t("Respondendo a")} <strong className="font-semibold text-ink-soft">{replyTo.author.name}</strong>
              <button type="button" onClick={() => setReplyTo(null)} aria-label={t("Cancelar resposta")} className="grid size-6 place-items-center rounded-full hover:bg-chalk">
                <CloseIcon className="size-3.5" />
              </button>
            </p>
          )}
          <div className="flex items-end gap-2.5">
            <Avatar name={me.name} src={me.avatarUrl} size={34} />
            <div className="flex min-h-11 flex-1 items-end rounded-[22px] border border-line-strong bg-paper pr-1.5 pl-4 focus-within:border-turf">
              <textarea
                ref={input}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    send();
                  }
                }}
                maxLength={1000}
                rows={1}
                placeholder={replyTo ? t("Responder a {0}", { 0: replyTo.author.name }) : t("Escreva um comentário")}
                aria-label={replyTo ? t("Responder a {0}", { 0: replyTo.author.name }) : t("Escreva um comentário")}
                className="field-sizing-content max-h-32 min-h-[2.6rem] flex-1 resize-none bg-transparent py-2.5 text-[0.95rem] outline-none placeholder:text-muted"
              />
              <button
                type="button"
                onClick={send}
                disabled={sending || !body.trim()}
                aria-label={t("Enviar comentário")}
                className="mb-1 grid size-9 shrink-0 place-items-center rounded-full bg-signal text-on-accent transition-all active:scale-90 disabled:bg-surface-subtle disabled:text-ink-soft"
              >
                <SendIcon className="size-[18px]" />
              </button>
            </div>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
