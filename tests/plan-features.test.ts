import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { annualPriceCents, FEATURES } from "@/lib/plan-features";
import { resolveActor } from "@/server/auth/actor";
import type { Actor } from "@/server/authz/policy";
import { listPublicPlans } from "@/server/billing/public-plans";
import { createPost, listFeed } from "@/server/community/service";
import { closeDb } from "@/server/db/client";
import { withSystem } from "@/server/db/context";
import { plans, subscriptions } from "@/server/db/schema";
import { createExercise, listExercises } from "@/server/exercises/service";
import { getMyGamification, getRanking, listCompetitions } from "@/server/gamification/service";
import { AppError } from "@/server/lib/errors";
import { testOutbox } from "@/server/mail/mailer";
import { requestUpload } from "@/server/media/service";
import { listContacts, openConversation } from "@/server/messaging/service";
import { listPrograms } from "@/server/programs/service";
import { getOwnProgress, getStudentProgress } from "@/server/progress/service";
import { acceptInvitationWithNewAccount, inviteStudent } from "@/server/students/invitations";
import { createTrainer, loginAs, meta, PASSWORD, uniqueEmail } from "./support/factories";

afterAll(closeDb);

const SYS = "00000000-0000-0000-0000-000000000000";

async function code(p: Promise<unknown>) {
  return p.then(
    () => "ok",
    (e: unknown) => (e instanceof AppError ? e.code : String(e)),
  );
}

/** A consultancy with a trainer and two students, each with a fresh session. */
async function consultancy() {
  const t = await createTrainer();
  const trainer = (await resolveActor((await loginAs(t.email)).token))!;
  const student = async (name: string) => {
    const email = uniqueEmail("aluno");
    await inviteStudent(trainer, email, meta());
    const token = [...testOutbox].reverse().find((m) => m.to === email)!.text.match(/token=([A-Za-z0-9_-]{43})/)![1]!;
    await acceptInvitationWithNewAccount({ token, displayName: name, password: PASSWORD }, meta());
    return email;
  };
  const emails = { trainer: t.email, ana: await student("Ana"), bia: await student("Bia") };
  const ws = trainer.membership!.workspaceId;
  /** Puts the consultancy on a paid plan and returns everyone's actors as the app would now see them. */
  const onPlan = async (planCode: string) => {
    await withSystem({ userId: SYS, workspaceId: ws }, async (tx) => {
      const [p] = await tx.select({ id: plans.id }).from(plans).where(eq(plans.code, planCode));
      await tx
        .update(subscriptions)
        .set({ planId: p!.id, status: "active", currentPeriodEnd: new Date(Date.now() + 20 * 86_400_000) })
        .where(eq(subscriptions.workspaceId, ws));
    });
    const actor = async (email: string) => (await resolveActor((await loginAs(email)).token))!;
    return { trainer: await actor(emails.trainer), ana: await actor(emails.ana), bia: await actor(emails.bia) };
  };
  return { onPlan };
}

const uploadVideo = (a: Actor) => requestUpload(a, { contentType: "video/mp4", sizeBytes: 1024 }, meta());

describe("plans on offer", () => {
  it("Start, Pro and Elite, with the yearly price 15% under twelve months", async () => {
    const { paid, trial } = await listPublicPlans();
    expect(paid.map((p) => [p.code, p.priceCents, p.annualPriceCents, p.maxStudents])).toEqual([
      ["sf_start", 2990, 30498, 10],
      ["sf_pro", 4990, 50898, 30],
      ["sf_elite", 7990, 81498, 100],
    ]);
    for (const p of paid) expect(p.annualPriceCents).toBe(annualPriceCents(p.priceCents));
    const [start, pro, elite] = paid;
    expect(FEATURES.filter((f) => start!.features[f])).toEqual([]);
    expect(FEATURES.filter((f) => pro!.features[f])).toEqual(["community", "ranking", "evolution", "student_dm", "own_videos"]);
    expect(FEATURES.filter((f) => elite!.features[f])).toEqual([...FEATURES]);
    // The trial shows everything, for a few students.
    expect(FEATURES.every((f) => trial!.features[f])).toBe(true);
    expect(trial!.maxStudents).toBe(10);
  });
});

