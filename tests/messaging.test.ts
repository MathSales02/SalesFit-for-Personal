import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { resolveActor } from "@/server/auth/actor";
import type { Actor } from "@/server/authz/policy";
import { addComment, createPost, getModerationQueue, report, setBlock, setFollow, toggleLike, updateSettings } from "@/server/community/service";
import { closeDb } from "@/server/db/client";
import { withTenant } from "@/server/db/context";
import { conversations, messages, notifications } from "@/server/db/schema";
import { listExercises } from "@/server/exercises/service";
import { AppError } from "@/server/lib/errors";
import { testOutbox } from "@/server/mail/mailer";
import { completeUpload, playbackUrls, requestUpload } from "@/server/media/service";
import {
  deleteMessage,
  getConversation,
  listContacts,
  listConversations,
  openConversation,
  pollConversation,
  sendMessage,
  unreadConversationCount,
} from "@/server/messaging/service";
import { listNotifications, markNotificationsRead, setMutedTypes, unreadNotificationCount } from "@/server/notifications/service";
import { assignProgram, createProgram, publishDraft, saveDraft, startDraft } from "@/server/programs/service";
import { acceptInvitationWithNewAccount, inviteStudent } from "@/server/students/invitations";
import { createTrainer, loginAs, meta, PASSWORD, uniqueEmail } from "./support/factories";

afterAll(closeDb);

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
const ctxOf = (a: Actor) => ({ userId: a.userId, workspaceId: a.membership!.workspaceId });
const send = (a: Actor, conversationId: string, body: string) => sendMessage(a, { conversationId, body, imageAssetId: null }, meta());

