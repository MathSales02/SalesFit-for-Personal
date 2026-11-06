import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Notice } from "@/components/ui/notice";
import type { Actor } from "@/server/authz/policy";
import { can } from "@/server/authz/policy";
import { getPost, getProfile, listFeed } from "@/server/community/service";
import { AppError } from "@/server/lib/errors";
import { CommentSection } from "./comments";
import { Composer } from "./composer";
import { Feed } from "./feed";
import { Avatar, PostCard } from "./post-card";
import { ProfileActions } from "./profile-actions";

/** Turns NOT_FOUND into a 404 and a disabled community into a friendly notice. */
async function guard<T>(fn: () => Promise<T>): Promise<T | "disabled"> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof AppError && err.code === "NOT_FOUND") notFound();
    if (err instanceof AppError && err.code === "FORBIDDEN") return "disabled";
    throw err;
  }
}

const Disabled = () => <Notice tone="info">A comunidade está desativada pelo seu treinador.</Notice>;

export async function CommunityFeedPage({ actor, basePath, scope }: { actor: Actor; basePath: string; scope: "all" | "following" }) {
  const data = await guard(() => listFeed(actor, { scope, cursor: null }));
  const canModerate = can(actor, "community.moderate");
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-[2.4rem] leading-none font-bold tracking-tight">Comunidade</h1>
        {canModerate && (
          <Link href={`${basePath}/moderacao`} className="text-sm font-semibold text-turf underline-offset-4 hover:underline">
            Moderação e configurações
          </Link>
        )}
      </div>
      {data === "disabled" ? (
        <Disabled />
      ) : (
        <>
          <nav aria-label="Filtrar publicações" className="flex gap-1 border-b border-line">
            {(
              [
                ["all", "Todos"],
                ["following", "Seguindo"],
              ] as const
            ).map(([s, label]) => (
              <Link
                key={s}
                href={s === "all" ? basePath : `${basePath}?ver=seguindo`}
                aria-current={s === scope ? "page" : undefined}
                className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-semibold ${s === scope ? "border-turf text-turf" : "border-transparent text-muted hover:text-ink"}`}
              >
                {label}
              </Link>
            ))}
          </nav>
          {(can(actor, "community.post") && (data.settings.communityEnabled || canModerate)) && <Composer name={actor.displayName} canAnnounce={can(actor, "community.announce")} />}
          <Feed
            key={scope}
            initial={data.posts}
            initialCursor={data.nextCursor}
            scope={scope}
            basePath={basePath}
            canModerate={canModerate}
            empty={scope === "following" ? "Siga pessoas da sua consultoria para ver as publicações delas aqui." : "Ninguém publicou ainda. Que tal começar?"}
          />
        </>
      )}
    </div>
  );
}

export async function CommunityPostPage({ actor, basePath, postId }: { actor: Actor; basePath: string; postId: string }) {
  if (!z.uuid().safeParse(postId).success) notFound();
  const data = await guard(() => getPost(actor, postId));
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <Link href={basePath} className="text-sm font-semibold text-turf underline-offset-4 hover:underline">
        Voltar para a comunidade
      </Link>
      {data === "disabled" ? (
        <Disabled />
      ) : (
        <>
          <PostCard post={data.post} basePath={basePath} canModerate={can(actor, "community.moderate")} linkToPost={false} />
          {data.post.status === "published" && <CommentSection postId={postId} comments={data.comments} basePath={basePath} canModerate={can(actor, "community.moderate")} />}
        </>
      )}
    </div>
  );
}

export async function CommunityProfilePage({ actor, basePath, memberId }: { actor: Actor; basePath: string; memberId: string }) {
  if (!z.uuid().safeParse(memberId).success) notFound();
  const profile = await guard(() => getProfile(actor, memberId));
  if (profile === "disabled") return <Disabled />;
  const feed = profile.blockedByMe ? null : await listFeed(actor, { scope: "all", cursor: null, authorMemberId: memberId });
  const since = profile.joinedAt ? new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "America/Sao_Paulo" }).format(profile.joinedAt) : null;
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <Link href={basePath} className="text-sm font-semibold text-turf underline-offset-4 hover:underline">
        Voltar para a comunidade
      </Link>
      <header className="flex items-center gap-4">
        <Avatar name={profile.name} size={64} />
        <div>
          <h1 className="font-display text-3xl leading-tight font-bold">{profile.name}</h1>
          <p className="text-sm text-muted">
            {profile.role === "trainer" ? "Treinador" : "Aluno"}
            {since ? ` · desde ${since}` : ""}
          </p>
        </div>
      </header>
      <dl className="flex gap-6 text-sm">
        {(
          [
            ["Publicações", profile.posts],
            ["Seguidores", profile.followers],
            ["Seguindo", profile.following],
          ] as const
        ).map(([l, v]) => (
          <div key={l}>
            <dd className="font-display text-2xl font-bold tabular-nums">{v}</dd>
            <dt className="text-muted">{l}</dt>
          </div>
        ))}
      </dl>
      {!profile.isMe && <ProfileActions memberId={profile.memberId} isFollowing={profile.isFollowing} blockedByMe={profile.blockedByMe} />}
      {profile.blockedByMe ? (
        <p className="text-sm text-muted">Você bloqueou esta pessoa. Desbloqueie para ver as publicações dela.</p>
      ) : (
        feed && (
          <Feed initial={feed.posts} initialCursor={feed.nextCursor} scope="all" authorMemberId={memberId} basePath={basePath} canModerate={can(actor, "community.moderate")} empty="Nenhuma publicação ainda." />
        )
      )}
    </div>
  );
}
