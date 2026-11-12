import type { Metadata } from "next";
import { Notice } from "@/components/ui/notice";
import { FITNESS_LEVEL_LABEL } from "@/lib/validation/students";
import { requirePageActor } from "@/server/http/next";
import { getOwnHealth } from "@/server/students/students";
import { ConsentForm, DeleteHealthForm, OwnHealthForm } from "./forms";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Saúde e privacidade") };
}

export default async function StudentHealthPage() {
  const t = await getT();
  const actor = await requirePageActor("training.read_own");
  const { consent, profile, health } = await getOwnHealth(actor);
  const trainerWorkspace = actor.membership?.workspaceName;

  return (
    <>
      <h1 className="font-display text-[2.4rem] leading-none font-bold tracking-tight">{t("Saúde e privacidade")}</h1>

      {profile && (profile.goal || profile.fitnessLevel || profile.weeklyFrequency) && (
        <section aria-labelledby="plan-h" className="mt-8 rounded-[var(--radius-panel)] border border-line bg-paper p-5">
          <h2 id="plan-h" className="text-sm font-semibold text-muted">
            {t("Definido pelo seu treinador")}
          </h2>
          {profile.goal && <p className="mt-2 font-semibold">{profile.goal}</p>}
          <p className="mt-1 text-sm text-muted">
            {[profile.fitnessLevel ? t(FITNESS_LEVEL_LABEL[profile.fitnessLevel]) : null, profile.weeklyFrequency ? `${profile.weeklyFrequency}x por semana` : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </section>
      )}

      <section aria-labelledby="consent-h" className="mt-10">
        <h2 id="consent-h" className="text-lg font-semibold">
          {t("Compartilhar com o treinador")}
        </h2>
        <p className="mt-2 mb-4 max-w-xl text-sm leading-relaxed text-ink-soft">
          {t("Lesões, restrições, observações médicas e medidas corporais são dados sensíveis. Com sua autorização,")} {trainerWorkspace} {t("pode vê-los para montar treinos seguros. Eles nunca aparecem no seu perfil público nem na comunidade, e você pode retirar a autorização quando quiser.")}
        </p>
        <div className="mb-4 max-w-xl">
          <Notice tone={consent ? "success" : "info"}>
            {consent ? t("Seu treinador pode ver e atualizar estes dados.") : t("Hoje só você vê estes dados.")}
          </Notice>
        </div>
        <ConsentForm granted={consent} />
      </section>

      <section aria-labelledby="data-h" className="mt-10 max-w-xl border-t border-line pt-8">
        <h2 id="data-h" className="mb-5 text-lg font-semibold">
          {t("Suas informações de saúde")}
        </h2>
        <OwnHealthForm health={health} />
      </section>

      {health && (
        <section aria-labelledby="delete-h" className="mt-10 max-w-xl border-t border-line pt-8">
          <h2 id="delete-h" className="text-lg font-semibold">
            {t("Apagar dados de saúde")}
          </h2>
          <p className="mt-1 mb-4 text-sm text-muted">{t("Remove definitivamente as informações acima. Não dá para desfazer.")}</p>
          <DeleteHealthForm />
        </section>
      )}
    </>
  );
}
