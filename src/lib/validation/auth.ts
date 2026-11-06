import { z } from "zod";

/**
 * Validation schemas shared by forms and the server. The server always
 * re-validates; client-side use is only for faster feedback.
 * Objects are strict: unexpected fields are rejected (prevents mass assignment).
 */

// A short list of the most common passwords. Length matters more than
// composition rules (NIST SP 800-63B), so we only enforce length plus this list.
const COMMON_PASSWORDS = new Set([
  "1234567890", "12345678910", "123456789a", "qwertyuiop", "password123", "senha12345",
  "senha123456", "abcdefghij", "1q2w3e4r5t", "iloveyou12", "0123456789", "brasil1234",
  "cadencia123", "academia123", "treino12345", "palmeiras1", "flamengo12", "corinthians",
]);

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "E-mail muito longo.")
  .pipe(z.email("Informe um e-mail válido."));

export const passwordSchema = z
  .string()
  .min(10, "Use pelo menos 10 caracteres.")
  .max(128, "Use no máximo 128 caracteres.")
  .refine((p) => !COMMON_PASSWORDS.has(p.toLowerCase()), "Essa senha é muito comum. Escolha outra.");

const displayName = z
  .string()
  .trim()
  .min(2, "Informe seu nome.")
  .max(80, "Use no máximo 80 caracteres.")
  // Letters (any language), spaces, apostrophes, dots and hyphens.
  .regex(/^[\p{L}\p{M}' .-]+$/u, "Use apenas letras, espaços e hífens.");

export const registerTrainerSchema = z.strictObject({
  displayName,
  email: emailSchema,
  password: passwordSchema,
  workspaceName: z.string().trim().min(2, "Informe o nome da sua consultoria.").max(80, "Use no máximo 80 caracteres."),
  acceptTerms: z.literal("on", { error: "É preciso aceitar os termos e a política de privacidade." }),
});

export const loginSchema = z.strictObject({
  email: emailSchema,
  // No strength rules on login: just bound the input size.
  password: z.string().min(1, "Informe sua senha.").max(128),
});

export const forgotPasswordSchema = z.strictObject({ email: emailSchema });

const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, "Link inválido.");

export const resetPasswordSchema = z
  .strictObject({ token: tokenSchema, password: passwordSchema, confirmPassword: z.string().max(128) })
  .refine((v) => v.password === v.confirmPassword, { path: ["confirmPassword"], message: "As senhas não coincidem." });

export const verifyEmailSchema = z.strictObject({ token: tokenSchema });

export const changePasswordSchema = z
  .strictObject({ currentPassword: z.string().min(1).max(128), password: passwordSchema, confirmPassword: z.string().max(128) })
  .refine((v) => v.password === v.confirmPassword, { path: ["confirmPassword"], message: "As senhas não coincidem." });

export const revokeSessionSchema = z.strictObject({ sessionId: z.uuid() });
