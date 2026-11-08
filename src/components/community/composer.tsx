"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { completePostImageAction, createPostAction, requestPostImageAction } from "@/app/_community/actions";
import { Notice } from "@/components/ui/notice";
import { Avatar } from "./post-card";

const ACCEPT = "image/jpeg,image/png,image/webp";

export function Composer({ name, canAnnounce }: { name: string; canAnnounce: boolean }) {
  const router = useRouter();
  const fileId = useId();
  const [body, setBody] = useState("");
  const [image, setImage] = useState<{ assetId: string; preview: string; held: boolean } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [announcement, setAnnouncement] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  async function pick(file: File | undefined) {
    if (!file) return;
    if (!ACCEPT.split(",").includes(file.type)) return setMsg({ tone: "error", text: "Envie uma foto JPG, PNG ou WebP." });
    if (file.size > 10 * 1024 * 1024) return setMsg({ tone: "error", text: "A foto passa de 10 MB." });
    setMsg(null);
    setUploading(true);
    try {
      const ticket = await requestPostImageAction({ contentType: file.type, sizeBytes: file.size });
      if (!ticket.ok || !ticket.data) return setMsg({ tone: "error", text: ticket.ok ? "Não foi possível enviar." : ticket.message });
      const fd = new FormData();
      for (const [k, v] of Object.entries(ticket.data.fields)) fd.append(k, v);
      fd.append("file", file);
      const up = await fetch(ticket.data.url, { method: "POST", body: fd }).catch(() => null);
      if (!up?.ok) return setMsg({ tone: "error", text: "O envio foi interrompido. Tente de novo." });
      const done = await completePostImageAction({ assetId: ticket.data.assetId });
      if (!done.ok) return setMsg({ tone: "error", text: done.message });
      const held = done.data?.moderation === "review";
      setImage({ assetId: ticket.data.assetId, preview: URL.createObjectURL(file), held });
      if (held) setMsg({ tone: "info", text: "Esta foto vai passar pela revisão do treinador antes de aparecer para os outros." });
    } finally {
      setUploading(false);
    }
  }

  function submit() {
    startTransition(async () => {
      const res = await createPostAction({ body, imageAssetId: image?.assetId ?? null, announcement });
      if (!res.ok) return setMsg({ tone: "error", text: res.message });
      setBody("");
      setImage(null);
      setAnnouncement(false);
      setMsg({ tone: res.data?.status === "pending_review" ? "info" : "success", text: res.message ?? "Publicado." });
      router.refresh();
    });
  }

  return (
    <section aria-label="Nova publicação" className="rounded-[var(--radius-panel)] border border-line bg-paper p-4">
      <div className="flex gap-3">
        <Avatar name={name} />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={2000}
          rows={2}
          placeholder="Como foi o treino hoje?"
          aria-label="Texto da publicação"
          className="min-h-11 flex-1 resize-y rounded-[var(--radius-control)] border border-line-strong px-3 py-2 outline-none focus:border-turf"
        />
      </div>
      {image && (
        <div className="relative mt-3 ml-[52px] inline-block">
          {/* Local preview of the file the user just picked. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.preview} alt="Prévia da foto" className="max-h-48 rounded-[var(--radius-control)]" />
          <button type="button" onClick={() => setImage(null)} className="absolute top-1 right-1 rounded-full bg-black/75 px-2 text-sm font-bold text-white" aria-label="Remover foto">
            ×
          </button>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 pl-[52px]">
        <div className="flex items-center gap-4">
          <label htmlFor={fileId} className={`cursor-pointer text-sm font-semibold text-turf ${uploading ? "pointer-events-none opacity-60" : ""}`}>
            {uploading ? "Conferindo foto…" : image ? "Trocar foto" : "Adicionar foto"}
          </label>
          <input
            id={fileId}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            onChange={(e) => {
              void pick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          {canAnnounce && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={announcement} onChange={(e) => setAnnouncement(e.target.checked)} className="size-4 accent-turf" />
              Aviso fixado
            </label>
          )}
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={pending || uploading || (!body.trim() && !image)}
          className="h-10 rounded-[var(--radius-control)] bg-turf-solid px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          {pending ? "Publicando…" : "Publicar"}
        </button>
      </div>
      {msg && (
        <div className="mt-3" aria-live="polite">
          <Notice tone={msg.tone}>{msg.text}</Notice>
        </div>
      )}
    </section>
  );
}
