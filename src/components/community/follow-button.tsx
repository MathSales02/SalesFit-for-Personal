"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { followAction } from "@/app/_community/actions";
import { CheckIcon, PlusIcon } from "./icons";
import { useT } from "@/i18n/client";

/** Follows or unfollows right away and rolls back if the server refuses. */
export function FollowButton({
  memberId,
  name,
  initial,
  size = "md",
  refresh = false,
  onChange,
}: {
  memberId: string;
  name: string;
  initial: boolean;
  size?: "sm" | "md";
  /** Reload server data after the change (profile counters). */
  refresh?: boolean;
  onChange?: (following: boolean) => void;
}) {
  const t = useT();
  const router = useRouter();
  const [following, setFollowing] = useState(initial);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !following;
    setFollowing(next);
    onChange?.(next);
    startTransition(async () => {
      const res = await followAction({ memberId, follow: next });
      if (!res.ok) {
        setFollowing(!next);
        onChange?.(!next);
      } else if (refresh) router.refresh();
    });
  }

  const dims = size === "sm" ? "h-8 px-3 text-[0.8rem]" : "h-10 px-4 text-sm";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={following}
      aria-busy={pending}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full font-semibold transition-all duration-150 active:scale-95 ${dims} ${
        following ? "border border-line-strong bg-paper text-ink-soft hover:border-turf/60" : "bg-ink text-paper hover:opacity-90"
      }`}
    >
      {following ? <CheckIcon className="size-3.5" /> : <PlusIcon className="size-3.5" />}
      {following ? t("Seguindo") : t("Seguir")}
      <span className="sr-only"> {name}</span>
    </button>
  );
}
