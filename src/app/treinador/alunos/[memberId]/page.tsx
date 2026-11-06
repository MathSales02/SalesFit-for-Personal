import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Notice } from "@/components/ui/notice";
import { PageHeading } from "@/components/ui/page-heading";
import { MEMBER_STATUS_LABEL } from "@/lib/validation/students";
import { requestMeta, requirePageActor } from "@/server/http/next";
import { AppError } from "@/server/lib/errors";
import { getStudentForTrainer } from "@/server/students/students";
import { getStudentTraining } from "@/server/workouts/service";
import { TrainingSection } from "./training-section";
import { ProgressSection } from "./progress-section";
import { getStudentProgress } from "@/server/progress/service";
import { todayInBrazil } from "@/lib/validation/progress";
import { HealthForm, ProfileForm, StatusActions } from "../forms";

export const metadata: Metadata = { title: "Ficha do aluno" };

export default async function StudentPage({ params }: { params: Promise<{ memberId: string }> }) {
  const actor = await requirePageActor("students.read");
  const { memberId } = await params;
  if (!z.uuid().safeParse(memberId).success) notFound();

  let s;
  let training;
  let progress;
  try {
    s = await getStudentForTrainer(actor, memberId, await requestMeta());
    training = await getStudentTraining(actor, memberId);
    progress = await getStudentProgress(actor, memberId, await requestMeta());
  } catch (err) {
    if (err instanceof AppError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  return (
    <>
      <Link href="/treinador/alunos" className="mb-4 inline-block text-sm font-semibold text-turf underline-offset-4 hover:underline">
        Voltar para alunos
      </Link>
      <PageHeading
        title={s.displayName}
        description={
          <>
            {s.email} · <span className="font-semibold text-ink">{MEMBER_STATUS_LABEL[s.status]}</span>
          </>
        }
      />

      <TrainingSection data={training} weeklyTarget={s.profile.weeklyFrequency} />

      <ProgressSection
        memberId={s.memberId}
        consent={progress.consent}
        measurements={progress.measurements}
        photos={progress.photos.map((ph) => ({ id: ph.id, url: ph.url, takenOn: ph.takenOn, pose: ph.pose, sharedWithTrainer: ph.sharedWithTrainer }))}
        today={todayInBrazil()}
      />

      <div className="grid gap-12 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section aria-labelledby="profile-h">
          <h2 id="profile-h" className="mb-5 text-lg font-semibold">
            Ficha de treino
          </h2>
          <ProfileForm memberId={s.memberId} profile={s.profile} />
        </section>

        <div className="flex flex-col gap-12">
          <section aria-labelledby="health-h">
            <h2 id="health-h" className="text-lg font-semibold">
              Saúde
            </h2>
            {s.healthConsent ? (
              <>
                <p className="mt-1 mb-5 text-sm text-muted">Dados sensíveis. Cada acesso fica registrado.</p>
                <HealthForm memberId={s.memberId} health={s.health} />
              </>
            ) : (
              <div className="mt-4">
                <Notice tone="info">
                  O aluno ainda não autorizou o compartilhamento de dados de saúde. Ele pode autorizar a qualquer momento na área dele, em Saúde.
                </Notice>
              </div>
            )}
          </section>

          <section aria-labelledby="status-h" className="border-t border-line pt-8">
            <h2 id="status-h" className="text-lg font-semibold">
              Acesso
            </h2>
            <p className="mt-1 mb-4 text-sm text-muted">
              Suspender bloqueia o acesso na hora e mantém a vaga. Arquivar libera a vaga e preserva o histórico.
            </p>
            <StatusActions memberId={s.memberId} status={s.status} />
          </section>
        </div>
      </div>
    </>
  );
}
