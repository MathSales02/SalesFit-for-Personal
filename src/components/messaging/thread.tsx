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

const POLL_MS = 4000;
const ACCEPT = "image/jpeg,image/png,image/webp";
const fmt = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

type Cursor = { createdAt: string; id: string } | null;

/**
 * A conversation. New messages arrive by polling every few seconds while the
 * tab is visible (a WebSocket channel is planned for the optimization phase).
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
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      const res = await pollMessagesAction({ conversationId, after: latest.current });
      if (res.ok && res.data?.length) append(res.data);
    };
    const t = setInterval(() => void tick(), POLL_MS);
    return () => clearInterval(t);
  }, [conversationId]);

  async function pick(file: File | undefined) {
    if (!file) return;
    if (!ACCEPT.split(",").includes(file.type) || file.size > 10 * 1024 * 1024) return setError("Envie uma foto JPG, PNG ou WebP de até 10 MB.");
    setError(null);
    setUploading(true);
    try {
      const t = await requestMessageImageAction({ contentType: file.type, sizeBytes: file.size });
      if (!t.ok || !t.data) return setError(t.ok ? "Não foi possível enviar." : t.message);
      const fd = new FormData();
      for (const [k, v] of Object.entries(t.data.fields)) fd.append(k, v);
      fd.append("file", file);
      const up = await fetch(t.data.url, { method: "POST", body: fd }).catch(() => null);
      if (!up?.ok) return setError("O envio foi interrompido.");
      const done = await completeMessageImageAction({ assetId: t.data.assetId });
      if (!done.ok) return setError(done.message);
      setImage({ assetId: t.data.assetId, preview: URL.createObjectURL(file) });
    } finally {
      setUploading(false);
    }
  }

  function send() {
    if (!body.trim() && !image) return;
    startTransition(async () => {
      const res = await sendMessageAction({ conversationId, body, imageAssetId: image?.assetId ?? null });
      if (!res.ok || !res.data) return setError(res.ok ? "Não foi possível enviar." : res.message);
      setError(null);
      setBody("");
      setImage(null);
      append([res.data]);
    });
  }

  return (
    <div className="flex min-h-[60dvh] flex-col">
      <div role="log" aria-live="polite" aria-label={`Conversa com ${otherName}`} className="flex flex-1 flex-col gap-2 pb-4">
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
            Mensagens anteriores
          </button>
        )}
        {items.length === 0 && <p className="py-10 text-center text-sm text-muted">Nenhuma mensagem ainda. Diga oi!</p>}
        {items.map((m) => (
          <div key={m.id} className={`flex flex-col ${m.mine ? "items-end" : "items-start"}`}>
            <div
              className={`max-w-[80%] rounded-[var(--radius-panel)] px-3.5 py-2 ${m.deleted ? "border border-dashed border-line-strong bg-transparent text-muted italic" : m.mine ? "bg-turf text-white" : "border border-line bg-paper"}`}
            >
              {m.deleted ? (
                "Mensagem apagada"
              ) : (
                <>
                  {m.imageUrl && (
                    // Short-lived signed URL from private storage.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.imageUrl} alt="Foto enviada na conversa" className="mb-1 max-h-72 rounded-[var(--radius-control)]" loading="lazy" />
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
                    if (!window.confirm("Apagar esta mensagem para os dois?")) return;
                    startTransition(async () => {
                      const res = await deleteMessageAction({ messageId: m.id });
                      if (res.ok) setItems((cur) => cur.map((x) => (x.id === m.id ? { ...x, deleted: true, body: null, imageUrl: null } : x)));
                    });
                  }}
                >
                  Apagar
                </button>
              )}
              {!m.deleted && !m.mine && (
                <button type="button" className="font-semibold hover:text-ink" onClick={() => setReporting(m.id)}>
                  Denunciar
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
        <div className="sticky bottom-16 border-t border-line bg-chalk pt-3 sm:bottom-0">
          {image && (
            <div className="relative mb-2 inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.preview} alt="Prévia da foto" className="max-h-32 rounded-[var(--radius-control)]" />
              <button type="button" onClick={() => setImage(null)} className="absolute top-1 right-1 rounded-full bg-ink/80 px-2 text-sm font-bold text-white" aria-label="Remover foto">
                ×
              </button>
            </div>
          )}
          <div className="flex items-end gap-2">
            <label htmlFor={fileId} className={`grid size-11 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-control)] border border-line-strong bg-paper ${uploading ? "opacity-50" : ""}`} aria-label="Anexar foto">
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
              placeholder={`Mensagem para ${otherName}`}
              aria-label="Mensagem"
              className="min-h-11 min-w-0 flex-1 resize-none rounded-[var(--radius-control)] border border-line-strong bg-paper px-3 py-2.5 outline-none focus:border-turf"
            />
            <button type="button" onClick={send} disabled={pending || uploading || (!body.trim() && !image)} className="h-11 shrink-0 rounded-[var(--radius-control)] bg-turf px-4 font-semibold text-white disabled:opacity-50">
              Enviar
            </button>
          </div>
          {error && (
            <div className="mt-2">
              <Notice tone="info">{error}</Notice>
            </div>
          )}
        </div>
      ) : (
        <Notice tone="info">Não é possível enviar mensagens nesta conversa (bloqueio ou configuração da consultoria).</Notice>
      )}
    </div>
  );
}
