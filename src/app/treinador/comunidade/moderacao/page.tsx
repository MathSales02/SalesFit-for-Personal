import type { Metadata } from "next";
import Link from "next/link";
import { PostCard } from "@/components/community/post-card";
import { PageHeading } from "@/components/ui/page-heading";
import { REPORT_REASONS } from "@/lib/validation/community";
import { getModerationQueue, getSettings } from "@/server/community/service";
import { requirePageActor } from "@/server/http/next";
import { ModeratePostButtons, ResolveReportButtons, SettingsForm } from "./forms";
import { currentLocale, getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Moderação") };
}

const REASON = Object.fromEntries(REPORT_REASONS) as Record<string, string>;
const TARGET = { post: "Publicação", comment: "Comentário", member: "Perfil", message: "Mensagem" } as Record<string, string>;
const REVIEW_REASON: Record<string, string> = {
  image_flagged: "A foto foi sinalizada pelo filtro automático de conteúdo impróprio.",
  approval_required: "Aprovação de posts ligada nas configurações.",
};
const fmt = { format: (d: Date | number) => new Intl.DateTimeFormat(currentLocale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(d) };

export default async function ModerationPage() {
  const t = await getT();
  const actor = await requirePageActor("community.moderate", { feature: "community" });
  const [queue, settings] = await Promise.all([getModerationQueue(actor), getSettings(actor)]);
  const base = "/treinador/comunidade";

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={base} className="mb-4 inline-block text-sm font-semibold text-turf underline-offset-4 hover:underline">
        {t("Voltar para a comunidade")}
      </Link>
      <PageHeading title={t("Moderação")} description={t("Revise posts retidos e denúncias. Ações de moderação ficam registradas.")} />

      <section aria-labelledby="pending-h" className="mb-12">
        <h2 id="pending-h" className="mb-4 text-lg font-semibold">
          {t("Aguardando revisão")} <span className="text-sm font-normal text-muted">({queue.pending.length})</span>
        </h2>
        {queue.pending.length === 0 ? (
          <p className="text-sm text-muted">{t("Nada para revisar.")}</p>
        ) : (
          <ul className="flex flex-col gap-6">
            {queue.pending.map((p) => (
              <li key={p.id} className="flex flex-col gap-3">
                {p.reviewReason && <p className="text-sm font-semibold text-ink-soft">{t(REVIEW_REASON[p.reviewReason] ?? p.reviewReason)}</p>}
                <PostCard post={p} basePath={base} viewer={{ name: actor.displayName, avatarUrl: null, canModerate: true, canComment: false }} />
                <ModeratePostButtons postId={p.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="reports-h" className="mb-12">
        <h2 id="reports-h" className="mb-4 text-lg font-semibold">
          {t("Denúncias abertas")} <span className="text-sm font-normal text-muted">({queue.openCount})</span>
        </h2>
        {queue.reports.length === 0 ? (
          <p className="text-sm text-muted">{t("Nenhuma denúncia aberta.")}</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {queue.reports.map((r) => {
              const href =
                r.targetType === "post"
                  ? `${base}/post/${r.targetId}`
                  : r.targetType === "comment" && r.preview?.postId
                    ? `${base}/post/${r.preview.postId}`
                    : r.targetType === "member"
                      ? `${base}/membro/${r.targetId}`
                      : null;
              const removed = r.preview?.status === "removed";
              return (
                <li key={r.id} className="rounded-[var(--radius-panel)] border border-line bg-paper p-4">
                  <p className="text-sm">
                    <span className="font-semibold">{t(TARGET[r.targetType])}</span> · {t(REASON[r.reason])} {t("· denunciado por")} {r.reporterName} {t("em")} {fmt.format(r.createdAt)}
                  </p>
                  {r.details && <p className="mt-1 text-sm text-ink-soft">“{r.details}”</p>}
                  <blockquote className="mt-3 rounded-[var(--radius-control)] bg-chalk px-3 py-2 text-sm break-words whitespace-pre-line">
                    {r.preview?.text ?? (r.targetType === "post" ? t("(publicação só com foto)") : t("(conteúdo indisponível)"))}
                    {removed && <span className="mt-1 block text-xs font-semibold text-muted">{t("Já removido")}</span>}
                  </blockquote>
                  {href && (
                    <Link href={href} className="mt-2 inline-block text-sm font-semibold text-turf underline-offset-4 hover:underline">
                      {t("Ver no contexto")}
                    </Link>
                  )}
                  <div className="mt-3">
                    <ResolveReportButtons reportId={r.id} canRemove={!removed && (r.targetType === "post" || r.targetType === "comment")} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="settings-h" className="rounded-[var(--radius-panel)] border border-line bg-paper p-5">
        <h2 id="settings-h" className="mb-4 text-lg font-semibold">
          {t("Configurações da comunidade")}
        </h2>
        <SettingsForm settings={settings} />
        <p className="mt-4 text-sm text-muted">
          {t("Fotos publicadas passam por um filtro automático: conteúdo explícito é recusado na hora e casos duvidosos aparecem aqui para você decidir. O filtro ajuda, mas não é infalível. Por isso existem as denúncias.")}
        </p>
      </section>
    </div>
  );
}
