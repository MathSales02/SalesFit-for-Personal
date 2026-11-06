import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use no máximo ${max} caracteres.`)
    .nullish()
    .transform((v) => (v ? v : null));

export const MAX_DAYS = 14;
export const MAX_EXERCISES_PER_DAY = 40;

export const programInfoSchema = z.strictObject({
  name: z.string().trim().min(2, "Dê um nome ao programa.").max(80, "Use no máximo 80 caracteres."),
  description: optionalText(1000),
  isTemplate: z
    .literal("on")
    .optional()
    .transform((v) => v === "on"),
});

export const updateProgramInfoSchema = programInfoSchema.extend({ programId: z.uuid() });
export const programIdSchema = z.strictObject({ programId: z.uuid() });

export const prescribedExerciseSchema = z.strictObject({
  exerciseId: z.uuid(),
  variationExerciseId: z.uuid().nullish().transform((v) => v ?? null),
  sets: z.number().int().min(1, "Mínimo de 1 série.").max(20, "Máximo de 20 séries."),
  reps: z.string().trim().min(1, "Informe as repetições.").max(20, "Use no máximo 20 caracteres."),
  load: optionalText(30),
  restSeconds: z.number().int().min(0).max(900, "Descanso máximo de 15 minutos.").nullish().transform((v) => v ?? null),
  tempo: optionalText(15),
  notes: optionalText(500),
});

export const programDaySchema = z.strictObject({
  name: z.string().trim().min(1, "Dê um nome ao dia.").max(60, "Use no máximo 60 caracteres."),
  notes: optionalText(500),
  exercises: z.array(prescribedExerciseSchema).max(MAX_EXERCISES_PER_DAY, `No máximo ${MAX_EXERCISES_PER_DAY} exercícios por dia.`),
});

export const saveDraftSchema = z.strictObject({
  programId: z.uuid(),
  days: z.array(programDaySchema).min(1, "Adicione pelo menos um dia.").max(MAX_DAYS, `No máximo ${MAX_DAYS} dias.`),
});

export type DraftDay = z.infer<typeof programDaySchema>;
export type DraftInput = z.input<typeof programDaySchema>;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");

export const assignProgramSchema = z
  .strictObject({
    programId: z.uuid(),
    memberIds: z.array(z.uuid()).min(1, "Escolha pelo menos um aluno.").max(100),
    startsOn: isoDate,
    endsOn: isoDate.nullish().transform((v) => v ?? null),
  })
  .refine((v) => !v.endsOn || v.endsOn >= v.startsOn, { path: ["endsOn"], message: "O fim deve ser depois do início." });

export const endAssignmentSchema = z.strictObject({ assignmentId: z.uuid() });
