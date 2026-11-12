import { FeatureNote } from "@/components/shell/feature-locked";
import { actorHasFeature } from "@/server/authz/policy";
import type { Metadata } from "next";
import Link from "next/link";
import { MeasurementChart } from "@/components/progress/measurement-chart";
import { MeasurementForm } from "@/components/progress/measurement-form";
import { MeasurementTable } from "@/components/progress/measurement-table";
import { PhotoCompare, PhotoGrid } from "@/components/progress/photo-grid";
import { todayInBrazil } from "@/lib/validation/progress";
import { requirePageActor } from "@/server/http/next";
import { getOwnProgress } from "@/server/progress/service";
import { addMeasurementAction } from "./actions";
import { DeleteMeasurementButton, DeletePhotoButton, PhotoUploader, ShareToggle } from "./forms";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Progresso") };
}

export default async function ProgressPage() {
  const t = await getT();
  const actor = await requirePageActor("progress.manage_own");
  const { measurements, photos, consent } = await getOwnProgress(actor);
  const today = todayInBrazil();
  const gridPhotos = photos.map((p) => ({ id: p.id, url: p.url, takenOn: p.takenOn, pose: p.pose, sharedWithTrainer: p.sharedWithTrainer }));

  return (
    <>
      <h1 className="font-display text-[2.4rem] leading-none font-bold tracking-tight">{t("Progresso")}</h1>
      <p className="mt-2 text-sm text-muted">
        {t("Medidas e fotos são privadas.")}{" "}
        {consent ? t("Seu treinador vê suas medidas porque você autorizou em ") : t("Seu treinador só vê suas medidas se você autorizar em ")}
        <Link href="/aluno/saude" className="font-semibold text-turf underline-offset-4 hover:underline">
          {t("Saúde")}
        </Link>
        {t(". Fotos, só as que você compartilhar uma a uma.")}
      </p>

      <section aria-labelledby="m-h" className="mt-8">
        <h2 id="m-h" className="text-lg font-semibold">
          {t("Medidas")}
        </h2>
        <div className="mt-4 rounded-[var(--radius-panel)] border border-line bg-paper p-4">
          <MeasurementChart rows={measurements} />
        </div>
        <details className="group mt-4 rounded-[var(--radius-panel)] border border-line bg-paper">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3.5 font-semibold">
            {t("Registrar medidas")}
            <span aria-hidden="true" className="text-xl text-muted transition-transform group-open:rotate-45">
              +
            </span>
          </summary>
          <div className="border-t border-line p-4">
            <MeasurementForm action={addMeasurementAction} today={today} />
          </div>
        </details>
        {measurements.length > 0 && (
          <div className="mt-4">
            <MeasurementTable rows={measurements} onDelete={(id) => <DeleteMeasurementButton measurementId={id} />} />
          </div>
        )}
      </section>

      <section aria-labelledby="p-h" className="mt-12">
        <h2 id="p-h" className="mb-4 text-lg font-semibold">
          {t("Fotos")}
        </h2>
        {/* New photos need the plan to include them; the ones already here stay, and can be removed. */}
        {actorHasFeature(actor, "evolution") ? <PhotoUploader today={today} /> : <FeatureNote feature="evolution" role="student" />}
        {photos.length > 0 && (
          <div className="mt-6 flex flex-col gap-6">
            <PhotoCompare photos={gridPhotos} />
            <PhotoGrid
              photos={gridPhotos}
              controls={(p) => (
                <>
                  <ShareToggle photoId={p.id} shared={p.sharedWithTrainer} />
                  <DeletePhotoButton photoId={p.id} />
                </>
              )}
            />
          </div>
        )}
      </section>
    </>
  );
}
