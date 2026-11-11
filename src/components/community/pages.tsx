import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { Notice } from "@/components/ui/notice";
import { GOAL_LABELS } from "@/lib/validation/community";
import type { Actor } from "@/server/authz/policy";
import { can } from "@/server/authz/policy";
import {
  getDiscover,
  getMyCard,
  getPost,
  getProfile,
  listConnections,
  listFeed,
  listShareableWorkouts,
  listTrainedToday,
  searchPeople,
  type FeedScope,
} from "@/server/community/service";
import { listCompetitions } from "@/server/gamification/service";
import { AppError } from "@/server/lib/errors";
import { Avatar } from "./avatar";
import { Composer } from "./composer";
import { EmptyState, Feed } from "./feed";
import { FlameIcon, SearchIcon } from "./icons";
import { PersonCard, PersonRow, roleLabel, TrainedTodayRail } from "./people";
import { PostCard, type Viewer } from "./post-card";
import { EditProfile, ProfileActions } from "./profile-actions";
import { PanelSkeleton } from "./skeletons";

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

const SCOPES: { scope: FeedScope; label: string; param: string | null }[] = [
  { scope: "all", label: "Para você", param: null },
  { scope: "following", label: "Seguindo", param: "seguindo" },
  { scope: "popular", label: "Em alta", param: "alta" },
  { scope: "saved", label: "Salvos", param: "salvos" },
];
export const scopeFromParam = (ver: string | undefined): FeedScope => SCOPES.find((s) => s.param === ver)?.scope ?? "all";

const panel = "rounded-[var(--radius-panel)] border border-line bg-paper p-5";
const panelTitle = "text-caption text-muted";
const backLink = "inline-flex h-10 items-center gap-1.5 self-start rounded-full pr-3 text-sm font-semibold text-turf hover:underline";

