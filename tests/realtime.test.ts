import { afterAll, describe, expect, it } from "vitest";
import { resolveActor } from "@/server/auth/actor";
import type { Actor } from "@/server/authz/policy";
import { closeDb } from "@/server/db/client";
import { testOutbox } from "@/server/mail/mailer";
import { subscribeConversation } from "@/server/messaging/realtime";
import { assertConversationAccess, openConversation, sendMessage } from "@/server/messaging/service";
import { acceptInvitationWithNewAccount, inviteStudent } from "@/server/students/invitations";
import { createTrainer, loginAs, meta, PASSWORD, uniqueEmail } from "./support/factories";

afterAll(closeDb);

async function trainer() {
  const t = await createTrainer();
  return (await resolveActor((await loginAs(t.email)).token))!;
}
async function studentOf(tr: Actor) {
  const email = uniqueEmail("aluno");
  await inviteStudent(tr, email, meta());
  const token = [...testOutbox].reverse().find((m) => m.to === email)!.text.match(/token=([A-Za-z0-9_-]{43})/)![1]!;
  return (await resolveActor((await acceptInvitationWithNewAccount({ token, displayName: "Aluno", password: PASSWORD }, meta())).token))!;
}

describe("live conversation signals", () => {
  it("signals the conversation on new messages, only to its participants, without content", async () => {
    const t = await trainer();
    const s = await studentOf(t);
    const other = await studentOf(t);
    const conv = await openConversation(s, t.membership!.memberId);

    const received: unknown[] = [];
    const stop = subscribeConversation(conv, (...args: unknown[]) => received.push(args));
    await sendMessage(s, { conversationId: conv, body: "Oi", imageAssetId: null }, meta());
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual([]); // a bare signal: no message data travels on this channel
    stop();
    await sendMessage(t, { conversationId: conv, body: "Oi!", imageAssetId: null }, meta());
    expect(received).toHaveLength(1);

    await expect(assertConversationAccess(s, conv)).resolves.toBeUndefined();
    await expect(assertConversationAccess(t, conv)).resolves.toBeUndefined();
    await expect(assertConversationAccess(other, conv)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const stranger = await trainer();
    await expect(assertConversationAccess(stranger, conv)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
