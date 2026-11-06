"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { blockAction, followAction } from "@/app/_community/actions";
import { buttonClass } from "@/components/ui/button-styles";
import { ReportForm } from "./post-card";

export function ProfileActions({ memberId, isFollowing, blockedByMe }: { memberId: string; isFollowing: boolean; blockedByMe: boolean }) {
  const router = useRouter();
  const [reporting, setReporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    startTransition(async () => {
      const res = await fn();
      if (res.ok) router.refresh();
      else setNotice(res.message ?? "Não foi possível.");
    });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {!blockedByMe && (
          <button type="button" disabled={pending} className={buttonClass(isFollowing ? "secondary" : "primary")} onClick={() => run(() => followAction({ memberId, follow: !isFollowing }))}>
            {isFollowing ? "Seguindo" : "Seguir"}
          </button>
        )}
        <button
          type="button"
          disabled={pending}
          className={buttonClass("ghost")}
          onClick={() => {
            if (!blockedByMe && !window.confirm("Bloquear? Vocês deixam de ver as publicações um do outro.")) return;
            run(() => blockAction({ memberId, block: !blockedByMe }));
          }}
        >
          {blockedByMe ? "Desbloquear" : "Bloquear"}
        </button>
        <button type="button" className={buttonClass("ghost")} onClick={() => setReporting(true)}>
          Denunciar
        </button>
      </div>
      {notice && <p className="text-sm text-ink-soft">{notice}</p>}
      {reporting && (
        <div className="rounded-[var(--radius-panel)] border border-line bg-paper">
          <ReportForm
            targetType="member"
            targetId={memberId}
            onDone={(m) => {
              setReporting(false);
              setNotice(m || null);
            }}
          />
        </div>
      )}
    </div>
  );
}
