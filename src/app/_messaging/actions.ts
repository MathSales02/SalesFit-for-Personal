"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { requestPhotoUploadSchema } from "@/lib/validation/progress";
import { parseForm, parseInput, runAction } from "@/server/http/action";
import { requestMeta, requireActionActor } from "@/server/http/next";
import { completeUpload, requestUpload, type UploadTicket } from "@/server/media/service";
import { deleteMessage, getConversation, openConversation, pollConversation, sendMessage, type MessageView } from "@/server/messaging/service";
import { markNotificationsRead, NOTIFICATION_TYPES, setMutedTypes } from "@/server/notifications/service";
import type { Actor } from "@/server/authz/policy";
import { isPushDeviceActive, removePushSubscription, savePushSubscription, sendTestPush } from "@/server/notifications/push";
import { getLocale } from "@/i18n/server";

const cursor = z.strictObject({ createdAt: z.iso.datetime({ offset: true }), id: z.uuid() });
const base = (actor: Actor) => (actor.membership?.role === "trainer" ? "/treinador" : "/aluno");

export async function openConversationAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("open_conversation", async () => {
    const actor = await requireActionActor("messages.use");
    const { memberId } = parseForm(z.strictObject({ memberId: z.uuid() }), form);
    const id = await openConversation(actor, memberId);
    redirect(`${base(actor)}/mensagens/${id}`);
  });
}

export async function sendMessageAction(input: unknown): Promise<ActionResult<MessageView>> {
  return runAction("send_message", async () => {
    const actor = await requireActionActor("messages.use");
    const data = parseInput(
      z.strictObject({
        conversationId: z.uuid(),
        body: z
          .string()
          .trim()
          .max(2000, "Use no máximo 2000 caracteres.")
          .transform((v) => (v === "" ? null : v)),
        imageAssetId: z.uuid().nullable(),
      }),
      input,
    );
    return { ok: true, data: await sendMessage(actor, data, await requestMeta()) };
  });
}

export async function pollMessagesAction(input: unknown): Promise<ActionResult<MessageView[]>> {
  return runAction("poll_messages", async () => {
    const actor = await requireActionActor("messages.use");
    const { conversationId, after } = parseInput(z.strictObject({ conversationId: z.uuid(), after: cursor.nullable() }), input);
    return { ok: true, data: await pollConversation(actor, conversationId, after) };
  });
}

export async function olderMessagesAction(input: unknown): Promise<ActionResult<{ messages: MessageView[]; olderCursor: z.infer<typeof cursor> | null }>> {
  return runAction("older_messages", async () => {
    const actor = await requireActionActor("messages.use");
    const { conversationId, before } = parseInput(z.strictObject({ conversationId: z.uuid(), before: cursor }), input);
    const page = await getConversation(actor, conversationId, before);
    return { ok: true, data: { messages: page.messages, olderCursor: page.olderCursor } };
  });
}

export async function deleteMessageAction(input: unknown): Promise<ActionResult> {
  return runAction("delete_message", async () => {
    const actor = await requireActionActor("messages.use");
    await deleteMessage(actor, parseInput(z.strictObject({ messageId: z.uuid() }), input).messageId);
    return { ok: true };
  });
}

export async function requestMessageImageAction(input: unknown): Promise<ActionResult<UploadTicket>> {
  return runAction("request_message_image", async () => {
    const actor = await requireActionActor("messages.use");
    return { ok: true, data: await requestUpload(actor, parseInput(requestPhotoUploadSchema, input), await requestMeta(), "message") };
  });
}

export async function completeMessageImageAction(input: unknown): Promise<ActionResult> {
  return runAction("complete_message_image", async () => {
    const actor = await requireActionActor("messages.use");
    await completeUpload(actor, parseInput(z.strictObject({ assetId: z.uuid() }), input).assetId, await requestMeta());
    return { ok: true };
  });
}

export async function markNotificationsReadAction(input: unknown): Promise<ActionResult> {
  return runAction("mark_notifications_read", async () => {
    const actor = await requireActionActor("community.read");
    const { ids } = parseInput(z.strictObject({ ids: z.array(z.uuid()).max(100).optional() }), input);
    await markNotificationsRead(actor, ids);
    revalidatePath(`${base(actor)}/notificacoes`);
    return { ok: true };
  });
}

export async function notificationPrefsAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("notification_prefs", async () => {
    const actor = await requireActionActor("community.read");
    // Checkboxes list the types the person wants; everything else is muted.
    const wanted = new Set(form.getAll("wanted").map(String));
    await setMutedTypes(
      actor,
      NOTIFICATION_TYPES.map(([t]) => t).filter((t) => !wanted.has(t)),
    );
    return { ok: true, message: "Preferências salvas." };
  });
}

// --- Notifications on this phone or computer (Web Push) -------------------------------------------

const endpointSchema = z.strictObject({ endpoint: z.url().max(2048) });

/** Whether this device shows the signed-in person's notifications (it may belong to someone who signed out). */
export async function pushStatusAction(input: unknown): Promise<ActionResult<{ active: boolean }>> {
  return runAction("push_status", async () => {
    const actor = await requireActionActor("community.read");
    const { endpoint } = parseInput(endpointSchema, input);
    return { ok: true, data: { active: await isPushDeviceActive(actor, endpoint) } };
  });
}

export async function savePushAction(input: unknown): Promise<ActionResult> {
  return runAction("push_save", async () => {
    const actor = await requireActionActor("community.read");
    const { subscription } = parseInput(z.strictObject({ subscription: z.unknown() }), input);
    await savePushSubscription(actor, subscription, await getLocale());
    return { ok: true };
  });
}

export async function removePushAction(input: unknown): Promise<ActionResult> {
  return runAction("push_remove", async () => {
    const actor = await requireActionActor("community.read");
    const { endpoint } = parseInput(endpointSchema, input);
    await removePushSubscription(actor, endpoint);
    return { ok: true };
  });
}

export async function testPushAction(): Promise<ActionResult<{ devices: number }>> {
  return runAction("push_test", async () => {
    const actor = await requireActionActor("community.read");
    return { ok: true, data: { devices: await sendTestPush(actor) } };
  });
}
