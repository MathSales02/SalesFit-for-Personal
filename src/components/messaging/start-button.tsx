"use client";

import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";
import { useT } from "@/i18n/client";

export function StartConversationButton({ memberId, action }: { memberId: string; action: (prev: ActionResult, form: FormData) => Promise<ActionResult> }) {
  const t = useT();
  return (
    <ActionForm action={action} className="flex flex-col items-end gap-1">
      {() => (
        <>
          <input type="hidden" name="memberId" value={memberId} />
          <SubmitButton variant="secondary" pendingLabel={t("Abrindo…")}>
            {t("Conversar")}
          </SubmitButton>
        </>
      )}
    </ActionForm>
  );
}
