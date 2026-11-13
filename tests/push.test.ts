import { randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { resolveActor } from "@/server/auth/actor";
import { logout } from "@/server/auth/service";
import type { Actor } from "@/server/authz/policy";
import { closeDb } from "@/server/db/client";
import { withSystem, withTenant } from "@/server/db/context";
import { pushSubscriptions } from "@/server/db/schema";
import { listExercises } from "@/server/exercises/service";
import { runInactivityCheck } from "@/server/jobs/inactivity";
import { AppError } from "@/server/lib/errors";
import { testOutbox } from "@/server/mail/mailer";
import { openConversation, sendMessage } from "@/server/messaging/service";
import { isPushDeviceActive, pushIdle, removePushSubscription, savePushSubscription, sendTestPush, testPushOutbox } from "@/server/notifications/push";
import { listNotifications, notify, setMutedTypes } from "@/server/notifications/service";
import { assignProgram, createProgram, getProgram, publishDraft, saveDraft } from "@/server/programs/service";
import { acceptInvitationWithNewAccount, inviteStudent } from "@/server/students/invitations";
import { finishSession, logSet, startSession } from "@/server/workouts/service";
import { createTrainer, loginAs, meta, PASSWORD, uniqueEmail } from "./support/factories";

afterAll(closeDb);

const DAY = 24 * 60 * 60 * 1000;
const b64 = (n: number) => randomBytes(n).toString("base64url");
/** A browser subscription as PushSubscription.toJSON() gives it. */
const device = (path = "push") => ({ endpoint: `https://push.example.test/${path}/${randomUUID()}`, keys: { p256dh: b64(65), auth: b64(16) } });

async function trainer() {
  const t = await createTrainer();
  return (await resolveActor((await loginAs(t.email)).token))!;
}
async function studentOf(tr: Actor, name = "Aluno") {
  const email = uniqueEmail("aluno");
  await inviteStudent(tr, email, meta());
  const token = [...testOutbox].reverse().find((m) => m.to === email)!.text.match(/token=([A-Za-z0-9_-]{43})/)![1]!;
  return (await resolveActor((await acceptInvitationWithNewAccount({ token, displayName: name, password: PASSWORD }, meta())).token))!;
}
async function code(p: Promise<unknown>) {
  return p.then(
    () => "ok",
    (e: unknown) => (e instanceof AppError ? e.code : ((e as { cause?: { code?: string } }).cause?.code ?? String(e))),
  );
}
const mid = (a: Actor) => a.membership!.memberId;
const ws = (a: Actor) => a.membership!.workspaceId;
async function pushesTo(endpoint: string) {
  await pushIdle();
  return testPushOutbox.filter((p) => p.endpoint === endpoint).map((p) => p.message);
}
async function assignBase(t: Actor, s: Actor) {
  const supino = (await listExercises(t, { q: "Supino reto com barra" }))[0]!.id;
  const ex = { exerciseId: supino, variationExerciseId: null, sets: 3, reps: "10", load: null, restSeconds: 60, tempo: null, notes: null };
  const programId = await createProgram(t, { name: "Base", description: null, isTemplate: false }, meta());
  await saveDraft(t, programId, [{ name: "A", notes: null, exercises: [ex] }], meta());
  await publishDraft(t, programId, meta());
  await assignProgram(t, { programId, memberIds: [mid(s)], startsOn: "2026-11-10", endsOn: null }, meta());
  const day = (await getProgram(t, programId)).published!.content.days[0]!;
  return { supino, day };
}

describe("devices", () => {
  it("a device subscribes, is recognised, and can be turned off; bad subscriptions are refused", async () => {
    const t = await trainer();
    const d = device();
    expect(await code(savePushSubscription(t, { endpoint: "http://insecure.test/x", keys: d.keys }, "pt-BR"))).toBe("VALIDATION");
    expect(await code(savePushSubscription(t, { endpoint: d.endpoint, keys: { p256dh: "short", auth: d.keys.auth } }, "pt-BR"))).toBe("VALIDATION");
    await savePushSubscription(t, d, "pt-BR");
    expect(await isPushDeviceActive(t, d.endpoint)).toBe(true);
    await removePushSubscription(t, d.endpoint);
    expect(await isPushDeviceActive(t, d.endpoint)).toBe(false);
  });

  it("a shared device belongs to whoever subscribed last; nobody reads or writes other people's devices", async () => {
    const a = await trainer();
    const b = await trainer();
    const d = device();
    await savePushSubscription(a, d, "pt-BR");
    await savePushSubscription(b, d, "en");
    expect(await isPushDeviceActive(a, d.endpoint)).toBe(false);
    expect(await isPushDeviceActive(b, d.endpoint)).toBe(true);
    const seenByA = await withTenant({ userId: a.userId }, (tx) => tx.select().from(pushSubscriptions));
    expect(seenByA.some((r) => r.endpoint === d.endpoint)).toBe(false);
    // Writing directly, around app_save_push_subscription, is refused.
    const other = device();
    expect(
      await code(withTenant({ userId: a.userId }, (tx) => tx.insert(pushSubscriptions).values({ userId: a.userId, endpoint: other.endpoint, p256dh: other.keys.p256dh, auth: other.keys.auth }))),
    ).toBe("42501");
    // The internal functions only answer the system context.
    expect(await code(withTenant({ userId: a.userId }, (tx) => tx.execute(sql`select * from app_inactive_students(now(), 7, null)`)))).toBe("42501");
    expect(await code(withTenant({ userId: a.userId }, (tx) => tx.execute(sql`select * from app_push_targets(array[${randomUUID()}::uuid])`)))).toBe("42501");
  });

  it("keeps at most 10 devices per person, and signing out stops that session's device", async () => {
    const t = await trainer();
    const devices = Array.from({ length: 11 }, () => device());
    for (const d of devices) await savePushSubscription(t, d, "pt-BR");
    const mine = await withTenant({ userId: t.userId }, (tx) => tx.select().from(pushSubscriptions));
    expect(mine).toHaveLength(10);
    expect(await isPushDeviceActive(t, devices[10]!.endpoint)).toBe(true);
    await logout(t.sessionId, t.userId, meta());
    expect(await isPushDeviceActive(t, devices[10]!.endpoint)).toBe(false);
  });
});

describe("delivery", () => {
  it("a message reaches the student's phone in their language, without the message text", async () => {
    const t = await trainer();
    const s = await studentOf(t);
    const d = device();
    await savePushSubscription(s, d, "en");
    const conversationId = await openConversation(t, mid(s));
    await sendMessage(t, { conversationId, body: "Segredo do treino de amanhã", imageAssetId: null }, meta());
    const [push] = await pushesTo(d.endpoint);
    expect(push).toEqual({ title: "SalesFit", body: "New message from Treinador", url: `/aluno/mensagens/${conversationId}`, tag: `message_received:${conversationId}` });
    expect(JSON.stringify(push)).not.toContain("Segredo");
  });

  it("a new workout reaches the student; muted types do not", async () => {
    const t = await trainer();
    const s = await studentOf(t);
    const d = device();
    await savePushSubscription(s, d, "pt-BR");
    await setMutedTypes(s, ["message_received"]);
    await assignBase(t, s);
    const conversationId = await openConversation(t, mid(s));
    await sendMessage(t, { conversationId, body: "oi", imageAssetId: null }, meta());
    const pushes = await pushesTo(d.endpoint);
    expect(pushes.map((p) => p.body)).toEqual(["Você recebeu um novo treino: Base"]);
    expect(pushes[0]!.url).toBe("/aluno");
  });

  it("nothing is pushed when the transaction rolls back; expired devices are removed", async () => {
    const t = await trainer();
    const s = await studentOf(t);
    const d = device("gone");
    await savePushSubscription(s, d, "pt-BR");
    const ctx = { userId: t.userId, workspaceId: ws(t) };
    const item = { recipientMemberId: mid(s), type: "announcement" as const, actorMemberId: mid(t), dedupeKey: `test:${randomUUID()}` };
    await withSystem(ctx, async (tx) => {
      await notify(tx, ctx, [item]);
      throw new Error("rollback");
    }).catch(() => undefined);
    expect(await pushesTo(d.endpoint)).toHaveLength(0);
    await withSystem(ctx, (tx) => notify(tx, ctx, [item]));
    expect(await pushesTo(d.endpoint)).toHaveLength(1);
    // The push service answered "gone" for this device: it is no longer on the list.
    expect(await isPushDeviceActive(s, d.endpoint)).toBe(false);
  });

  it("the test notification reaches every device of the person", async () => {
    const t = await trainer();
    const [d1, d2] = [device(), device()];
    await savePushSubscription(t, d1, "es");
    await savePushSubscription(t, d2, "pt-BR");
    expect(await sendTestPush(t)).toBe(2);
    expect((await pushesTo(d1.endpoint))[0]!.body).toBe("¡Listo! Las notificaciones están llegando a este dispositivo.");
    expect((await pushesTo(d2.endpoint))[0]!.url).toBe("/treinador/notificacoes");
  });
});

describe("students who stopped training", () => {
  it("the trainer is told once per absence and the student with a workout gets a nudge", async () => {
    const t = await trainer();
    const withProgram = await studentOf(t, "Bia Lima");
    const withoutProgram = await studentOf(t, "Caio Reis");
    const trainerDevice = device();
    const studentDevice = device();
    await savePushSubscription(t, trainerDevice, "pt-BR");
    await savePushSubscription(withProgram, studentDevice, "pt-BR");
    const { supino, day } = await assignBase(t, withProgram);
    await pushIdle();
    testPushOutbox.length = 0;

    // Recent students are left alone.
    expect(await runInactivityCheck({ now: new Date(Date.now() + 3 * DAY), workspaceId: ws(t) })).toEqual({ trainers: 0, students: 0 });

    const later = new Date(Date.now() + 8 * DAY + 60_000);
    expect(await runInactivityCheck({ now: later, workspaceId: ws(t) })).toEqual({ trainers: 2, students: 1 });
    const toTrainer = (await pushesTo(trainerDevice.endpoint)).map((p) => p.body).sort();
    expect(toTrainer).toEqual(["Bia Lima ainda não fez nenhum treino desde que entrou", "Caio Reis ainda não fez nenhum treino desde que entrou"]);
    expect((await pushesTo(trainerDevice.endpoint))[0]!.url).toMatch(/^\/treinador\/alunos\/[0-9a-f-]{36}$/);
    expect((await pushesTo(studentDevice.endpoint)).map((p) => p.body)).toEqual(["Seu treino está esperando por você. Que tal começar hoje?"]);
    expect((await listNotifications(withoutProgram)).some((n) => n.type === "workout_reminder")).toBe(false);

    // Running again (another server, another hour) repeats nothing.
    expect(await runInactivityCheck({ now: later, workspaceId: ws(t) })).toEqual({ trainers: 0, students: 0 });

    // After training, a new absence is a new notification, counted from that workout.
    const r = await startSession(withProgram, day.id, meta());
    if (!("sessionId" in r)) throw new Error("conflict");
    await logSet(withProgram, { sessionId: r.sessionId, programExerciseId: day.exercises[0]!.id, exerciseId: supino, setNumber: 1, reps: 10, loadKg: 40 });
    await finishSession(withProgram, { sessionId: r.sessionId, effort: 7, notes: null }, meta());
    testPushOutbox.length = 0;
    expect(await runInactivityCheck({ now: new Date(Date.now() + 10 * DAY + 60_000), workspaceId: ws(t) })).toEqual({ trainers: 1, students: 1 });
    expect((await pushesTo(trainerDevice.endpoint)).map((p) => p.body)).toEqual(["Bia Lima está há 10 dias sem treinar"]);
    expect((await pushesTo(studentDevice.endpoint)).map((p) => p.body)).toEqual(["Faz 10 dias desde o seu último treino. Bora voltar hoje?"]);
  });
});
