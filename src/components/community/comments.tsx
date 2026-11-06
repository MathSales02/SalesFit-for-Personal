"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addCommentAction, removeCommentAction } from "@/app/_community/actions";
import { ActionForm, fieldErrors } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/button";
import type { CommentView } from "@/server/community/service";
import { Avatar, ReportForm } from "./post-card";

const fmt = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

function CommentForm({ postId, parentCommentId, onDone, placeholder }: { postId: string; parentCommentId?: string; onDone?: () => void; placeholder: string }) {
  const router = useRouter();
  return (
    <ActionForm
      action={async (prev, form) => {
        const res = await addCommentAction(prev, form);
        if (res.ok) {
          router.refresh();
          onDone?.();
        }
        return res;
      }}
      className="flex flex-col gap-2"
      resetOnSuccess
      successNotice={false}
    >
      {(s) => (
        <>
          <input type="hidden" name="postId" value={postId} />
          {parentCommentId && <input type="hidden" name="parentCommentId" value={parentCommentId} />}
          <textarea
            name="body"
            maxLength={1000}
            rows={2}
            required
            placeholder={placeholder}
            aria-label={placeholder}
            className="rounded-[var(--radius-control)] border border-line-strong px-3 py-2 outline-none focus:border-turf"
          />
          {fieldErrors(s, "body") && <p className="text-sm text-danger">{fieldErrors(s, "body")!.join(" ")}</p>}
          <div>
            <SubmitButton pendingLabel="Enviando…">Comentar</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}

function CommentItem({ c, postId, basePath, canModerate, canReply }: { c: CommentView; postId: string; basePath: string; canModerate: boolean; canReply: boolean }) {
  const router = useRouter();
  const [replying, setReplying] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  return (
    <div className="flex gap-3">
      <Avatar name={c.author.name} size={32} />
      <div className="min-w-0 flex-1">
        <div className="rounded-[var(--radius-control)] bg-chalk px-3 py-2">
          <p className="text-sm font-semibold">
            <Link href={`${basePath}/membro/${c.author.memberId}`} className="hover:underline">
              {c.author.name}
            </Link>
            {c.author.role === "trainer" && <span className="ml-2 text-xs font-semibold text-turf">Treinador</span>}
          </p>
          <p className="text-sm leading-relaxed break-words whitespace-pre-line">{c.body}</p>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-3 px-1 text-xs text-muted">
          <span>{fmt.format(new Date(c.createdAt))}</span>
          {canReply && (
            <button type="button" className="font-semibold hover:text-ink" onClick={() => setReplying((r) => !r)}>
              Responder
            </button>
          )}
          {!c.author.isMe && (
            <button type="button" className="font-semibold hover:text-ink" onClick={() => setReporting(true)}>
              Denunciar
            </button>
          )}
          {(c.author.isMe || canModerate) && (
            <button
              type="button"
              className="font-semibold text-danger"
              onClick={() =>
                startTransition(async () => {
                  const res = await removeCommentAction({ commentId: c.id });
                  if (res.ok) router.refresh();
                  else setNotice(res.message);
                })
              }
            >
              {c.author.isMe ? "Apagar" : "Remover"}
            </button>
          )}
        </div>
        {notice && <p className="px-1 text-xs text-ink-soft">{notice}</p>}
        {reporting && (
          <ReportForm
            targetType="comment"
            targetId={c.id}
            onDone={(m) => {
              setReporting(false);
              setNotice(m || null);
            }}
          />
        )}
        {replying && (
          <div className="mt-2">
            <CommentForm postId={postId} parentCommentId={c.id} placeholder={`Responder a ${c.author.name}`} onDone={() => setReplying(false)} />
          </div>
        )}
      </div>
    </div>
  );
}

export function CommentSection({ postId, comments, basePath, canModerate }: { postId: string; comments: CommentView[]; basePath: string; canModerate: boolean }) {
  const top = comments.filter((c) => !c.parentCommentId);
  return (
    <section aria-label="Comentários" className="flex flex-col gap-4">
      <CommentForm postId={postId} placeholder="Escreva um comentário" />
      {top.length === 0 && <p className="text-sm text-muted">Seja o primeiro a comentar.</p>}
      {top.map((c) => (
        <div key={c.id} className="flex flex-col gap-3">
          <CommentItem c={c} postId={postId} basePath={basePath} canModerate={canModerate} canReply />
          <div className="flex flex-col gap-3 pl-11">
            {comments
              .filter((r) => r.parentCommentId === c.id)
              .map((r) => (
                <CommentItem key={r.id} c={r} postId={postId} basePath={basePath} canModerate={canModerate} canReply={false} />
              ))}
          </div>
        </div>
      ))}
    </section>
  );
}
