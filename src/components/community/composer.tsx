"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { completePostImageAction, createPostAction, requestPostImageAction, shareWorkoutAction } from "@/app/_community/actions";
import type { ShareableWorkout } from "@/server/community/service";
import { Avatar } from "./avatar";
import { CloseIcon, ImageIcon, PinIcon, PlusIcon, WorkoutIcon } from "./icons";
import { useLocale, useT } from "@/i18n/client";

const ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_BYTES = 10 * 1024 * 1024;
const dayIn = (locale: string) => new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "America/Sao_Paulo" });

type Msg = { tone: "error" | "info"; text: string };

/** Uploads a photo through the screened pipeline; resolves with the asset or a message to show. */
export async function uploadCommunityPhoto(file: File): Promise<{ ok: true; assetId: string; held: boolean } | { ok: false; message: string }> {
  if (!ACCEPT.split(",").includes(file.type)) return { ok: false, message: "Envie uma foto JPG, PNG ou WebP." };
  if (file.size > MAX_BYTES) return { ok: false, message: "A foto passa de 10 MB." };
  const ticket = await requestPostImageAction({ contentType: file.type, sizeBytes: file.size });
  if (!ticket.ok || !ticket.data) return { ok: false, message: ticket.ok ? "Não foi possível enviar." : ticket.message };
  const fd = new FormData();
  for (const [k, v] of Object.entries(ticket.data.fields)) fd.append(k, v);
  fd.append("file", file);
  const up = await fetch(ticket.data.url, { method: "POST", body: fd }).catch(() => null);
  if (!up?.ok) return { ok: false, message: "O envio foi interrompido. Tente de novo." };
  const done = await completePostImageAction({ assetId: ticket.data.assetId });
  if (!done.ok) return { ok: false, message: done.message };
  return { ok: true, assetId: ticket.data.assetId, held: done.data?.moderation === "review" };
}

/**
 * Creating a post: a prompt at the top of the feed, a floating button on phones,
 * and one sheet where the person writes, adds a photo or shares a finished workout.
 */