describe("direct messages", () => {
  it("trainer and student talk; one conversation per pair; unread counts and read markers work", async () => {
    const t = await trainer();
    const s = await studentOf(t, "Sara");
    const c1 = await openConversation(s, mid(t));
    expect(await openConversation(t, mid(s))).toBe(c1);

    const sent = await send(s, c1, "Professor, posso trocar o treino B?");
    expect(sent.mine).toBe(true);
    expect(await unreadConversationCount(t)).toBe(1);
    const list = await listConversations(t);
    expect(list[0]).toMatchObject({ id: c1, unread: 1, other: { name: "Sara" } });

    const view = await getConversation(t, c1);
    expect(view.messages.map((m) => m.body)).toEqual(["Professor, posso trocar o treino B?"]);
    expect(await unreadConversationCount(t)).toBe(0);

    await send(t, c1, "Pode sim!");
    const fresh = await pollConversation(s, c1, { createdAt: sent.createdAt, id: sent.id });
    expect(fresh.map((m) => m.body)).toEqual(["Pode sim!"]);
  });

  it("students talk to each other by default; the trainer's switch stops new and existing conversations", async () => {
    const t = await trainer();
    const a = await studentOf(t, "Ana");
    const b = await studentOf(t, "Beto");
    const c = await openConversation(a, mid(b));
    await send(a, c, "Bora treinar amanhã?");
    expect((await listContacts(a)).map((x) => x.name)).toContain("Beto");

    await updateSettings(t, { communityEnabled: true, studentPostsRequireApproval: false, studentDirectMessages: false }, meta());
    expect(await code(send(a, c, "Ainda dá?"))).toBe("FORBIDDEN");
    expect((await listContacts(a)).map((x) => x.name)).not.toContain("Beto");
    const other = await studentOf(t, "Caio");
    expect(await code(openConversation(a, mid(other)))).toBe("FORBIDDEN");
    // Bypassing the service: the database applies the same rule.
    const direct = await code(withTenant(ctxOf(a), (tx) => tx.insert(messages).values({ workspaceId: ctxOf(a).workspaceId, conversationId: c, senderMemberId: mid(a), body: "direto" })));
    expect(direct).toBe("42501");
    // Talking to the trainer is always allowed.
    await send(a, await openConversation(a, mid(t)), "Oi, professor");
  });

  it("a block stops messages both ways", async () => {
    const t = await trainer();
    const a = await studentOf(t);
    const b = await studentOf(t);
    const c = await openConversation(a, mid(b));
    await send(b, c, "oi");
    await setBlock(a, mid(b), true, meta());
    expect(await code(send(b, c, "oi de novo"))).toBe("FORBIDDEN");
    expect(await code(send(a, c, "tchau"))).toBe("FORBIDDEN");
    expect((await getConversation(a, c)).canSend).toBe(false);
  });

  it("the trainer cannot read conversations between students, even with direct queries", async () => {
    const t = await trainer();
    const a = await studentOf(t);
    const b = await studentOf(t);
    const c = await openConversation(a, mid(b));
    await send(a, c, "segredo entre alunos");
    expect(await code(getConversation(t, c))).toBe("NOT_FOUND");
    expect(await withTenant(ctxOf(t), (tx) => tx.select().from(messages))).toHaveLength(0);
    expect(await withTenant(ctxOf(t), (tx) => tx.select().from(conversations).where(eq(conversations.id, c)))).toHaveLength(0);
    const admin = await withTenant({ ...ctxOf(t), isPlatformAdmin: true }, (tx) => tx.select().from(messages));
    expect(admin).toHaveLength(0);
  });

  it("outsiders cannot read, send, impersonate, or tamper with read markers", async () => {
    const t = await trainer();
    const a = await studentOf(t);
    const b = await studentOf(t);
    const outsider = await studentOf(t);
    const c = await openConversation(a, mid(b));
    await send(a, c, "só nós dois");
    expect(await code(getConversation(outsider, c))).toBe("NOT_FOUND");
    expect(await code(send(outsider, c, "intrometido"))).toBe("NOT_FOUND");
    // Impersonation: B tries to insert a message as A.
    expect(await code(withTenant(ctxOf(b), (tx) => tx.insert(messages).values({ workspaceId: ctxOf(b).workspaceId, conversationId: c, senderMemberId: mid(a), body: "fingindo" })))).toBe("42501");
    // B tries to mark A's side as read and to move last_message_at.
    const [conv] = await withTenant(ctxOf(b), (tx) => tx.select().from(conversations).where(eq(conversations.id, c)));
    const aIsA = conv!.memberAId === mid(a);
    expect(await code(withTenant(ctxOf(b), (tx) => tx.update(conversations).set(aIsA ? { aLastReadAt: new Date() } : { bLastReadAt: new Date() }).where(eq(conversations.id, c))))).toBe("42501");
    expect(await code(withTenant(ctxOf(b), (tx) => tx.update(conversations).set({ lastMessageAt: new Date(0) }).where(eq(conversations.id, c))))).toBe("42501");
    // Another workspace cannot even see that the conversation exists.
    const foreign = await studentOf(await trainer());
    expect(await code(getConversation(foreign, c))).toBe("NOT_FOUND");
    expect(await code(openConversation(foreign, mid(a)))).toBe("FORBIDDEN");
  });

  it("only the sender deletes a message, and its content is wiped for both", async () => {
    const t = await trainer();
    const a = await studentOf(t);
    const b = await studentOf(t);
    const c = await openConversation(a, mid(b));
    const msg = await send(a, c, "mensagem errada");
    expect(await code(deleteMessage(b, msg.id))).toBe("NOT_FOUND");
    expect(await code(withTenant(ctxOf(b), (tx) => tx.update(messages).set({ body: "editada" }).where(eq(messages.id, msg.id))))).toBe("ok");
    await deleteMessage(a, msg.id);
    const seen = (await getConversation(b, c)).messages.find((m) => m.id === msg.id)!;
    expect(seen).toMatchObject({ deleted: true, body: null });
    expect(await code(withTenant(ctxOf(a), (tx) => tx.update(messages).set({ body: "voltei" }).where(eq(messages.id, msg.id))))).toBe("42501");
  });

  it("images in messages are screened and visible only to the two participants", async () => {
    const t = await trainer();
    const a = await studentOf(t);
    const b = await studentOf(t);
    const outsider = await studentOf(t);
    const bytes = new Uint8Array(await sharp({ create: { width: 600, height: 600, channels: 3, background: "#204a8a" } }).jpeg().toBuffer());
    const ticket = await requestUpload(a, { contentType: "image/jpeg", sizeBytes: bytes.length }, meta(), "message");
    const fd = new FormData();
    for (const [k, v] of Object.entries(ticket.fields)) fd.append(k, v);
    fd.append("file", new Blob([bytes], { type: "image/jpeg" }));
    await fetch(ticket.url, { method: "POST", body: fd });
    expect((await completeUpload(a, ticket.assetId, meta())).moderation).toBe("clear");
    const c = await openConversation(a, mid(b));
    await sendMessage(a, { conversationId: c, body: null, imageAssetId: ticket.assetId }, meta());
    expect((await playbackUrls(b, [ticket.assetId])).size).toBe(1);
    expect((await playbackUrls(outsider, [ticket.assetId])).size).toBe(0);
    expect((await playbackUrls(t, [ticket.assetId])).size).toBe(0);
  });

  it("a participant can report the other's message; the trainer sees only that message", async () => {
    const t = await trainer();
    const a = await studentOf(t);
    const b = await studentOf(t);
    const outsider = await studentOf(t);
    const c = await openConversation(a, mid(b));
    const bad = await send(b, c, "mensagem ofensiva");
    await send(b, c, "outra mensagem que não foi denunciada");
    expect(await code(report(outsider, { targetType: "message", targetId: bad.id, reason: "harassment", details: null }, meta()))).toBe("NOT_FOUND");
    expect(await code(report(b, { targetType: "message", targetId: bad.id, reason: "harassment", details: null }, meta()))).toBe("VALIDATION");
    await report(a, { targetType: "message", targetId: bad.id, reason: "harassment", details: null }, meta());
    const queue = await getModerationQueue(t);
    const r = queue.reports.find((x) => x.targetId === bad.id)!;
    expect(r.preview?.text).toBe("mensagem ofensiva");
    expect(JSON.stringify(queue)).not.toContain("outra mensagem que não foi denunciada");
  });
});

