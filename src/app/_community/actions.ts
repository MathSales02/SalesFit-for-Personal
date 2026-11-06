"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import {
  addCommentSchema,
  commentIdSchema,
  createPostSchema,
  feedCursorSchema,
  moderatePostSchema,
  postIdSchema,
  reportSchema,
  resolveReportSchema,
  settingsSchema,
  shareWorkoutSchema,
} from "@/lib/validation/community";
import { requestPhotoUploadSchema } from "@/lib/validation/progress";
import {
  addComment,
  createPost,
  listFeed,
  moderatePost,
  removeComment,
  removePost,
  report,
  resolveReport,
  setBlock,
  setFollow,
  shareWorkout,
  toggleLike,
  updateSettings,
  type FeedCursor,
  type FeedPost,
} from "@/server/community/service";
import { parseForm, parseInput, runAction } from "@/server/http/action";
import { requestMeta, requireActionActor } from "@/server/http/next";
import { completeUpload, requestUpload, type UploadTicket } from "@/server/media/service";

export async function createPostAction(input: unknown): Promise<ActionResult<{ postId: string; status: string }>> {
  return runAction("create_post", async () => {
    const actor = await requireActionActor("community.post");
    const parsed = createPostSchema.safeParse(input);
    if (!parsed.success) return { ok: false, code: "VALIDATION", message: parsed.error.issues[0]?.message ?? "Dados inválidos." };
    const res = await createPost(actor, parsed.data, await requestMeta());
    return { ok: true, data: res, message: res.status === "pending_review" ? "Seu post vai aparecer depois que o treinador revisar." : "Publicado." };
  });
}

export async function requestPostImageAction(input: unknown): Promise<ActionResult<UploadTicket>> {
  return runAction("request_post_image", async () => {
    const actor = await requireActionActor("community.post");
    return { ok: true, data: await requestUpload(actor, parseInput(requestPhotoUploadSchema, input), await requestMeta(), "community") };
  });
}

export async function completePostImageAction(input: unknown): Promise<ActionResult<{ moderation?: string }>> {
  return runAction("complete_post_image", async () => {
    const actor = await requireActionActor("community.post");
    const { assetId } = parseInput(z.strictObject({ assetId: z.uuid() }), input);
    const res = await completeUpload(actor, assetId, await requestMeta());
    return { ok: true, data: { moderation: res.moderation } };
  });
}

export async function loadMoreAction(input: unknown): Promise<ActionResult<{ posts: FeedPost[]; nextCursor: FeedCursor }>> {
  return runAction("load_more", async () => {
    const actor = await requireActionActor("community.read");
    const { scope, cursor, authorMemberId } = parseInput(
      z.strictObject({ scope: z.enum(["all", "following"]), cursor: feedCursorSchema, authorMemberId: z.uuid().optional() }),
      input,
    );
    const res = await listFeed(actor, { scope, cursor, authorMemberId });
    return { ok: true, data: { posts: res.posts, nextCursor: res.nextCursor } };
  });
}

export async function toggleLikeAction(input: unknown): Promise<ActionResult<{ liked: boolean; likeCount: number }>> {
  return runAction("toggle_like", async () => {
    const actor = await requireActionActor("community.read");
    return { ok: true, data: await toggleLike(actor, parseInput(postIdSchema, input).postId) };
  });
}

export async function removePostAction(input: unknown): Promise<ActionResult> {
  return runAction("remove_post", async () => {
    const actor = await requireActionActor("community.read");
    await removePost(actor, parseInput(postIdSchema, input).postId, await requestMeta());
    return { ok: true };
  });
}

export async function removeCommentAction(input: unknown): Promise<ActionResult> {
  return runAction("remove_comment", async () => {
    const actor = await requireActionActor("community.read");
    await removeComment(actor, parseInput(commentIdSchema, input).commentId, await requestMeta());
    return { ok: true };
  });
}

export async function addCommentAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("add_comment", async () => {
    const actor = await requireActionActor("community.post");
    await addComment(actor, parseForm(addCommentSchema, form), await requestMeta());
    return { ok: true, message: "Comentário publicado." };
  });
}

export async function reportAction(input: unknown): Promise<ActionResult> {
  return runAction("report", async () => {
    const actor = await requireActionActor("community.read");
    await report(actor, parseInput(reportSchema, input), await requestMeta());
    return { ok: true, message: "Denúncia enviada. O treinador vai analisar." };
  });
}

export async function followAction(input: unknown): Promise<ActionResult> {
  return runAction("follow", async () => {
    const actor = await requireActionActor("community.read");
    const { memberId, follow } = parseInput(z.strictObject({ memberId: z.uuid(), follow: z.boolean() }), input);
    await setFollow(actor, memberId, follow);
    return { ok: true };
  });
}

export async function blockAction(input: unknown): Promise<ActionResult> {
  return runAction("block", async () => {
    const actor = await requireActionActor("community.read");
    const { memberId, block } = parseInput(z.strictObject({ memberId: z.uuid(), block: z.boolean() }), input);
    await setBlock(actor, memberId, block, await requestMeta());
    return { ok: true };
  });
}

export async function shareWorkoutAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("share_workout", async () => {
    const actor = await requireActionActor("community.post");
    const res = await shareWorkout(actor, parseForm(shareWorkoutSchema, form), await requestMeta());
    revalidatePath("/aluno/comunidade");
    return { ok: true, message: res.status === "pending_review" ? "Enviado! Aparece depois da revisão do treinador." : "Compartilhado na comunidade." };
  });
}

export async function moderatePostAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("moderate_post", async () => {
    const actor = await requireActionActor("community.moderate");
    const { postId, decision } = parseForm(moderatePostSchema, form);
    await moderatePost(actor, postId, decision, await requestMeta());
    revalidatePath("/treinador/comunidade/moderacao");
    return { ok: true, message: decision === "approve" ? "Post aprovado." : "Post removido." };
  });
}

export async function resolveReportAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("resolve_report", async () => {
    const actor = await requireActionActor("community.moderate");
    const { reportId, decision } = parseForm(resolveReportSchema, form);
    await resolveReport(actor, reportId, decision, await requestMeta());
    revalidatePath("/treinador/comunidade/moderacao");
    return { ok: true, message: decision === "dismiss" ? "Denúncia arquivada." : "Conteúdo removido." };
  });
}

export async function updateSettingsAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("community_settings", async () => {
    const actor = await requireActionActor("community.moderate");
    await updateSettings(actor, parseForm(settingsSchema, form), await requestMeta());
    revalidatePath("/treinador/comunidade/moderacao");
    return { ok: true, message: "Configurações salvas." };
  });
}
