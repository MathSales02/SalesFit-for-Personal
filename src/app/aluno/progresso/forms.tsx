"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { ActionForm } from "@/components/ui/action-form";
import { Notice } from "@/components/ui/notice";
import { PHOTO_POSES } from "@/lib/validation/progress";
import { completePhotoUploadAction, deleteMeasurementAction, deletePhotoAction, requestPhotoUploadAction, setPhotoSharingAction } from "./actions";

const ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_MB = 10;

export function PhotoUploader({ today }: { today: string }) {
  const router = useRouter();
  const id = useId();
  const [takenOn, setTakenOn] = useState(today);
  const [pose, setPose] = useState<(typeof PHOTO_POSES)[number][0]>("front");
  const [state, setState] = useState<{ kind: "idle" | "busy" | "done" } | { kind: "error"; message: string }>({ kind: "idle" });

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (!ACCEPT.split(",").includes(file.type)) return setState({ kind: "error", message: "Envie uma foto JPG, PNG ou WebP." });
    if (file.size > MAX_MB * 1024 * 1024) return setState({ kind: "error", message: `A foto passa de ${MAX_MB} MB.` });
    setState({ kind: "busy" });
    const ticket = await requestPhotoUploadAction({ contentType: file.type, sizeBytes: file.size });
    if (!ticket.ok || !ticket.data) return setState({ kind: "error", message: ticket.ok ? "Não foi possível enviar." : ticket.message });
    const data = new FormData();
    for (const [k, v] of Object.entries(ticket.data.fields)) data.append(k, v);
    data.append("file", file);
    const res = await fetch(ticket.data.url, { method: "POST", body: data }).catch(() => null);
    if (!res?.ok) return setState({ kind: "error", message: "O envio foi interrompido. Tente de novo." });
    const done = await completePhotoUploadAction({ assetId: ticket.data.assetId, takenOn, pose });
    if (!done.ok) return setState({ kind: "error", message: done.message });
    setState({ kind: "done" });
    router.refresh();
  }

  const busy = state.kind === "busy";
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Data da foto
          <input
            type="date"
            value={takenOn}
            max={today}
            onChange={(e) => setTakenOn(e.target.value)}
            className="h-11 rounded-[var(--radius-control)] border border-line-strong bg-paper px-3 font-normal outline-none focus:border-turf"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Ângulo
          <select
            value={pose}
            onChange={(e) => setPose(e.target.value as typeof pose)}
            className="h-11 rounded-[var(--radius-control)] border border-line-strong bg-paper px-3 font-normal outline-none focus:border-turf"
          >
            {PHOTO_POSES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label
        htmlFor={id}
        className={`inline-flex h-11 cursor-pointer items-center justify-center self-start rounded-[var(--radius-control)] bg-turf-solid px-4 font-semibold text-white hover:bg-turf-solid-hover ${busy ? "pointer-events-none opacity-60" : ""}`}
      >
        {busy ? "Enviando…" : "Adicionar foto"}
      </label>
      <input
        id={id}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        disabled={busy}
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <p className="text-sm text-muted">
        A foto fica privada. Removemos a localização e outros dados que o celular grava no arquivo.
      </p>
      <div aria-live="polite">
        {state.kind === "done" && <Notice tone="success">Foto salva. Ela é privada até você compartilhar.</Notice>}
        {state.kind === "error" && <Notice tone="error">{state.message}</Notice>}
      </div>
    </div>
  );
}

export function ShareToggle({ photoId, shared }: { photoId: string; shared: boolean }) {
  return (
    <ActionForm action={setPhotoSharingAction} className="flex" successNotice={false}>
      {() => (
        <>
          <input type="hidden" name="photoId" value={photoId} />
          <input type="hidden" name="shared" value={shared ? "0" : "1"} />
          <button
            type="submit"
            aria-pressed={shared}
            aria-label={shared ? "Parar de compartilhar com o treinador" : "Compartilhar com o treinador"}
            className={`h-11 px-3 text-sm font-semibold ${shared ? "text-ink-soft" : "text-turf"}`}
          >
            {shared ? "Tornar privada" : "Compartilhar"}
          </button>
        </>
      )}
    </ActionForm>
  );
}

export function DeletePhotoButton({ photoId }: { photoId: string }) {
  return (
    <ActionForm action={deletePhotoAction} className="flex" successNotice={false}>
      {() => (
        <>
          <input type="hidden" name="photoId" value={photoId} />
          <button
            type="submit"
            className="h-11 px-3 text-sm font-semibold text-danger"
            onClick={(e) => {
              if (!window.confirm("Apagar esta foto definitivamente?")) e.preventDefault();
            }}
          >
            Apagar
          </button>
        </>
      )}
    </ActionForm>
  );
}

export function DeleteMeasurementButton({ measurementId }: { measurementId: string }) {
  return (
    <ActionForm action={deleteMeasurementAction} className="flex justify-end" successNotice={false}>
      {() => (
        <>
          <input type="hidden" name="measurementId" value={measurementId} />
          <button
            type="submit"
            className="px-2 py-1 text-sm font-semibold text-danger"
            aria-label="Apagar medição"
            onClick={(e) => {
              if (!window.confirm("Apagar esta medição?")) e.preventDefault();
            }}
          >
            Apagar
          </button>
        </>
      )}
    </ActionForm>
  );
}