describe("notifications", () => {
  it("likes notify the author once (like/unlike/like), never yourself; comments and replies notify the right people", async () => {
    const t = await trainer();
    const a = await studentOf(t, "Ana");
    const b = await studentOf(t, "Beto");
    const { postId } = await createPost(a, { body: "Treino feito", imageAssetId: null, announcement: false }, meta());
    await toggleLike(b, postId);
    await toggleLike(b, postId);
    await toggleLike(b, postId);
    await toggleLike(a, postId);
    const likes = (await listNotifications(a)).filter((n) => n.type === "post_liked");
    expect(likes).toHaveLength(1);
    expect(likes[0]!.actorName).toBe("Beto");

    await addComment(b, { postId, parentCommentId: null, body: "Boa!" }, meta());
    expect((await listNotifications(a)).some((n) => n.type === "post_commented")).toBe(true);
    const { comments } = await import("@/server/community/service").then((s) => s.getPost(a, postId));
    await addComment(a, { postId, parentCommentId: comments[0]!.id, body: "Valeu" }, meta());
    expect((await listNotifications(b)).some((n) => n.type === "comment_replied")).toBe(true);
    expect((await listNotifications(a)).filter((n) => n.type === "post_commented")).toHaveLength(1);
  });

  it("messages collapse into one unread notification per conversation, without the text", async () => {
    const t = await trainer();
    const s = await studentOf(t);
    const c = await openConversation(s, mid(t));
    await send(s, c, "primeira mensagem privada");
    await send(s, c, "segunda mensagem privada");
    const msgs = (await listNotifications(t)).filter((n) => n.type === "message_received");
    expect(msgs).toHaveLength(1);
    expect(JSON.stringify(msgs)).not.toContain("privada");
    await markNotificationsRead(t);
    expect(await unreadNotificationCount(t)).toBe(0);
    await send(s, c, "terceira");
    expect(await unreadNotificationCount(t)).toBe(1);
  });

  it("muted types are not delivered; blocked people do not notify you", async () => {
    const t = await trainer();
    const a = await studentOf(t);
    const b = await studentOf(t);
    await setMutedTypes(a, ["new_follower"]);
    await setFollow(b, mid(a), true);
    expect((await listNotifications(a)).some((n) => n.type === "new_follower")).toBe(false);
    const { postId } = await createPost(a, { body: "post", imageAssetId: null, announcement: false }, meta());
    await setBlock(a, mid(b), true, meta());
    expect(await code(toggleLike(b, postId))).toBe("NOT_FOUND");
    expect((await listNotifications(a)).some((n) => n.type === "post_liked")).toBe(false);
  });

  it("students hear about assigned and updated programs, and trainer announcements", async () => {
    const t = await trainer();
    const s = await studentOf(t);
    const supino = (await listExercises(t, { q: "Supino reto com barra" }))[0]!.id;
    const ex = { exerciseId: supino, variationExerciseId: null, sets: 3, reps: "10", load: null, restSeconds: 60, tempo: null, notes: null };
    const programId = await createProgram(t, { name: "Base", description: null, isTemplate: false }, meta());
    await saveDraft(t, programId, [{ name: "A", notes: null, exercises: [ex] }], meta());
    await publishDraft(t, programId, meta());
    await assignProgram(t, { programId, memberIds: [mid(s)], startsOn: "2026-11-10", endsOn: null }, meta());
    await startDraft(t, programId, meta());
    await saveDraft(t, programId, [{ name: "A2", notes: null, exercises: [ex] }], meta());
    await publishDraft(t, programId, meta());
    await createPost(t, { body: "Feriado: academia fecha às 14h", imageAssetId: null, announcement: true }, meta());
    const types = (await listNotifications(s)).map((n) => n.type);
    expect(types).toEqual(expect.arrayContaining(["program_assigned", "program_updated", "announcement"]));
  });

  it("recipients only mark as read; nobody else reads or writes them", async () => {
    const t = await trainer();
    const a = await studentOf(t);
    const b = await studentOf(t);
    await setFollow(b, mid(a), true);
    const [n] = await listNotifications(a);
    expect(await code(withTenant(ctxOf(a), (tx) => tx.update(notifications).set({ dedupeKey: "x" }).where(eq(notifications.id, n!.id))))).toBe("42501");
    expect(await withTenant(ctxOf(b), (tx) => tx.select().from(notifications).where(eq(notifications.id, n!.id)))).toHaveLength(0);
    expect(
      await code(
        withTenant(ctxOf(b), (tx) => tx.insert(notifications).values({ workspaceId: ctxOf(b).workspaceId, recipientMemberId: mid(a), type: "announcement", dedupeKey: "fake" })),
      ),
    ).toBe("42501");
  });
});
