"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import {
  completeMessageImageAction,
  deleteMessageAction,
  olderMessagesAction,
  pollMessagesAction,
  requestMessageImageAction,
  sendMessageAction,
} from "@/app/_messaging/actions";
import { ReportForm } from "@/components/community/post-card";
import { Notice } from "@/components/ui/notice";
import type { MessageView } from "@/server/messaging/service";
import { useT } from "@/i18n/client";

const POLL_MS = 4000;
const SAFETY_POLL_MS = 30_000;
const ACCEPT = "image/jpeg,image/png,image/webp";
const fmt = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

type Cursor = { createdAt: string; id: string } | null;

/**
 * A conversation. New messages arrive through a live signal (Server-Sent
 * Events), with polling as the fallback while that channel is down.
 */
export function Thread({
  conversationId,
  otherName,
  canSend,
  initial,
  initialOlderCursor,
}: {
  conversationId: string;
  otherName: string;
  canSend: boolean;
  initial: MessageView[];
  initialOlderCursor: Cursor;
}) {
  const t = useT();
  const [items, setItems] = useState<MessageView[]>(initial);
  const [older, setOlder] = useState<Cursor>(initialOlderCursor);
  const [body, setBody] = useState("");
  const [image, setImage] = useState<{ assetId: string; preview: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reporting, setReporting] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const bottom = useRef<HTMLDivElement>(null);
  const fileId = useId();
  const latest = useRef<Cursor>(null);

  const append = (incoming: MessageView[]) =>
    setItems((cur) => {
      const seen = new Set(cur.map((m) => m.id));
      return [...cur, ...incoming.filter((m) => !seen.has(m.id))];
    });

  useEffect(() => {
    const last = items[items.length - 1];
    latest.current = last ? { createdAt: last.createdAt, id: last.id } : null;
    bottom.current?.scrollIntoView({ block: "end" });
  }, [items]);

  useEffect(() => {
    let busy = false;
    const tick = async () => {
      if (busy) return;
      busy = true;
      try {
        const res = await pollMessagesAction({ conversationId, after: latest.current });
        if (res.ok && res.data?.length) append(res.data);
      } finally {
        busy = false;
      }
    };
    // Live signal: the server only says "something changed"; the content comes through the poll.
    let live = false;
    const source = typeof EventSource === "undefined" ? null : new EventSource(`/api/conversas/${conversationId}/eventos`);
    source?.addEventListener("open", () => {
      live = true;
      void tick(); // catch up on anything sent while reconnecting
    });
    source?.addEventListener("message", () => void tick());
    source?.addEventListener("error", () => {
      live = false;
    });
    // Fallback: frequent polling while the live channel is down, a slow safety net otherwise.
    let last = 0;
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (!live || now - last >= SAFETY_POLL_MS) {
        last = now;
        void tick();
      }
    }, POLL_MS);
    return () => {
      clearInterval(t);
      source?.close();
    };
  }, [conversationId]);

  async function pick(file: File | undefined) {
    if (!file) return;
    if (!ACCEPT.split(",").includes(file.type) || file.size > 10 * 1024 * 1024) return setError(t("Envie uma foto JPG, PNG ou WebP de até 10 MB."));
    setError(null);
    setUploading(true);
    try {
      const ticket = await requestMessageImageAction({ contentType: file.type, sizeBytes: file.size });
      if (!ticket.ok || !ticket.data) return setError(ticket.ok ? t("Não foi possível enviar.") : ticket.message);
      const fd = new FormData();
      for (const [k, v] of Object.entries(ticket.data.fields)) fd.append(k, v);
      fd.append("file", file);
      const up = await fetch(ticket.data.url, { method: "POST", body: fd }).catch(() => null);
      if (!up?.ok) return setError("O envio foi interrompido.");
      const done = await completeMessageImageAction({ assetId: ticket.data.assetId });
      if (!done.ok) return setError(done.message);
      setImage({ assetId: ticket.data.assetId, preview: URL.createObjectURL(file) });
    } finally {
      setUploading(false);
    }
  }

  function send() {
    if (!body.trim() && !image) return;
    startTransition(async () => {
      const res = await sendMessageAction({ conversationId, body, imageAssetId: image?.assetId ?? null });
      if (!res.ok || !res.data) return setError(res.ok ? t("Não foi possível enviar.") : res.message);
      setError(null);
      setBody("");
      setImage(null);
      append([res.data]);
    });
  }

  return (
    <div className="flex min-h-[60dvh] flex-col">
      <div role="log" aria-live="polite" aria-label={t("Conversa com {0}", { 0: otherName })} className="flex flex-1 flex-col gap-2 pb-4">
        {older && (
          <button
            type="button"
            className="self-center text-sm font-semibold text-turf"
            onClick={() =>
              startTransition(async () => {
                const res = await olderMessagesAction({ conversationId, before: older });
                if (res.ok && res.data) {
                  setItems((cur) => [...res.data!.messages.filter((m) => !cur.some((c) => c.id === m.id)), ...cur]);
                  setOlder(res.data.olderCursor);
                }
              })
            }
          >
            {t("Mensagens anteriores")}
          </button>
        )}
        {items.length === 0 && <p className="py-10 text-center text-sm text-muted">{t("Nenhuma mensagem ainda. Diga oi!")}</p>}
        {items.map((m) => (
          <div key={m.id} className={`flex flex-col ${m.mine ? "items-end" : "items-start"}`}>
            <div
              className={`max-w-[80%] rounded-[var(--radius-panel)] px-3.5 py-2 ${m.deleted ? "border border-dashed border-line-strong bg-transparent text-muted italic" : m.mine ? "bg-turf-solid text-white" : "border border-line bg-paper"}`}
            >
              {m.deleted ? (
                t("Mensagem apagada")
              ) : (
                <>
                  {m.imageUrl && (
                    // Short-lived signed URL from private storage.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.imageUrl} alt={t("Foto enviada na conversa")} className="mb-1 max-h-72 rounded-[var(--radius-control)]" loading="lazy" />
                  )}
                  {m.body && <p className="leading-relaxed break-words whitespace-pre-line">{m.body}</p>}
                </>
              )}
            </div>
            <div className="mt-0.5 flex gap-3 px-1 text-xs text-muted">
              <span>{fmt.format(new Date(m.createdAt))}</span>
              {!m.deleted && m.mine && (
                <button
                  type="button"
                  className="font-semibold hover:text-danger"
                  onClick={() => {
                    if (!window.confirm(t("Apagar esta mensagem para os dois?"))) return;
                    startTransition(async () => {
                      const res = await deleteMessageAction({ messageId: m.id });
                      if (res.ok) setItems((cur) => cur.map((x) => (x.id === m.id ? { ...x, deleted: true, body: null, imageUrl: null } : x)));
                    });
                  }}
                >
                  {t("Apagar")}
                </button>
              )}
              {!m.deleted && !m.mine && (
                <button type="button" className="font-semibold hover:text-ink" onClick={() => setReporting(m.id)}>
                  {t("Denunciar")}
                </button>
              )}
            </div>
            {reporting === m.id && (
              <div className="mt-1 w-full max-w-md rounded-[var(--radius-panel)] border border-line bg-paper">
                <ReportForm
                  targetType="message"
                  targetId={m.id}
                  onDone={(msg) => {
                    setReporting(null);
                    if (msg) setError(msg);
                  }}
                />
              </div>
            )}
          </div>
        ))}
        <div ref={bottom} />
      </div>

      {canSend ? (
        <div className="sticky bottom-[var(--tabbar-h,0px)] border-t border-line bg-chalk pt-3">
          {image && (
            <div className="relative mb-2 inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.preview} alt={t("Prévia da foto")} className="max-h-32 rounded-[var(--radius-control)]" />
              <button type="button" onClick={() => setImage(null)} className="absolute top-1 right-1 rounded-full bg-black/75 px-2 text-sm font-bold text-white" aria-label={t("Remover foto")}>
                ×
              </button>
            </div>
          )}
          <div className="flex items-end gap-2">
            <label htmlFor={fileId} className={`grid size-11 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-control)] border border-line-strong bg-paper ${uploading ? "opacity-50" : ""}`}>
              <span className="sr-only">{t("Anexar foto")}</span>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <circle cx="9" cy="10" r="2" />
                <path d="M21 16l-5-5-8 8" />
              </svg>
            </label>
            <input
              id={fileId}
              type="file"
              accept={ACCEPT}
              className="sr-only"
              disabled={uploading}
              onChange={(e) => {
                void pick(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              maxLength={2000}
              rows={1}
              placeholder={t("Mensagem para {0}", { 0: otherName })}
              aria-label={t("Mensagem")}
              className="min-h-11 min-w-0 flex-1 resize-none rounded-[var(--radius-control)] border border-line-strong bg-paper px-3 py-2.5 outline-none focus:border-turf"
            />
            <button type="button" onClick={send} disabled={pending || uploading || (!body.trim() && !image)} className="h-11 shrink-0 rounded-[var(--radius-control)] bg-turf-solid px-4 font-semibold text-white disabled:opacity-50">
              {t("Enviar")}
            </button>
          </div>
          {error && (
            <div className="mt-2">
              <Notice tone="info">{error}</Notice>
            </div>
          )}
        </div>
      ) : (
        <Notice tone="info">{t("Não é possível enviar mensagens nesta conversa (bloqueio ou configuração da consultoria).")}</Notice>
      )}
    </div>
  );
}
