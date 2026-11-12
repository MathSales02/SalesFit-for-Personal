import { MeasurementChart, type MeasurementRow } from "@/components/progress/measurement-chart";
import { MeasurementForm } from "@/components/progress/measurement-form";
import { MeasurementTable } from "@/components/progress/measurement-table";
import { PhotoCompare, PhotoGrid, type GridPhoto } from "@/components/progress/photo-grid";
import { Notice } from "@/components/ui/notice";
import { addTrainerMeasurementAction } from "../actions";
import { getT } from "@/i18n/server";

/** Measurements need the student's health consent; photos appear only when the student shares them. */
export async function ProgressSection({
  memberId,
  consent,
  measurements,
  photos,
  today,
}: {
  memberId: string;
  consent: boolean;
  measurements: MeasurementRow[];
  photos: GridPhoto[];
  today: string;
}) {
  const t = await getT();
  return (
    <section aria-labelledby="progress-h" className="mb-12">
      <h2 id="progress-h" className="text-lg font-semibold">
        {t("Progresso")}
      </h2>
      {!consent ? (
        <div className="mt-3 max-w-2xl">
          <Notice tone="info">{t("As medidas corporais aparecem aqui quando o aluno autorizar o compartilhamento de dados de saúde.")}</Notice>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          <p className="text-sm text-muted">{t("Dados sensíveis. Cada acesso fica registrado.")}</p>
          {measurements.length > 0 && (
            <>
              <div className="rounded-[var(--radius-panel)] border border-line bg-paper p-4">
                <MeasurementChart rows={measurements} />
              </div>
              <MeasurementTable rows={measurements} />
            </>
          )}
          <details className="group rounded-[var(--radius-panel)] border border-line bg-paper">
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3.5 font-semibold">
              {t("Registrar avaliação física")}
              <span aria-hidden="true" className="text-xl text-muted transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <div className="border-t border-line p-4">
              <MeasurementForm action={addTrainerMeasurementAction} today={today} memberId={memberId} />
            </div>
          </details>
        </div>
      )}

      <h3 className="mt-8 mb-3 text-sm font-semibold">{t("Fotos compartilhadas")}</h3>
      {photos.length === 0 ? (
        <p className="text-sm text-muted">{t("O aluno ainda não compartilhou fotos de progresso. As fotos são privadas por padrão.")}</p>
      ) : (
        <div className="flex flex-col gap-4">
          <PhotoCompare photos={photos} />
          <PhotoGrid photos={photos} />
        </div>
      )}
    </section>
  );
}
