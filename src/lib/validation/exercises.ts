import { z } from "zod";

export const MUSCLE_GROUPS = [
  ["chest", "Peito"],
  ["back", "Costas"],
  ["shoulders", "Ombros"],
  ["biceps", "Bíceps"],
  ["triceps", "Tríceps"],
  ["forearms", "Antebraço"],
  ["core", "Abdômen e core"],
  ["quadriceps", "Quadríceps"],
  ["hamstrings", "Posteriores de coxa"],
  ["glutes", "Glúteos"],
  ["calves", "Panturrilhas"],
  ["full_body", "Corpo inteiro"],
  ["cardio", "Cardio"],
  ["mobility", "Mobilidade"],
] as const;

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number][0];
export const MUSCLE_GROUP_LABEL = Object.fromEntries(MUSCLE_GROUPS) as Record<MuscleGroup, string>;
const groupKeys = MUSCLE_GROUPS.map(([k]) => k) as [MuscleGroup, ...MuscleGroup[]];

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use no máximo ${max} caracteres.`)
    .transform((v) => (v === "" ? null : v));

const exerciseFields = {
  name: z.string().trim().min(2, "Informe o nome do exercício.").max(80, "Use no máximo 80 caracteres."),
  muscleGroup: z.enum(groupKeys, { error: "Escolha o grupo muscular." }),
  equipment: optionalText(80),
  description: optionalText(1000),
  instructions: optionalText(3000),
};

export const createExerciseSchema = z.strictObject(exerciseFields);
export const updateExerciseSchema = z.strictObject({ exerciseId: z.uuid(), ...exerciseFields });
export const exerciseIdSchema = z.strictObject({ exerciseId: z.uuid() });

export const exerciseListQuerySchema = z.object({
  q: z.string().trim().max(60).catch(""),
  group: z.enum(groupKeys).optional().catch(undefined),
});

export const requestUploadSchema = z.strictObject({
  contentType: z.string().max(100),
  sizeBytes: z.number().int().positive(),
});

export const attachVideoSchema = z.strictObject({ exerciseId: z.uuid(), assetId: z.uuid() });
