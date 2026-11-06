import { z } from "zod";

export const startSessionSchema = z.strictObject({ dayId: z.uuid() });
export const sessionIdSchema = z.strictObject({ sessionId: z.uuid() });

export const logSetSchema = z.strictObject({
  sessionId: z.uuid(),
  programExerciseId: z.uuid(),
  /** The prescribed exercise or its variation. */
  exerciseId: z.uuid(),
  setNumber: z.number().int().min(1).max(30),
  reps: z.number().int().min(0, "Repetições inválidas.").max(200, "Repetições inválidas."),
  loadKg: z
    .number()
    .min(0, "Carga inválida.")
    .max(1000, "Carga inválida.")
    .nullable()
    .transform((v) => (v == null ? null : Math.round(v * 100) / 100)),
});

export const removeSetSchema = z.strictObject({
  sessionId: z.uuid(),
  programExerciseId: z.uuid(),
  setNumber: z.number().int().min(1).max(30),
});

export const finishSessionSchema = z.strictObject({
  sessionId: z.uuid(),
  effort: z.number().int().min(1).max(10).nullable(),
  notes: z
    .string()
    .trim()
    .max(500, "Use no máximo 500 caracteres.")
    .nullable()
    .transform((v) => (v ? v : null)),
});

export const historyCursorSchema = z.object({
  before: z.iso.datetime({ offset: true }).optional().catch(undefined),
});

/** Estimated one-rep max (Epley). Used to compare sets done with different reps. */
export function estimatedOneRepMax(loadKg: number, reps: number): number {
  if (reps <= 0 || loadKg <= 0) return 0;
  if (reps === 1) return loadKg;
  return Math.round(loadKg * (1 + reps / 30) * 100) / 100;
}

export const EFFORT_LABEL: Record<number, string> = {
  1: "Muito leve",
  2: "Leve",
  3: "Leve",
  4: "Moderado",
  5: "Moderado",
  6: "Um pouco difícil",
  7: "Difícil",
  8: "Muito difícil",
  9: "Quase no limite",
  10: "No limite",
};
