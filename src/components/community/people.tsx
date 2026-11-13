import Link from "next/link";
import { GOAL_LABELS } from "@/lib/validation/community";
import type { PersonView } from "@/server/community/service";
import { Avatar } from "./avatar";
import { FollowButton } from "./follow-button";
import { getT } from "@/i18n/server";

export const roleLabel = (role: string) => (role === "trainer" ? "Treinador" : "Aluno");

/** One line per person: photo, name, what they train for, follow. */
export async function PersonRow({ person, basePath, dense = false }: { person: PersonView; basePath: string; dense?: boolean }) {
  const t = await getT();
  const href = `${basePath}/membro/${person.memberId}`;
  const sub = person.goal ? t(GOAL_LABELS[person.goal]) : person.bio || t(roleLabel(person.role));
  return (
    <li className="flex items-center gap-3">
      <Link href={href} tabIndex={-1} aria-hidden="true">
        <Avatar name={person.name} src={person.avatarUrl} size={dense ? 40 : 48} />
      </Link>
      <div className="min-w-0 flex-1">
        <Link href={href} className="block truncate font-semibold hover:underline">
          {person.name}
        </Link>
        <p className="truncate text-sm text-muted">{sub}</p>
      </div>
      {!person.isMe && <FollowButton memberId={person.memberId} name={person.name} initial={person.isFollowing} size="sm" />}
    </li>
  );
}

/** Card for the discover carousel. */
export async function PersonCard({ person, basePath }: { person: PersonView; basePath: string }) {
  const t = await getT();
  const href = `${basePath}/membro/${person.memberId}`;
  return (
    <li className="flex w-40 shrink-0 snap-start flex-col items-center rounded-[var(--radius-panel)] border border-line bg-paper px-3 py-4 text-center">
      <Link href={href} tabIndex={-1} aria-hidden="true">
        <Avatar name={person.name} src={person.avatarUrl} size={64} />
      </Link>
      <Link href={href} className="mt-2.5 block w-full truncate font-semibold hover:underline">
        {person.name}
      </Link>
      <p className="mb-3 w-full truncate text-xs text-muted">{person.goal ? t(GOAL_LABELS[person.goal]) : t(roleLabel(person.role))}</p>
      <FollowButton memberId={person.memberId} name={person.name} initial={person.isFollowing} size="sm" />
    </li>
  );
}

/** Horizontal row of members who checked in today. */
export async function TrainedTodayRail({ people, basePath }: { people: PersonView[]; basePath: string }) {
  const t = await getT();
  if (people.length === 0) return null;
  return (
    <section aria-labelledby="trained-today-h">
      <h2 id="trained-today-h" className="mb-2 px-1 text-caption text-muted">
        {t("Treinaram hoje ·")} {people.length}
      </h2>
      <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {people.map((p) => (
          <li key={p.memberId} className="snap-start">
            <Link href={`${basePath}/membro/${p.memberId}`} className="flex w-[4.5rem] flex-col items-center gap-1.5 rounded-2xl">
              <Avatar name={p.name} src={p.avatarUrl} size={56} ring />
              <span className="w-full truncate text-center text-xs font-semibold text-ink-soft">{p.isMe ? t("Você") : p.name.split(" ")[0]}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