describe("what each plan unlocks, enforced in the services", () => {
  it("Start: the essentials work; community, ranking, evolution, own videos and competitions do not", async () => {
    const c = await consultancy();
    const { trainer, ana, bia } = await c.onPlan("sf_start");

    // Always there: students, workouts, the exercise library, check-in state, the student's own measurements.
    expect(await code(listPrograms(trainer))).toBe("ok");
    expect((await listExercises(trainer, { q: "" })).length).toBeGreaterThan(100);
    expect(await code(createExercise(trainer, { name: "Exercício do Start", muscleGroup: "chest", equipment: null, description: null, instructions: null }, meta()))).toBe("ok");
    expect(await code(getMyGamification(ana))).toBe("ok");
    expect(await code(getOwnProgress(ana))).toBe("ok");

    // Messages: trainer and student always; student to student is a Pro feature.
    expect((await listContacts(ana)).map((x) => x.role)).toEqual(["trainer"]);
    expect(await code(openConversation(ana, trainer.membership!.memberId))).toBe("ok");
    expect(await code(openConversation(trainer, bia.membership!.memberId))).toBe("ok");
    expect(await code(openConversation(ana, bia.membership!.memberId))).not.toBe("ok");

    for (const who of [trainer, ana]) {
      expect(await code(listFeed(who, { scope: "all", cursor: null }))).toBe("PLAN_LIMIT");
      expect(await code(getRanking(who, "week"))).toBe("PLAN_LIMIT");
      expect(await code(listCompetitions(who))).toBe("PLAN_LIMIT");
    }
    expect(await code(getStudentProgress(trainer, ana.membership!.memberId, meta()))).toBe("PLAN_LIMIT");
    expect(await code(uploadVideo(trainer))).toBe("PLAN_LIMIT");
    // The message tells the trainer what to do, and does not push the student to buy anything.
    await expect(listFeed(trainer, { scope: "all", cursor: null })).rejects.toThrow(/plano SalesFit Pro/);
    await expect(listFeed(ana, { scope: "all", cursor: null })).rejects.toThrow(/não faz parte do plano da sua consultoria/);
  });

  it("Pro: everything but competitions", async () => {
    const c = await consultancy();
    const { trainer, ana, bia } = await c.onPlan("sf_pro");
    expect(await code(listFeed(ana, { scope: "all", cursor: null }))).toBe("ok");
    expect(await code(getRanking(trainer, "week"))).toBe("ok");
    expect(await code(getStudentProgress(trainer, ana.membership!.memberId, meta()))).toBe("ok");
    expect(await code(uploadVideo(trainer))).toBe("ok");
    expect((await listContacts(ana)).map((x) => x.role).sort()).toEqual(["student", "trainer"]);
    expect(await code(openConversation(ana, bia.membership!.memberId))).toBe("ok");
    expect(await code(listCompetitions(trainer))).toBe("PLAN_LIMIT");
    await expect(listCompetitions(trainer)).rejects.toThrow(/plano SalesFit Elite/);
  });

  it("Elite: competitions too", async () => {
    const c = await consultancy();
    const { trainer, ana } = await c.onPlan("sf_elite");
    expect(await code(listCompetitions(trainer))).toBe("ok");
    expect(await code(listCompetitions(ana))).toBe("ok");
    expect(await code(listFeed(ana, { scope: "all", cursor: null }))).toBe("ok");
  });

  it("going down a plan locks the feature and keeps the data; going back up brings it all back", async () => {
    const c = await consultancy();
    let { trainer, ana, bia } = await c.onPlan("sf_pro");
    await createPost(ana, { body: "Treino de hoje feito!", imageAssetId: null, announcement: false } as Parameters<typeof createPost>[1], meta());
    const chat = await openConversation(ana, bia.membership!.memberId);

    ({ trainer, ana, bia } = await c.onPlan("sf_start"));
    expect(await code(listFeed(trainer, { scope: "all", cursor: null }))).toBe("PLAN_LIMIT");
    expect((await listContacts(ana)).map((x) => x.role)).toEqual(["trainer"]);

    ({ trainer, ana, bia } = await c.onPlan("sf_pro"));
    const feed = await listFeed(trainer, { scope: "all", cursor: null });
    expect(feed.posts.map((p) => p.body)).toContain("Treino de hoje feito!");
    // The same conversation is there again.
    expect(await openConversation(ana, bia.membership!.memberId)).toBe(chat);
  });

  it("whoever subscribed before the new plans keeps every feature", async () => {
    const c = await consultancy();
    const { trainer, ana } = await c.onPlan("solo");
    expect(await code(listFeed(ana, { scope: "all", cursor: null }))).toBe("ok");
    expect(await code(listCompetitions(trainer))).toBe("ok");
    expect(await code(uploadVideo(trainer))).toBe("ok");
  });
});
