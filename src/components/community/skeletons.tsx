"use client";

import { useT } from "@/i18n/client";
/** Placeholder with the shape of a post while the feed loads. */
export function PostSkeleton({ media = false }: { media?: boolean }) {
  return (
    <div aria-hidden="true" className="rounded-[28px] border border-line bg-paper p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <span className="cm-skeleton size-11 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <span className="cm-skeleton h-3.5 w-36 rounded-full" />
          <span className="cm-skeleton h-3 w-20 rounded-full" />
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-2">
        <span className="cm-skeleton h-3.5 w-full rounded-full" />
        <span className="cm-skeleton h-3.5 w-4/5 rounded-full" />
      </div>
      {media && <span className="cm-skeleton mt-4 block h-56 rounded-[20px]" />}
      <div className="mt-4 flex gap-3">
        <span className="cm-skeleton h-8 w-16 rounded-full" />
        <span className="cm-skeleton h-8 w-16 rounded-full" />
      </div>
    </div>
  );
}

export function FeedSkeleton() {
  const t = useT();
  return (
    <div role="status" aria-label={t("Carregando a comunidade")} className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <span className="cm-skeleton h-10 w-56 rounded-full" />
      <span className="cm-skeleton h-11 w-full max-w-sm rounded-full" />
      <span className="cm-skeleton h-[4.5rem] rounded-[28px]" />
      <PostSkeleton media />
      <PostSkeleton />
    </div>
  );
}

export function PanelSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-hidden="true" className="rounded-[var(--radius-panel)] border border-line bg-paper p-5">
      <span className="cm-skeleton block h-4 w-32 rounded-full" />
      <div className="mt-4 flex flex-col gap-3.5">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="cm-skeleton size-10 rounded-full" />
            <span className="cm-skeleton h-3.5 flex-1 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
