import { z } from "zod";
import { emailSchema, passwordSchema } from "./auth";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use no máximo ${max} caracteres.`)
    .transform((v) => (v === "" ? null : v));

export const inviteStudentSchema = z.strictObject({ email: emailSchema });

export const invitationIdSchema = z.strictObject({ invitationId: z.uuid() });

const inviteToken = z.string().regex(/^[A-Za-z0-9_-]{43}$/, "Convite inválido.");

export const acceptInviteNewAccountSchema = z.strictObject({
  token: inviteToken,
  displayName: z
    .string()
    .trim()
    .min(2, "Informe seu nome.")
    .max(80, "Use no máximo 80 caracteres.")
    .regex(/^[\p{L}\p{M}' .-]+$/u, "Use apenas letras, espaços e hífens."),
  password: passwordSchema,
  acceptTerms: z.literal("on", { error: "É preciso aceitar os termos e a política de privacidade." }),
});

export const acceptInviteExistingSchema = z.strictObject({ token: inviteToken });

export const studentProfileSchema = z.strictObject({
  memberId: z.uuid(),
  goal: optionalText(500),
  fitnessLevel: z
    .enum(["", "beginner", "intermediate", "advanced"])
    .transform((v) => (v === "" ? null : v)),
  weeklyFrequency: z
    .string()
    .transform((v) => (v === "" ? null : Number(v)))
    .pipe(z.number().int().min(1, "Entre 1 e 7.").max(7, "Entre 1 e 7.").nullable()),
  trainerNotes: optionalText(2000),
});

export const healthRecordFields = {
  restrictions: optionalText(2000),
  injuries: optionalText(2000),
  medicalNotes: optionalText(2000),
};

export const trainerHealthSchema = z.strictObject({ memberId: z.uuid(), ...healthRecordFields });
export const ownHealthSchema = z.strictObject(healthRecordFields);

export const memberStatusSchema = z.strictObject({
  memberId: z.uuid(),
  status: z.enum(["active", "suspended", "archived"]),
});

export const healthConsentSchema = z.strictObject({ decision: z.enum(["grant", "withdraw"]) });

export const studentListQuerySchema = z.object({
  status: z.enum(["active", "suspended", "archived"]).catch("active"),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});

export const FITNESS_LEVEL_LABEL: Record<string, string> = {
  beginner: "Iniciante",
  intermediate: "Intermediário",
  advanced: "Avançado",
};

export const MEMBER_STATUS_LABEL: Record<string, string> = {
  invited: "Convidado",
  active: "Ativo",
  suspended: "Suspenso",
  archived: "Arquivado",
};
