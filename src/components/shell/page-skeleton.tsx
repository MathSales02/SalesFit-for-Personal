/**
 * Generic placeholder shown the moment a screen is requested, while its data loads.
 * It lets navigation (tabs and swipes) answer immediately instead of waiting for the server.
 */
export function PageSkeleton() {
  return (
    <div role="status" aria-label="Carregando" className="flex w-full flex-col gap-5">
      <span className="cm-skeleton h-9 w-48 rounded-full" />
      <span className="cm-skeleton h-4 w-full max-w-md rounded-full" />
      <span className="cm-skeleton h-28 rounded-[var(--radius-panel)]" />
      <span className="cm-skeleton h-44 rounded-[var(--radius-panel)]" />
      <span className="cm-skeleton h-44 rounded-[var(--radius-panel)]" />
    </div>
  );
}
