import { z } from "zod";
import { canonicalVideoUrl } from "../exercise-video";

export const MUSCLE_GROUPS = [
  ["chest", "Peito"],
  ["back", "Costas"],
  ["shoulders", "Ombros"],
  ["biceps", "Bíceps"],
  ["triceps", "Tríceps"],
  ["forearms", "Antebraço"],
  ["core", "Abdômen e Core"],
  ["quadriceps", "Quadríceps"],
  ["hamstrings", "Posterior de coxa"],
  ["glutes", "Glúteos"],
  ["calves", "Panturrilhas"],
  ["full_body", "Full Body"],
  ["cardio", "Cardio"],
  ["mobility", "Mobilidade"],
] as const;

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number][0];
export const MUSCLE_GROUP_LABEL = Object.fromEntries(MUSCLE_GROUPS) as Record<MuscleGroup, string>;
const groupKeys = MUSCLE_GROUPS.map(([k]) => k) as [MuscleGroup, ...MuscleGroup[]];

export const DIFFICULTIES = [
  ["beginner", "Iniciante"],
  ["intermediate", "Intermediário"],
  ["advanced", "Avançado"],
] as const;
export type Difficulty = (typeof DIFFICULTIES)[number][0];
export const DIFFICULTY_LABEL = Object.fromEntries(DIFFICULTIES) as Record<Difficulty, string>;

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
  /** Comma-separated group keys (the form keeps them in one hidden field). */
  secondaryMuscles: z
    .string()
    .max(200)
    .default("")
    .transform((v) => [...new Set(v.split(",").map((x) => x.trim()).filter(Boolean))])
    .pipe(z.array(z.enum(groupKeys, { error: "Grupo muscular inválido." })).max(6, "Escolha no máximo 6 grupos secundários.")),
  difficulty: z
    .enum(["", ...DIFFICULTIES.map(([k]) => k)] as ["", Difficulty, ...Difficulty[]])
    .default("")
    .transform((v) => (v === "" ? null : v)),
  videoUrl: z
    .string()
    .trim()
    .max(200)
    .default("")
    .transform((v, ctx) => {
      if (v === "") return null;
      const url = canonicalVideoUrl(v);
      if (!url) {
        ctx.addIssue({ code: "custom", message: "Use o link de um vídeo do YouTube." });
        return z.NEVER;
      }
      return url;
    }),
  tips: optionalText(2000).default(null),
  commonMistakes: optionalText(2000).default(null),
};

export const createExerciseSchema = z.strictObject(exerciseFields);
export const updateExerciseSchema = z.strictObject({ exerciseId: z.uuid(), ...exerciseFields });
/** Admin: the demonstration video of a platform exercise (empty clears it). */
export const platformVideoSchema = z.strictObject({ exerciseId: z.uuid(), videoUrl: exerciseFields.videoUrl });
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
