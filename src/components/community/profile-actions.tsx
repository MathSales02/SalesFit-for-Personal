"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { blockAction, updateProfileAction } from "@/app/_community/actions";
import { openConversationAction } from "@/app/_messaging/actions";
import { GOAL_LABELS } from "@/lib/validation/community";
import type { FitnessGoal } from "@/server/db/schema";
import { Avatar } from "./avatar";
import { uploadCommunityPhoto } from "./composer";
import { FollowButton } from "./follow-button";
import { CameraIcon, CloseIcon, MoreIcon } from "./icons";
import { ReportForm } from "./report-form";
import { useT } from "@/i18n/client";

/** Follow, message, and the quieter options (block, report) behind a menu. */
export function ProfileActions({ memberId, name, isFollowing, blockedByMe, canMessage }: { memberId: string; name: string; isFollowing: boolean; blockedByMe: boolean; canMessage: boolean }) {
  const t = useT();
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const reportDialog = useRef<HTMLDialogElement>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function block() {
    setMenu(false);
    if (!blockedByMe && !window.confirm(t("Bloquear {0}? Vocês deixam de ver as publicações um do outro.", { 0: name }))) return;
    startTransition(async () => {
      const res = await blockAction({ memberId, block: !blockedByMe });
      if (res.ok) router.refresh();
      else setNotice(t(res.message));
    });
  }

  const pill = "inline-flex h-10 items-center rounded-full border border-line-strong bg-paper px-4 text-sm font-semibold text-ink hover:border-turf/60 disabled:opacity-60";
  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {blockedByMe ? (
          <button type="button" disabled={pending} className={pill} onClick={block}>
            {t("Desbloquear")}
          </button>
        ) : (
          <FollowButton memberId={memberId} name={name} initial={isFollowing} refresh />
        )}
        {canMessage && !blockedByMe && (
          <form
            action={async (form) => {
              const res = await openConversationAction({ ok: true }, form);
              if (res && !res.ok) setNotice(t(res.message));
            }}
          >
            <input type="hidden" name="memberId" value={memberId} />
            <button type="submit" className={pill}>
              {t("Mensagem")}
            </button>
          </form>
        )}
        <div className="relative">
          <button type="button" aria-haspopup="menu" aria-expanded={menu} aria-label={t("Mais opções sobre {0}", { 0: name })} onClick={() => setMenu((m) => !m)} className="grid size-10 place-items-center rounded-full border border-line-strong bg-paper text-ink-soft hover:border-turf/60">
            <MoreIcon />
          </button>
          {menu && (
            <div role="menu" className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-2xl border border-line bg-paper py-1.5 text-[0.92rem] shadow-[var(--shadow-card)]">
              {!blockedByMe && (
                <button type="button" role="menuitem" className="block w-full px-4 py-2.5 text-left hover:bg-chalk" onClick={block}>
                  {t("Bloquear")}
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                className="block w-full px-4 py-2.5 text-left hover:bg-chalk"
                onClick={() => {
                  setMenu(false);
                  reportDialog.current?.showModal();
                }}
              >
                {t("Denunciar")}
              </button>
            </div>
          )}
        </div>
      </div>
      {notice && (
        <p role="status" className="text-sm text-ink-soft">
          {notice}
        </p>
      )}
      <dialog ref={reportDialog} aria-label={t("Denunciar {0}", { 0: name })} className="cm-sheet">
        <ReportForm
          targetType="member"
          targetId={memberId}
          onDone={(m) => {
            reportDialog.current?.close();
            setNotice(m || null);
          }}
        />
      </dialog>
    </div>
  );
}

const GOALS = Object.entries(GOAL_LABELS) as [FitnessGoal, string][];

/** The member's own card: photo, bio and training goal. */
export function EditProfile({ name, avatarUrl, bio, goal, cta = false }: { name: string; avatarUrl: string | null; bio: string | null; goal: FitnessGoal | null; cta?: boolean }) {
  const t = useT();
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState(bio ?? "");
  const [chosen, setChosen] = useState<FitnessGoal | null>(goal);
  // undefined: keep the current photo; null: remove it; object: a new upload.
  const [photo, setPhoto] = useState<{ assetId: string; preview: string } | null | undefined>(undefined);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const shown = photo === undefined ? avatarUrl : (photo?.preview ?? null);

  async function pick(f: File | undefined) {
    if (!f) return;
    setError(null);
    setUploading(true);
    try {
      const res = await uploadCommunityPhoto(f);
      if (!res.ok) return setError(t(res.message));
      if (res.held) return setError(t("Esta foto não pode ser usada como foto de perfil. Escolha outra."));
      setPhoto({ assetId: res.assetId, preview: URL.createObjectURL(f) });
    } finally {
      setUploading(false);
    }
  }

  function save() {
    startTransition(async () => {
      const res = await updateProfileAction({ bio: text, goal: chosen, ...(photo === undefined ? {} : { avatarAssetId: photo?.assetId ?? null }) });
      if (!res.ok) return setError(t(res.message));
      dialog.current?.close();
      setPhoto(undefined);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className={
          cta
            ? "inline-flex h-10 items-center rounded-full bg-signal px-5 text-sm font-semibold text-on-accent active:scale-95"
            : "inline-flex h-10 items-center rounded-full border border-line-strong bg-paper px-4 text-sm font-semibold hover:border-turf/60"
        }
      >
        {cta ? t("Completar perfil") : t("Editar perfil")}
      </button>
      <dialog ref={dialog} aria-labelledby="edit-profile-h" className="cm-sheet">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 id="edit-profile-h" className="font-display text-lg font-bold">
            {t("Editar perfil")}
          </h2>
          <button type="button" onClick={() => dialog.current?.close()} aria-label={t("Fechar")} className="grid size-10 place-items-center rounded-full text-ink-soft hover:bg-chalk">
            <CloseIcon />
          </button>
        </div>
        <div className="flex max-h-[min(70dvh,34rem)] flex-col gap-5 overflow-y-auto px-5 py-5">
          <div className="flex items-center gap-4">
            <Avatar name={name} src={shown} size={84} />
            <div className="flex flex-col items-start gap-1.5">
              <label className={`inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border border-line-strong px-4 text-sm font-semibold hover:border-turf/60 has-focus-visible:outline-2 has-focus-visible:outline-turf ${uploading ? "pointer-events-none opacity-60" : ""}`}>
                <CameraIcon className="size-[18px]" />
                {uploading ? t("Conferindo foto…") : shown ? t("Trocar foto") : t("Adicionar foto")}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={uploading}
                  className="sr-only"
                  onChange={(e) => {
                    void pick(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
              {shown && (
                <button type="button" className="px-1 text-sm font-semibold text-danger" onClick={() => setPhoto(null)}>
                  {t("Remover foto")}
                </button>
              )}
            </div>
          </div>

          <label className="block">
            <span className="mb-1.5 flex items-baseline justify-between text-sm font-semibold">
              {t("Bio")}
              <span className="text-xs font-medium text-muted tabular-nums">{text.length}/160</span>
            </span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={160}
              rows={3}
              placeholder={t("Conte em uma frase o que te move a treinar")}
              className="w-full resize-none rounded-2xl border border-line-strong bg-paper px-3.5 py-3 outline-none placeholder:text-muted focus:border-turf"
            />
          </label>

          <fieldset>
            <legend className="mb-2 text-sm font-semibold">{t("Objetivo")}</legend>
            <div className="flex flex-wrap gap-2">
              {GOALS.map(([v, l]) => (
                <label
                  key={v}
                  className={`cursor-pointer rounded-full border px-3.5 py-2 text-sm transition-colors has-focus-visible:outline-2 has-focus-visible:outline-turf ${
                    chosen === v ? "border-ink bg-ink font-semibold text-paper" : "border-line-strong text-ink-soft hover:border-ink-soft"
                  }`}
                >
                  <input type="checkbox" checked={chosen === v} onChange={() => setChosen(chosen === v ? null : v)} className="sr-only" />
                  {l}
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">{t("Foto, bio e objetivo aparecem para as pessoas da sua consultoria.")}</p>
          </fieldset>

          {error && (
            <p role="alert" className="rounded-2xl bg-danger-tint px-3.5 py-2.5 text-sm text-danger">
              {error}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
          <button type="button" className="h-11 rounded-full px-4 text-sm font-semibold text-ink-soft hover:bg-chalk" onClick={() => dialog.current?.close()}>
            {t("Cancelar")}
          </button>
          <button type="button" disabled={pending || uploading} onClick={save} className="h-11 rounded-full bg-signal px-6 text-sm font-semibold text-on-accent active:scale-95 disabled:opacity-60">
            {pending ? t("Salvando…") : t("Salvar")}
          </button>
        </div>
      </dialog>
    </>
  );
}
