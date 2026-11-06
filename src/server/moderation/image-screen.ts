import "server-only";
import * as tf from "@tensorflow/tfjs";
import * as nsfwjs from "nsfwjs";
import sharp from "sharp";

/**
 * On-server NSFW screening for community images (open-source nsfwjs model,
 * MobileNetV2; no external service, no per-image cost). The model is a first
 * line of defence, not a guarantee: reports and trainer moderation back it up.
 *
 * Decision bands (probabilities 0..1):
 *  - block:  porn + hentai >= 0.70            -> refused, file deleted, security event
 *  - review: porn + hentai >= 0.25, or sexy >= 0.45 -> held for the trainer
 *            (gym photos without a shirt often score as "sexy"; a person decides)
 *  - clear:  everything else
 */
export const BLOCK_EXPLICIT = 0.7;
export const REVIEW_EXPLICIT = 0.25;
export const REVIEW_SUGGESTIVE = 0.45;

export type ScreenResult = { decision: "clear" | "review" | "block"; scores: Record<string, number> };

const g = globalThis as unknown as { __cadenciaNsfw?: Promise<nsfwjs.NSFWJS> };

function model() {
  g.__cadenciaNsfw ??= (async () => {
    await tf.setBackend("cpu");
    tf.enableProdMode();
    return nsfwjs.load("MobileNetV2");
  })();
  return g.__cadenciaNsfw;
}

export function decide(scores: Record<string, number>): ScreenResult["decision"] {
  const explicit = (scores.Porn ?? 0) + (scores.Hentai ?? 0);
  if (explicit >= BLOCK_EXPLICIT) return "block";
  if (explicit >= REVIEW_EXPLICIT || (scores.Sexy ?? 0) >= REVIEW_SUGGESTIVE) return "review";
  return "clear";
}

export async function screenImage(image: Uint8Array): Promise<ScreenResult> {
  const m = await model();
  const { data, info } = await sharp(image).resize(224, 224, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const input = tf.tensor3d(new Uint8Array(data), [info.height, info.width, 3], "int32");
  try {
    const predictions = await m.classify(input);
    const scores = Object.fromEntries(predictions.map((p) => [p.className, Math.round(p.probability * 1000) / 1000]));
    return { decision: decide(scores), scores };
  } finally {
    input.dispose();
  }
}
