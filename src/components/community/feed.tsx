"use client";

import { useState, useTransition } from "react";
import { loadMoreAction } from "@/app/_community/actions";
import type { FeedCursor, FeedPost } from "@/server/community/service";
import { PostCard } from "./post-card";

/** Keyset-paginated feed: "Carregar mais" fetches the next page after the last post shown. */
export function Feed({
  initial,
  initialCursor,
  scope,
  basePath,
  canModerate,
  authorMemberId,
  empty,
}: {
  initial: FeedPost[];
  initialCursor: FeedCursor;
  scope: "all" | "following";
  basePath: string;
  canModerate: boolean;
  authorMemberId?: string;
  empty: string;
}) {
  const [extra, setExtra] = useState<FeedPost[]>([]);
  const [cursor, setCursor] = useState(initialCursor);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const all = [...initial, ...extra.filter((p) => !initial.some((i) => i.id === p.id))];

  if (all.length === 0) return <p className="py-10 text-center text-muted">{empty}</p>;
  return (
    <div className="flex flex-col gap-4">
      {all.map((p) => (
        <PostCard key={p.id} post={p} basePath={basePath} canModerate={canModerate} />
      ))}
      {cursor && (
        <button
          type="button"
          disabled={pending}
          className="h-11 self-center rounded-[var(--radius-control)] border border-line-strong bg-paper px-5 font-semibold"
          onClick={() =>
            startTransition(async () => {
              const res = await loadMoreAction({ scope, cursor, authorMemberId });
              if (!res.ok || !res.data) return setError(res.ok ? "Não foi possível carregar." : res.message);
              setExtra((e) => [...e, ...res.data!.posts]);
              setCursor(res.data.nextCursor);
            })
          }
        >
          {pending ? "Carregando…" : "Carregar mais"}
        </button>
      )}
      {error && <p className="text-center text-sm text-danger">{error}</p>}
    </div>
  );
}
