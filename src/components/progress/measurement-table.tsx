import { MEASUREMENT_FIELDS } from "@/lib/validation/progress";
import type { MeasurementRow } from "./measurement-chart";
import { getT } from "@/i18n/server";

const fmtDate = (iso: string) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
const fmtNum = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

/** All measurements as a table: the accessible, exact counterpart of the chart. */
export async function MeasurementTable({ rows, onDelete }: { rows: MeasurementRow[]; onDelete?: (id: string) => React.ReactNode }) {
  const t = await getT();
  const cols = MEASUREMENT_FIELDS.filter(([k]) => rows.some((r) => r[k] != null));
  return (
    <div className="overflow-x-auto rounded-[var(--radius-panel)] border border-line bg-paper">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{t("Histórico de medidas")}</caption>
        <thead className="border-b border-line text-muted">
          <tr>
            <th scope="col" className="px-3 py-2.5 font-semibold">
              {t("Data")}
            </th>
            {cols.map(([k, label, unit]) => (
              <th key={k} scope="col" className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">
                {label} ({unit})
              </th>
            ))}
            {onDelete && (
              <th scope="col" className="px-3 py-2.5">
                <span className="sr-only">{t("Ações")}</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="px-3 py-2.5 whitespace-nowrap">{fmtDate(r.measuredOn)}</td>
              {cols.map(([k]) => (
                <td key={k} className="px-3 py-2.5 text-right tabular-nums">
                  {r[k] == null ? "—" : fmtNum(r[k])}
                </td>
              ))}
              {onDelete && <td className="px-3 py-1 text-right">{onDelete(r.id)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
