import { z } from "zod";

const text = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label}: no máximo ${max} caracteres.`)
    .transform((v) => (v === "" ? null : v));

export const createPostSchema = z.strictObject({
  body: text(2000, "Texto"),
  imageAssetId: z.uuid().nullish().transform((v) => v ?? null),
  announcement: z.boolean().optional().default(false),
});

export const shareWorkoutSchema = z.strictObject({
  sessionId: z.uuid(),
  body: z
    .string()
    .trim()
    .max(2000)
    .transform((v) => (v === "" ? null : v)),
});

export const postIdSchema = z.strictObject({ postId: z.uuid() });
export const commentIdSchema = z.strictObject({ commentId: z.uuid() });
export const memberIdSchema = z.strictObject({ memberId: z.uuid() });

export const addCommentSchema = z.strictObject({
  postId: z.uuid(),
  parentCommentId: z
    .string()
    .optional()
    .transform((v) => (v ? v : null))
    .pipe(z.uuid().nullable()),
  body: z.string().trim().min(1, "Escreva um comentário.").max(1000, "Use no máximo 1000 caracteres."),
});

export const REPORT_REASONS = [
  ["spam", "Spam ou propaganda"],
  ["harassment", "Assédio ou ofensa"],
  ["nudity", "Nudez ou conteúdo sexual"],
  ["hate", "Discurso de ódio"],
  ["unsafe_training", "Incentivo a treino perigoso"],
  ["other", "Outro motivo"],
] as const;

export const reportSchema = z.strictObject({
  targetType: z.enum(["post", "comment", "member", "message"]),
  targetId: z.uuid(),
  reason: z.enum(["spam", "harassment", "nudity", "hate", "unsafe_training", "other"]),
  details: text(500, "Detalhes"),
});

export const feedQuerySchema = z.object({
  scope: z.enum(["all", "following"]).catch("all"),
});

export const feedCursorSchema = z
  .strictObject({ createdAt: z.iso.datetime({ offset: true }), id: z.uuid() })
  .nullable();

export const settingsSchema = z.strictObject({
  communityEnabled: z.literal("on").optional().transform((v) => v === "on"),
  studentPostsRequireApproval: z.literal("on").optional().transform((v) => v === "on"),
  studentDirectMessages: z.literal("on").optional().transform((v) => v === "on"),
});

export const moderatePostSchema = z.strictObject({ postId: z.uuid(), decision: z.enum(["approve", "remove"]) });
export const resolveReportSchema = z.strictObject({ reportId: z.uuid(), decision: z.enum(["remove_content", "dismiss"]) });

/** Rough spam guard: count links in a text. */
export function countLinks(s: string | null): number {
  return s ? (s.match(/\bhttps?:\/\/|\bwww\.|\b[a-z0-9-]+\.(com|net|org|br|io|me|ly)\b/gi) ?? []).length : 0;
}
