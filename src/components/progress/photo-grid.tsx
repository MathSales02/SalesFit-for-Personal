import { POSE_LABEL } from "@/lib/validation/progress";

export type GridPhoto = { id: string; url: string | null; takenOn: string; pose: string; sharedWithTrainer: boolean };

const fmtDate = (iso: string) => new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));

/** Photo grid; controls (share, delete) are passed in so the trainer view can be read-only. */
export function PhotoGrid({ photos, controls }: { photos: GridPhoto[]; controls?: (p: GridPhoto) => React.ReactNode }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {photos.map((p) => (
        <li key={p.id} className="overflow-hidden rounded-[var(--radius-panel)] border border-line bg-paper">
          {p.url ? (
            // Short-lived signed URL from private storage; next/image would proxy and cache it, which we do not want for private photos.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.url} alt={`Foto de progresso, ${POSE_LABEL[p.pose]?.toLowerCase()}, ${fmtDate(p.takenOn)}`} loading="lazy" className="aspect-[3/4] w-full bg-chalk object-cover" />
          ) : (
            <div className="grid aspect-[3/4] place-items-center bg-chalk text-sm text-muted">Indisponível</div>
          )}
          <div className="px-3 py-2">
            <p className="text-sm font-semibold">{fmtDate(p.takenOn)}</p>
            <p className="text-xs text-muted">
              {POSE_LABEL[p.pose]}
              {p.sharedWithTrainer ? " · compartilhada" : " · privada"}
            </p>
          </div>
          {controls && <div className="flex flex-wrap items-center justify-between gap-1 border-t border-line px-1 py-1">{controls(p)}</div>}
        </li>
      ))}
    </ul>
  );
}

/** First and latest photo of the same angle, side by side. */
export function PhotoCompare({ photos }: { photos: GridPhoto[] }) {
  const byPose = new Map<string, GridPhoto[]>();
  for (const p of photos) byPose.set(p.pose, [...(byPose.get(p.pose) ?? []), p]);
  const pair = [...byPose.values()].find((list) => list.length >= 2);
  if (!pair) return null;
  const sorted = [...pair].sort((a, b) => a.takenOn.localeCompare(b.takenOn));
  const [first, last] = [sorted[0]!, sorted[sorted.length - 1]!];
  return (
    <figure className="rounded-[var(--radius-panel)] border border-line bg-paper p-3">
      <figcaption className="mb-2 text-sm font-semibold">Antes e depois · {POSE_LABEL[first.pose]}</figcaption>
      <div className="grid grid-cols-2 gap-2">
        {[first, last].map((p) => (
          <div key={p.id}>
            {p.url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.url} alt={`${POSE_LABEL[p.pose]}, ${fmtDate(p.takenOn)}`} className="aspect-[3/4] w-full rounded-[var(--radius-control)] bg-chalk object-cover" />
            )}
            <p className="mt-1 text-center text-xs text-muted">{fmtDate(p.takenOn)}</p>
          </div>
        ))}
      </div>
    </figure>
  );
}
