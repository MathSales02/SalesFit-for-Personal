"use client";

import { moderatePostAction, resolveReportAction, updateSettingsAction } from "@/app/_community/actions";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/button";
import type { CommunitySettings } from "@/server/community/service";
import { useT } from "@/i18n/client";

export function ModeratePostButtons({ postId }: { postId: string }) {
  const t = useT();
  return (
    <ActionForm action={moderatePostAction} className="flex flex-col gap-2">
      {() => (
        <div className="flex gap-2">
          <input type="hidden" name="postId" value={postId} />
          <SubmitButton name="decision" value="approve">
            {t("Aprovar")}
          </SubmitButton>
          <SubmitButton name="decision" value="remove" variant="danger">
            {t("Recusar")}
          </SubmitButton>
        </div>
      )}
    </ActionForm>
  );
}

export function ResolveReportButtons({ reportId, canRemove }: { reportId: string; canRemove: boolean }) {
  const t = useT();
  return (
    <ActionForm action={resolveReportAction} className="flex flex-col gap-2">
      {() => (
        <div className="flex flex-wrap gap-2">
          <input type="hidden" name="reportId" value={reportId} />
          {canRemove && (
            <SubmitButton name="decision" value="remove_content" variant="danger">
              {t("Remover conteúdo")}
            </SubmitButton>
          )}
          <SubmitButton name="decision" value="dismiss" variant="secondary">
            {t("Manter e arquivar")}
          </SubmitButton>
        </div>
      )}
    </ActionForm>
  );
}

const SWITCHES: { name: keyof CommunitySettings; label: string; hint: string }[] = [
  { name: "communityEnabled", label: "Comunidade ativa", hint: "Desligada, os alunos não veem nem publicam no feed." },
  { name: "studentPostsRequireApproval", label: "Aprovar posts dos alunos antes de publicar", hint: "Cada post de aluno entra na fila de revisão." },
  { name: "studentDirectMessages", label: "Alunos podem conversar entre si", hint: "Conversas com você continuam sempre liberadas." },
];

export function SettingsForm({ settings }: { settings: CommunitySettings }) {
  const t = useT();
  return (
    <ActionForm action={updateSettingsAction} className="flex flex-col gap-4">
      {() => (
        <>
          {SWITCHES.map((s) => (
            <label key={s.name} className="flex items-start gap-3">
              <input type="checkbox" name={s.name} defaultChecked={settings[s.name]} className="mt-1 size-4 accent-turf" />
              <span>
                <span className="block font-semibold">{t(s.label)}</span>
                <span className="block text-sm text-muted">{t(s.hint)}</span>
              </span>
            </label>
          ))}
          <div>
            <SubmitButton pendingLabel={t("Salvando…")}>{t("Salvar configurações")}</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}
