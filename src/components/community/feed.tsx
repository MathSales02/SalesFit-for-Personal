"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { loadMoreAction } from "@/app/_community/actions";
import { Logo } from "@/components/ui/logo";
import type { FeedCursor, FeedPost, FeedScope } from "@/server/community/service";
import { PostCard, type Viewer } from "./post-card";
import { PostSkeleton } from "./skeletons";

/**
 * Keyset-paginated feed. The next page loads by itself when the reader gets
 * near the end; the button stays as a fallback (and for keyboard users).
 */
export function Feed({
  initial,
  initialCursor,
  scope,
  basePath,
  viewer,
  authorMemberId,
  empty,
}: {
  initial: FeedPost[];
  initialCursor: FeedCursor;
  scope: FeedScope;
  basePath: string;
  viewer: Viewer;
  authorMemberId?: string;
  empty: React.ReactNode;
}) {
  const [extra, setExtra] = useState<FeedPost[]>([]);
  const [cursor, setCursor] = useState(initialCursor);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const sentinel = useRef<HTMLDivElement>(null);
  const all = [...initial, ...extra.filter((p) => !initial.some((i) => i.id === p.id))];

  const loadMore = useCallback(() => {
    if (!cursor || pending) return;
    startTransition(async () => {
      const res = await loadMoreAction({ scope, cursor, authorMemberId });
      if (!res.ok || !res.data) return setError(res.ok ? "Não foi possível carregar." : res.message);
      setError(null);
      setExtra((e) => [...e, ...res.data!.posts]);
      setCursor(res.data.nextCursor);
    });
  }, [cursor, pending, scope, authorMemberId]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !cursor || error) return;
    const io = new IntersectionObserver((entries) => entries[0]?.isIntersecting && loadMore(), { rootMargin: "600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [cursor, error, loadMore]);

  if (all.length === 0) return <>{empty}</>;
  return (
    <div className="flex flex-col gap-4">
      {all.map((p) => (
        <PostCard key={p.id} post={p} basePath={basePath} viewer={viewer} />
      ))}
      {cursor && (
        <div ref={sentinel} className="flex flex-col gap-4" aria-busy={pending}>
          {pending && <PostSkeleton />}
          {!pending && (
            <button type="button" className="h-11 self-center rounded-full border border-line-strong bg-paper px-6 text-sm font-semibold hover:border-turf/60" onClick={loadMore}>
              Carregar mais
            </button>
          )}
        </div>
      )}
      {!cursor && all.length > 5 && <p className="py-4 text-center text-sm text-muted">Você chegou ao fim. Bom treino!</p>}
      {error && (
        <p role="alert" className="text-center text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** Friendly empty state with an optional call to action. */
export function EmptyState({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-[28px] border border-dashed border-line-strong px-6 py-12 text-center">
      <div className="mb-4 flex justify-center">
        <Logo layout="symbol" height={44} />
      </div>
      <p className="font-display text-xl font-bold">{title}</p>
      <p className="mx-auto mt-1.5 max-w-sm text-[0.95rem] text-muted">{children}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