export function Composer({
  me,
  canAnnounce,
  workouts,
}: {
  me: { name: string; avatarUrl: string | null };
  canAnnounce: boolean;
  workouts: ShareableWorkout[];
}) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const fileId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const text = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [body, setBody] = useState("");
  const [image, setImage] = useState<{ assetId: string; preview: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [announcement, setAnnouncement] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  function open(intent: "text" | "photo" | "workout" = "text") {
    setMsg(null);
    dialog.current?.showModal();
    if (intent === "photo") file.current?.click();
    else if (intent === "workout" && workouts[0]) setSessionId(workouts[0].sessionId);
    text.current?.focus();
  }

  async function pick(f: File | undefined) {
    if (!f) return;
    setMsg(null);
    setUploading(true);
    try {
      const res = await uploadCommunityPhoto(f);
      if (!res.ok) return setMsg({ tone: "error", text: res.message });
      setImage({ assetId: res.assetId, preview: URL.createObjectURL(f) });
      setSessionId(null);
      if (res.held) setMsg({ tone: "info", text: t("Esta foto vai passar pela revisão do treinador antes de aparecer para os outros.") });
    } finally {
      setUploading(false);
    }
  }

  function submit() {
    startTransition(async () => {
      let res: { ok: boolean; message?: string; data?: { status?: string } };
      if (sessionId) {
        const fd = new FormData();
        fd.set("sessionId", sessionId);
        fd.set("body", body);
        res = await shareWorkoutAction({ ok: true }, fd);
      } else {
        res = await createPostAction({ body, imageAssetId: image?.assetId ?? null, announcement });
      }
      if (!res.ok) return setMsg({ tone: "error", text: res.message ?? t("Não foi possível publicar.") });
      setBody("");
      setImage(null);
      setAnnouncement(false);
      setSessionId(null);
      dialog.current?.close();
      setToast(res.message ?? "Publicado.");
      router.refresh();
    });
  }

  const canSubmit = !pending && !uploading && (!!body.trim() || !!image || !!sessionId);
  const quick = "flex h-10 items-center gap-2 rounded-full px-3.5 text-sm font-semibold text-ink-soft transition-colors hover:bg-chalk";

  return (
    <>
      <section aria-label={t("Nova publicação")} className="rounded-[28px] border border-line bg-paper p-3 shadow-[var(--shadow-card)] sm:p-4">
        <div className="flex items-center gap-3">
          <Avatar name={me.name} src={me.avatarUrl} size={44} />
          <button
            type="button"
            onClick={() => open()}
            className="h-12 flex-1 rounded-full bg-chalk px-5 text-left text-[0.98rem] text-muted transition-colors hover:bg-surface-subtle hover:text-ink-soft"
          >
            {t("Como foi o treino hoje?")}
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1 pl-1 sm:pl-14">
          <button type="button" onClick={() => open("photo")} className={quick}>
            <ImageIcon className="size-5 text-turf" /> {t("Foto")}
          </button>
          {workouts.length > 0 && (
            <button type="button" onClick={() => open("workout")} className={quick}>
              <WorkoutIcon className="size-5 text-turf" /> {t("Treino concluído")}
            </button>
          )}
          {canAnnounce && (
            <button
              type="button"
              onClick={() => {
                setAnnouncement(true);
                open();
              }}
              className={quick}
            >
              <PinIcon className="size-5 text-turf" /> {t("Aviso")}
            </button>
          )}
        </div>
      </section>

      {/* Phones: always one tap away, above the tab bar. */}
      <button
        type="button"
        onClick={() => open()}
        aria-label={t("Nova publicação")}
        className="fixed right-4 bottom-[calc(var(--tabbar-h,0px)+1rem)] z-10 grid size-14 place-items-center rounded-full bg-signal text-on-accent shadow-[0_10px_30px_-8px_rgba(242,105,15,0.7)] transition-transform active:scale-90 lg:hidden"
      >
        <PlusIcon className="size-6" />
      </button>

      {toast && (
        <p role="status" className="cm-rise fixed inset-x-4 bottom-[calc(var(--tabbar-h,0px)+5.5rem)] z-20 mx-auto max-w-sm rounded-full bg-ink px-5 py-3 text-center text-sm font-semibold text-paper shadow-lg lg:bottom-8">
          {toast}
        </p>
      )}

      <dialog ref={dialog} aria-labelledby={`${fileId}-h`} className="cm-sheet" onClose={() => setMsg(null)}>
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 id={`${fileId}-h`} className="font-display text-lg font-bold">
            {t("Nova publicação")}
          </h2>
          <button type="button" onClick={() => dialog.current?.close()} aria-label={t("Fechar")} className="grid size-10 place-items-center rounded-full text-ink-soft hover:bg-chalk">
            <CloseIcon />
          </button>
        </div>

        <div className="flex max-h-[min(70dvh,34rem)] flex-col gap-4 overflow-y-auto px-5 py-4">
          <div className="flex gap-3">
            <Avatar name={me.name} src={me.avatarUrl} size={44} />
            <textarea
              ref={text}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={2000}
              placeholder={sessionId ? t("Conte como foi (opcional)") : announcement ? t("Escreva o aviso para a turma") : t("Compartilhe uma conquista, uma dica ou como foi o treino")}
              aria-label={t("Texto da publicação")}
              className="field-sizing-content min-h-28 flex-1 resize-none bg-transparent pt-2.5 text-[1.05rem] leading-relaxed outline-none placeholder:text-muted"
            />
          </div>

          {image && (
            <div className="relative self-start">
              {/* Local preview of the file the person just picked. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.preview} alt={t("Prévia da foto")} className="max-h-64 rounded-[20px]" />
              <button type="button" onClick={() => setImage(null)} className="absolute top-2 right-2 grid size-9 place-items-center rounded-full bg-black/75 text-white" aria-label={t("Remover foto")}>
                <CloseIcon className="size-4" />
              </button>
            </div>
          )}

          {workouts.length > 0 && !image && !announcement && (
            <fieldset>
              <legend className="mb-2 text-caption text-muted">{t("Compartilhar um treino concluído")}</legend>
              <div className="flex flex-col gap-2">
                {workouts.map((w) => {
                  const on = sessionId === w.sessionId;
                  return (
                    <label
                      key={w.sessionId}
                      className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-3.5 py-3 transition-colors has-focus-visible:outline-2 has-focus-visible:outline-turf ${
                        on ? "border-turf bg-turf-tint" : "border-line hover:border-line-strong"
                      }`}
                    >
                      <input type="checkbox" checked={on} onChange={() => setSessionId(on ? null : w.sessionId)} className="sr-only" />
                      <span className={`grid size-10 shrink-0 place-items-center rounded-full ${on ? "bg-signal text-on-accent" : "bg-chalk text-ink-soft"}`}>
                        <WorkoutIcon />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{w.dayName}</span>
                        <span className="block text-sm text-muted">
                          {dayIn(locale).format(new Date(w.finishedAt))}
                          {w.durationMinutes ? t(" · {0} min", { 0: w.durationMinutes }) : ""}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-muted">{t("Vão só os números do treino e os recordes. Esforço e anotações continuam privados.")}</p>
            </fieldset>
          )}

          {msg && (
            <p role={msg.tone === "error" ? "alert" : "status"} className={`rounded-2xl px-3.5 py-2.5 text-sm ${msg.tone === "error" ? "bg-danger-tint text-danger" : "bg-signal-tint text-ink"}`}>
              {msg.text}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1 border-t border-line px-3 py-3 sm:px-4">
          <label
            htmlFor={fileId}
            className={`flex h-11 cursor-pointer items-center gap-2 rounded-full px-3.5 text-sm font-semibold text-ink-soft hover:bg-chalk has-focus-visible:outline-2 has-focus-visible:outline-turf ${uploading || sessionId ? "pointer-events-none opacity-50" : ""}`}
          >
            <ImageIcon className="size-5 text-turf" />
            {uploading ? t("Conferindo…") : image ? t("Trocar foto") : t("Foto")}
            <input
              ref={file}
              id={fileId}
              type="file"
              accept={ACCEPT}
              disabled={uploading || !!sessionId}
              className="sr-only"
              onChange={(e) => {
                void pick(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          {canAnnounce && !sessionId && (
            <label className={`flex h-11 cursor-pointer items-center gap-2 rounded-full px-3.5 text-sm font-semibold has-focus-visible:outline-2 has-focus-visible:outline-turf ${announcement ? "bg-turf-tint text-turf" : "text-ink-soft hover:bg-chalk"}`}>
              <input type="checkbox" checked={announcement} onChange={(e) => setAnnouncement(e.target.checked)} className="sr-only" />
              <PinIcon className="size-5" /> {t("Aviso fixado")}
            </label>
          )}
          <span className="ml-auto mr-2 hidden text-xs text-muted tabular-nums sm:block" aria-hidden="true">
            {body.length > 1800 ? `${body.length}/2000` : ""}
          </span>
          <button type="button" onClick={submit} disabled={!canSubmit} className="ml-auto h-11 rounded-full bg-signal px-6 text-sm font-semibold text-on-accent transition-transform active:scale-95 disabled:opacity-45 sm:ml-0">
            {pending ? t("Publicando…") : t("Publicar")}
          </button>
        </div>
      </dialog>
    </>
  );
}
