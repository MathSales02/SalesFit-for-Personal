"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Notice } from "@/components/ui/notice";
import { completeVideoUploadAction, requestVideoUploadAction } from "./actions";

const ACCEPT = "video/mp4,video/quicktime,video/webm";
const MAX_MB = 200;

type Phase = { kind: "idle" } | { kind: "uploading"; percent: number } | { kind: "verifying" } | { kind: "done" } | { kind: "error"; message: string };

/** Posts the file straight to private storage with a signed form, then asks the server to verify it. */
function postToStorage(url: string, fields: Record<string, string>, file: File, onProgress: (p: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const data = new FormData();
    for (const [k, v] of Object.entries(fields)) data.append(k, v);
    data.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`storage ${xhr.status}`)));
    xhr.onerror = () => reject(new Error("network"));
    xhr.send(data);
  });
}

export function VideoUploader({ exerciseId, hasVideo }: { exerciseId: string; hasVideo: boolean }) {
  const router = useRouter();
  const inputId = useId();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const busy = phase.kind === "uploading" || phase.kind === "verifying";

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (!ACCEPT.split(",").includes(file.type)) return setPhase({ kind: "error", message: "Envie um vídeo MP4, MOV ou WebM." });
    if (file.size > MAX_MB * 1024 * 1024) return setPhase({ kind: "error", message: `O vídeo passa de ${MAX_MB} MB. Corte ou comprima antes de enviar.` });

    setPhase({ kind: "uploading", percent: 0 });
    const ticket = await requestVideoUploadAction({ contentType: file.type, sizeBytes: file.size });
    if (!ticket.ok || !ticket.data) return setPhase({ kind: "error", message: ticket.ok ? "Não foi possível iniciar o envio." : ticket.message });
    try {
      await postToStorage(ticket.data.url, ticket.data.fields, file, (percent) => setPhase({ kind: "uploading", percent }));
    } catch {
      return setPhase({ kind: "error", message: "O envio foi interrompido. Verifique a conexão e tente de novo." });
    }
    setPhase({ kind: "verifying" });
    const done = await completeVideoUploadAction({ exerciseId, assetId: ticket.data.assetId });
    if (!done.ok) return setPhase({ kind: "error", message: done.message });
    setPhase({ kind: "done" });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <label
        htmlFor={inputId}
        className={`inline-flex h-11 cursor-pointer items-center justify-center self-start rounded-[var(--radius-control)] border border-line-strong bg-paper px-4 text-[0.95rem] font-semibold hover:border-ink-soft ${
          busy ? "pointer-events-none opacity-60" : ""
        }`}
      >
        {hasVideo ? "Trocar vídeo" : "Enviar vídeo"}
      </label>
      <input
        id={inputId}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        disabled={busy}
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <p className="text-sm text-muted">MP4, MOV ou WebM, até {MAX_MB} MB. O vídeo fica privado: só você e seus alunos assistem.</p>
      {phase.kind === "uploading" && (
        <div role="status" aria-live="polite" className="flex flex-col gap-1.5">
          <div className="h-1.5 overflow-hidden rounded-full bg-turf-tint">
            <div className="h-full rounded-full bg-turf transition-[width]" style={{ width: `${phase.percent}%` }} />
          </div>
          <span className="text-sm text-muted">Enviando… {phase.percent}%</span>
        </div>
      )}
      {phase.kind === "verifying" && (
        <p role="status" className="text-sm text-muted">
          Conferindo o arquivo…
        </p>
      )}
      {phase.kind === "done" && <Notice tone="success">Vídeo enviado.</Notice>}
      {phase.kind === "error" && <Notice tone="error">{phase.message}</Notice>}
    </div>
  );
}