/** Title and the three places of the community: feed, discover, own profile. */
function CommunityHeader({ basePath, active, myMemberId, canModerate }: { basePath: string; active: "feed" | "discover" | "profile" | null; myMemberId: string; canModerate: boolean }) {
  const tabs = [
    { key: "feed", label: "Feed", href: basePath },
    { key: "discover", label: "Descobrir", href: `${basePath}/descobrir` },
    { key: "profile", label: "Meu perfil", href: `${basePath}/membro/${myMemberId}` },
  ] as const;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-[2.2rem] leading-none font-extrabold tracking-tight sm:text-h1">Comunidade</h1>
        {canModerate && (
          <Link href={`${basePath}/moderacao`} className="text-sm font-semibold text-turf underline-offset-4 hover:underline">
            Moderação
          </Link>
        )}
      </div>
      <nav aria-label="Áreas da comunidade" className="flex gap-1 self-start rounded-full bg-surface-subtle p-1">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            aria-current={active === t.key ? "page" : undefined}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${active === t.key ? "bg-paper text-ink shadow-[var(--shadow-raised)]" : "text-ink-soft hover:text-ink"}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

const viewerOf = (actor: Actor, me: { name: string; avatarUrl: string | null }, communityEnabled: boolean): Viewer => {
  const canModerate = can(actor, "community.moderate");
  return { name: me.name, avatarUrl: me.avatarUrl, canModerate, canComment: can(actor, "community.post") && (communityEnabled || canModerate) };
};

const EMPTY: Record<FeedScope, { title: string; text: string }> = {
  all: { title: "O feed começa com você", text: "Ninguém publicou ainda. Conte como foi o treino de hoje e puxe a conversa." },
  following: { title: "Siga quem treina com você", text: "As publicações das pessoas que você segue aparecem aqui. Encontre a turma em Descobrir." },
  popular: { title: "Nada em alta por enquanto", text: "As publicações mais curtidas e comentadas dos últimos 30 dias aparecem aqui." },
  saved: { title: "Nenhuma publicação salva", text: "Toque no marcador de uma publicação para guardar dicas e treinos e voltar a eles depois." },
};

export async function CommunityFeedPage({ actor, basePath, scope }: { actor: Actor; basePath: string; scope: FeedScope }) {
  const data = await guard(() => Promise.all([listFeed(actor, { scope, cursor: null }), getMyCard(actor), listShareableWorkouts(actor)]));
  if (data === "disabled") {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-5">
        <h1 className="font-display text-h1 font-extrabold">Comunidade</h1>
        <Disabled />
      </div>
    );
  }
  const [feed, me, workouts] = data;
  const viewer = viewerOf(actor, me, feed.settings.communityEnabled);
  const empty = EMPTY[scope];
  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_19rem]">
      <div className="mx-auto flex w-full max-w-2xl min-w-0 flex-col gap-5 pb-16 lg:pb-0">
        <CommunityHeader basePath={basePath} active="feed" myMemberId={me.memberId} canModerate={viewer.canModerate} />
        <Suspense fallback={null}>
          <TrainedToday actor={actor} basePath={basePath} />
        </Suspense>
        {viewer.canComment && <Composer me={me} canAnnounce={can(actor, "community.announce")} workouts={workouts} />}
        <nav aria-label="Filtrar publicações" className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {SCOPES.map((s) => (
            <Link
              key={s.scope}
              href={s.param ? `${basePath}?ver=${s.param}` : basePath}
              aria-current={s.scope === scope ? "page" : undefined}
              className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                s.scope === scope ? "border-ink bg-ink text-paper" : "border-line-strong bg-paper text-ink-soft hover:border-ink-soft hover:text-ink"
              }`}
            >
              {s.label}
            </Link>
          ))}
        </nav>
        <Feed
          key={scope}
          initial={feed.posts}
          initialCursor={feed.nextCursor}
          scope={scope}
          basePath={basePath}
          viewer={viewer}
          empty={
            <EmptyState
              title={empty.title}
              action={
                scope === "following" ? (
                  <Link href={`${basePath}/descobrir`} className="inline-flex h-11 items-center rounded-full bg-signal px-6 text-sm font-semibold text-on-accent">
                    Descobrir pessoas
                  </Link>
                ) : undefined
              }
            >
              {empty.text}
            </EmptyState>
          }
        />
      </div>
      <aside aria-label="Na sua comunidade" className="hidden lg:block">
        <div className="sticky top-6 flex flex-col gap-5">
          <Suspense
            fallback={
              <>
                <PanelSkeleton />
                <PanelSkeleton rows={2} />
              </>
            }
          >
            <Sidebar actor={actor} basePath={basePath} />
          </Suspense>
        </div>
      </aside>
    </div>
  );
}

async function TrainedToday({ actor, basePath }: { actor: Actor; basePath: string }) {
  const people = await listTrainedToday(actor).catch(() => []);
  return <TrainedTodayRail people={people} basePath={basePath} />;
}

const areaOf = (basePath: string) => basePath.replace(/\/comunidade$/, "");
const dayMonth = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", timeZone: "UTC" });
const fmtDay = (iso: string) => dayMonth.format(new Date(`${iso}T12:00:00Z`));

async function activeChallenges(actor: Actor) {
  const all = await listCompetitions(actor).catch(() => []);
  return all.filter((c) => c.status === "active" || c.status === "upcoming").slice(0, 3);
}

function Challenges({ items, basePath }: { items: Awaited<ReturnType<typeof activeChallenges>>; basePath: string }) {
  if (items.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((c) => (
        <li key={c.id}>
          <Link href={`${areaOf(basePath)}/ranking/competicao/${c.id}`} className="group flex items-center gap-3 rounded-2xl bg-night p-3.5 text-white">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-signal text-on-accent">
              <FlameIcon />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold group-hover:underline">{c.title}</span>
              <span className="block text-xs text-white/75">
                {c.status === "active" ? `Até ${fmtDay(c.endsOn)}` : `Começa em ${fmtDay(c.startsOn)}`}
                {c.joined ? " · você está dentro" : ""}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Desktop column beside the feed: people to follow, what is hot, running challenges. */
async function Sidebar({ actor, basePath }: { actor: Actor; basePath: string }) {
  const [discover, popular, challenges] = await Promise.all([
    getDiscover(actor).catch(() => null),
    listFeed(actor, { scope: "popular", cursor: null, limit: 3 }).catch(() => null),
    activeChallenges(actor),
  ]);
  return (
    <>
      {discover && discover.suggestions.length > 0 && (
        <section aria-labelledby="side-suggest-h" className={panel}>
          <div className="mb-4 flex items-baseline justify-between">
            <h2 id="side-suggest-h" className={panelTitle}>
              Sugestões para seguir
            </h2>
            <Link href={`${basePath}/descobrir`} className="text-xs font-semibold text-turf hover:underline">
              Ver todas
            </Link>
          </div>
          <ul className="flex flex-col gap-3.5">
            {discover.suggestions.slice(0, 4).map((p) => (
              <PersonRow key={p.memberId} person={p} basePath={basePath} dense />
            ))}
          </ul>
        </section>
      )}
      {popular && popular.posts.length > 0 && (
        <section aria-labelledby="side-hot-h" className={panel}>
          <h2 id="side-hot-h" className={`${panelTitle} mb-3`}>
            Em alta
          </h2>
          <ol className="flex flex-col gap-3.5">
            {popular.posts.map((p) => (
              <li key={p.id}>
                <Link href={`${basePath}/post/${p.id}`} className="group block">
                  <span className="line-clamp-2 text-[0.92rem] leading-snug font-semibold group-hover:underline">
                    {p.body ?? (p.workout ? `${p.workout.dayName} concluído` : "Foto")}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {p.author.name} · {p.likeCount} {p.likeCount === 1 ? "curtida" : "curtidas"} · {p.commentCount} {p.commentCount === 1 ? "comentário" : "comentários"}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}
      {challenges.length > 0 && (
        <section aria-labelledby="side-ch-h">
          <h2 id="side-ch-h" className={`${panelTitle} mb-2.5 px-1`}>
            Desafios
          </h2>
          <Challenges items={challenges} basePath={basePath} />
        </section>
      )}
    </>
  );
}

function Carousel({ children }: { children: React.ReactNode }) {
  return <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{children}</ul>;
}

export async function CommunityDiscoverPage({ actor, basePath, query }: { actor: Actor; basePath: string; query: string }) {
  const q = query.trim().slice(0, 60);
  const data = await guard(() =>
    Promise.all([getDiscover(actor), getMyCard(actor), listFeed(actor, { scope: "popular", cursor: null, limit: 6 }), q.length >= 2 ? searchPeople(actor, q) : null, listTrainedToday(actor), activeChallenges(actor)]),
  );
  if (data === "disabled") return <Disabled />;
  const [discover, me, popular, results, trained, challenges] = data;
  const viewer = viewerOf(actor, me, popular.settings.communityEnabled);
  const sectionTitle = "font-display text-xl font-bold";
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <CommunityHeader basePath={basePath} active="discover" myMemberId={me.memberId} canModerate={viewer.canModerate} />

      <form role="search" action={`${basePath}/descobrir`} className="flex h-12 items-center gap-2 rounded-full border border-line-strong bg-paper pr-1.5 pl-4 focus-within:border-turf">
        <SearchIcon className="size-5 shrink-0 text-ink-soft" />
        <input type="search" name="q" defaultValue={q} minLength={2} maxLength={60} placeholder="Buscar pessoas pelo nome" aria-label="Buscar pessoas pelo nome" className="h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted" />
        <button type="submit" className="h-9 rounded-full bg-ink px-4 text-sm font-semibold text-paper">
          Buscar
        </button>
      </form>

      {results && (
        <section aria-labelledby="results-h">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 id="results-h" className={sectionTitle}>
              Resultados para “{q}”
            </h2>
            <Link href={`${basePath}/descobrir`} className="text-sm font-semibold text-turf hover:underline">
              Limpar
            </Link>
          </div>
          {results.length === 0 ? (
            <p className="text-muted">Ninguém com esse nome na sua comunidade.</p>
          ) : (
            <ul className={`${panel} flex flex-col gap-4`}>
              {results.map((p) => (
                <PersonRow key={p.memberId} person={p} basePath={basePath} />
              ))}
            </ul>
          )}
        </section>
      )}

      {!discover.me.hasProfile && (
        <section className="flex flex-wrap items-center gap-4 rounded-[var(--radius-panel)] bg-signal-tint p-5">
          <div className="min-w-0 flex-1 basis-56">
            <p className="font-display text-lg font-bold">Complete seu perfil</p>
            <p className="mt-0.5 text-sm text-ink-soft">Com foto, bio e objetivo, a turma te encontra e você descobre quem treina pelo mesmo motivo.</p>
          </div>
          <EditProfile name={me.name} avatarUrl={me.avatarUrl} bio={null} goal={null} cta />
        </section>
      )}

      <TrainedTodayRail people={trained} basePath={basePath} />

      {discover.suggestions.length > 0 && (
        <section aria-labelledby="suggest-h">
          <h2 id="suggest-h" className={`${sectionTitle} mb-3`}>
            Sugestões para você
          </h2>
          <Carousel>
            {discover.suggestions.map((p) => (
              <PersonCard key={p.memberId} person={p} basePath={basePath} />
            ))}
          </Carousel>
        </section>
      )}

      {discover.me.goal && discover.sameGoal.length > 0 && (
        <section aria-labelledby="goal-h">
          <h2 id="goal-h" className={`${sectionTitle} mb-1`}>
            Mesmo objetivo que você
          </h2>
          <p className="mb-3 text-sm text-muted">{GOAL_LABELS[discover.me.goal]}</p>
          <Carousel>
            {discover.sameGoal.map((p) => (
              <PersonCard key={p.memberId} person={p} basePath={basePath} />
            ))}
          </Carousel>
        </section>
      )}

      {challenges.length > 0 && (
        <section aria-labelledby="challenges-h">
          <h2 id="challenges-h" className={`${sectionTitle} mb-3`}>
            Desafios
          </h2>
          <Challenges items={challenges} basePath={basePath} />
        </section>
      )}

      <section aria-labelledby="hot-h">
        <h2 id="hot-h" className={`${sectionTitle} mb-3`}>
          Em alta
        </h2>
        {popular.posts.length === 0 ? (
          <EmptyState title="Nada em alta por enquanto">As publicações mais curtidas e comentadas dos últimos 30 dias aparecem aqui.</EmptyState>
        ) : (
          <div className="flex flex-col gap-4">
            {popular.posts.map((p) => (
              <PostCard key={p.id} post={p} basePath={basePath} viewer={viewer} />
            ))}
          </div>
        )}
      </section>

      {discover.suggestions.length === 0 && discover.members <= 1 && (
        <EmptyState title="Sua comunidade começa aqui">Assim que mais pessoas entrarem na consultoria, elas aparecem nesta página.</EmptyState>
      )}
    </div>
  );
}

export async function CommunityPostPage({ actor, basePath, postId }: { actor: Actor; basePath: string; postId: string }) {
  if (!z.uuid().safeParse(postId).success) notFound();
  const data = await guard(() => Promise.all([getPost(actor, postId), getMyCard(actor)]));
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Link href={basePath} className={backLink}>
        <span aria-hidden="true">←</span> Comunidade
      </Link>
      {data === "disabled" ? <Disabled /> : <PostCard post={data[0].post} basePath={basePath} viewer={viewerOf(actor, data[1], true)} detail initialComments={data[0].comments} />}
    </div>
  );
}

type ProfileTab = "posts" | "followers" | "following";
export const profileTabFromParam = (aba: string | undefined): ProfileTab => (aba === "seguidores" ? "followers" : aba === "seguindo" ? "following" : "posts");

export async function CommunityProfilePage({ actor, basePath, memberId, tab }: { actor: Actor; basePath: string; memberId: string; tab: ProfileTab }) {
  if (!z.uuid().safeParse(memberId).success) notFound();
  const data = await guard(() => Promise.all([getProfile(actor, memberId), getMyCard(actor)]));
  if (data === "disabled") return <Disabled />;
  const [profile, me] = data;
  const viewer = viewerOf(actor, me, true);
  const href = `${basePath}/membro/${memberId}`;
  const [feed, people] = await Promise.all([
    tab === "posts" && !profile.blockedByMe ? listFeed(actor, { scope: "all", cursor: null, authorMemberId: memberId }) : null,
    tab !== "posts" && !profile.blockedByMe ? listConnections(actor, memberId, tab) : null,
  ]);
  const since = profile.joinedAt ? new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "America/Sao_Paulo" }).format(profile.joinedAt) : null;
  const stats: { label: string; value: number; tab?: ProfileTab; param?: string }[] = [
    { label: "Publicações", value: profile.posts, tab: "posts" },
    { label: "Seguidores", value: profile.followers, tab: "followers", param: "seguidores" },
    { label: "Seguindo", value: profile.following, tab: "following", param: "seguindo" },
  ];
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      {profile.isMe ? (
        <CommunityHeader basePath={basePath} active="profile" myMemberId={me.memberId} canModerate={viewer.canModerate} />
      ) : (
        <Link href={basePath} className={backLink}>
          <span aria-hidden="true">←</span> Comunidade
        </Link>
      )}

      <header className="rounded-[28px] border border-line bg-paper shadow-[var(--shadow-card)]">
        <div aria-hidden="true" className="relative h-24 overflow-hidden rounded-t-[27px] bg-night sm:h-28">
          <svg viewBox="0 0 400 120" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full text-signal">
            <circle cx="340" cy="20" r="90" fill="none" stroke="currentColor" strokeOpacity="0.5" strokeWidth="26" />
            <circle cx="340" cy="20" r="150" fill="none" stroke="currentColor" strokeOpacity="0.18" strokeWidth="26" />
          </svg>
        </div>
        <div className="px-5 pb-5">
          <div className="relative z-[1] -mt-11 flex items-end justify-between gap-3">
            <span className="rounded-full bg-paper p-1">
              <Avatar name={profile.name} src={profile.avatarUrl} size={88} />
            </span>
            <div className="pb-1">
              {profile.isMe ? (
                <EditProfile name={profile.name} avatarUrl={profile.avatarUrl} bio={profile.bio} goal={profile.goal} />
              ) : (
                <ProfileActions memberId={profile.memberId} name={profile.name} isFollowing={profile.isFollowing} blockedByMe={profile.blockedByMe} canMessage={profile.canMessage} />
              )}
            </div>
          </div>
          <h1 className="mt-3 font-display text-[1.7rem] leading-tight font-bold break-words">{profile.name}</h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
            <span className={profile.role === "trainer" ? "rounded-full bg-turf-solid px-2 py-0.5 text-xs font-semibold text-white" : ""}>{roleLabel(profile.role)}</span>
            {since && <span>desde {since}</span>}
            {profile.followsMe && !profile.isMe && <span className="rounded-full bg-surface-subtle px-2 py-0.5 text-xs font-semibold text-ink-soft">Segue você</span>}
          </p>
          {profile.bio && <p className="mt-3 leading-relaxed break-words whitespace-pre-line">{profile.bio}</p>}
          {profile.isMe && !profile.bio && !profile.goal && <p className="mt-3 text-sm text-muted">Adicione uma foto, uma bio e seu objetivo para a turma te conhecer.</p>}
          {profile.goal && (
            <p className="mt-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-turf-tint px-3 py-1.5 text-sm font-semibold text-turf">
                <FlameIcon className="size-4" /> {GOAL_LABELS[profile.goal]}
              </span>
            </p>
          )}

          <dl className="mt-5 flex flex-wrap gap-x-7 gap-y-3 border-t border-line pt-4">
            {stats.map((s) => (
              <div key={s.label}>
                <dt className="sr-only">{s.label}</dt>
                <dd>
                  <Link href={s.param ? `${href}?aba=${s.param}` : href} aria-current={tab === s.tab ? "page" : undefined} className="group block">
                    <span className="block font-display text-2xl leading-none font-extrabold tabular-nums">{s.value}</span>
                    <span className={`mt-1 block text-sm group-hover:underline ${tab === s.tab ? "font-semibold text-ink" : "text-muted"}`}>{s.label}</span>
                  </Link>
                </dd>
              </div>
            ))}
            {profile.constancy && (
              <>
                <div>
                  <dd className="font-display text-2xl leading-none font-extrabold tabular-nums">{profile.constancy.checkins}</dd>
                  <dt className="mt-1 text-sm text-muted">Check-ins</dt>
                </div>
                <div>
                  <dd className="font-display text-2xl leading-none font-extrabold text-turf tabular-nums">{profile.constancy.points}</dd>
                  <dt className="mt-1 text-sm text-muted">Pontos de constância</dt>
                </div>
              </>
            )}
          </dl>
        </div>
      </header>

      {profile.blockedByMe ? (
        <p className="text-sm text-muted">Você bloqueou esta pessoa. Desbloqueie para ver as publicações dela.</p>
      ) : tab === "posts" ? (
        feed && (
          <Feed
            initial={feed.posts}
            initialCursor={feed.nextCursor}
            scope="all"
            authorMemberId={memberId}
            basePath={basePath}
            viewer={viewer}
            empty={<EmptyState title="Nenhuma publicação ainda">{profile.isMe ? "Suas publicações aparecem aqui. Que tal contar como foi o treino de hoje?" : `${profile.name.split(" ")[0]} ainda não publicou.`}</EmptyState>}
          />
        )
      ) : (
        <section aria-labelledby="people-h">
          <h2 id="people-h" className="mb-3 font-display text-xl font-bold">
            {tab === "followers" ? "Seguidores" : "Seguindo"}
          </h2>
          {people && people.length > 0 ? (
            <ul className={`${panel} flex flex-col gap-4`}>
              {people.map((p) => (
                <PersonRow key={p.memberId} person={p} basePath={basePath} />
              ))}
            </ul>
          ) : (
            <p className="text-muted">{tab === "followers" ? "Ninguém segue este perfil ainda." : "Este perfil ainda não segue ninguém."}</p>
          )}
        </section>
      )}
    </div>
  );
}
