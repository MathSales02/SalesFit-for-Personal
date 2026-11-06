import { z } from "zod";

/** Accepts "72,5" or "72.5"; empty means "not measured". */
const decimal = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .max(8)
    .transform((v) => (v === "" ? null : Number(v.replace(",", "."))))
    .refine((v) => v === null || (Number.isFinite(v) && v >= min && v <= max), `${label}: entre ${min} e ${max}.`);

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");

export const MEASUREMENT_FIELDS = [
  ["weightKg", "Peso", "kg", 20, 400],
  ["bodyFatPct", "Gordura corporal", "%", 2, 70],
  ["waistCm", "Cintura", "cm", 30, 250],
  ["hipCm", "Quadril", "cm", 30, 250],
  ["chestCm", "Peito", "cm", 30, 250],
  ["armCm", "Braço", "cm", 10, 100],
  ["thighCm", "Coxa", "cm", 20, 150],
] as const;

export type MeasurementKey = (typeof MEASUREMENT_FIELDS)[number][0];

const fields = Object.fromEntries(MEASUREMENT_FIELDS.map(([k, label, , min, max]) => [k, decimal(min, max, label)])) as Record<
  MeasurementKey,
  ReturnType<typeof decimal>
>;

const measurementBase = z.strictObject({
  measuredOn: isoDate,
  ...fields,
  notes: z
    .string()
    .trim()
    .max(300, "Use no máximo 300 caracteres.")
    .transform((v) => (v === "" ? null : v)),
});

const atLeastOne = (v: Record<string, unknown>) => MEASUREMENT_FIELDS.some(([k]) => v[k] != null);

export const measurementSchema = measurementBase.refine(atLeastOne, { path: ["_form"], message: "Preencha pelo menos uma medida." });
export const trainerMeasurementSchema = measurementBase
  .extend({ memberId: z.uuid() })
  .refine(atLeastOne, { path: ["_form"], message: "Preencha pelo menos uma medida." });

export const measurementIdSchema = z.strictObject({ measurementId: z.uuid() });

export const PHOTO_POSES = [
  ["front", "Frente"],
  ["side", "Lado"],
  ["back", "Costas"],
  ["other", "Outra"],
] as const;
export const POSE_LABEL = Object.fromEntries(PHOTO_POSES) as Record<string, string>;

export const addPhotoSchema = z.strictObject({
  assetId: z.uuid(),
  takenOn: isoDate,
  pose: z.enum(["front", "side", "back", "other"]),
});
export const photoIdSchema = z.strictObject({ photoId: z.uuid() });
export const photoSharingSchema = z.strictObject({ photoId: z.uuid(), shared: z.enum(["1", "0"]) });
export const requestPhotoUploadSchema = z.strictObject({ contentType: z.string().max(100), sizeBytes: z.number().int().positive() });

/** Today in São Paulo as YYYY-MM-DD (dates in the future are refused). */
export function todayInBrazil(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}
