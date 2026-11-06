import "server-only";
import sharp from "sharp";

export const PROCESSED_IMAGE_TYPE = "image/webp";
const MAX_SIDE = 1600;
/** Decompression-bomb guard: refuse images with more pixels than this before decoding. */
const MAX_INPUT_PIXELS = 40_000_000;

/**
 * Re-encodes an uploaded image. Decoding and re-encoding:
 *  - drops all metadata (EXIF, GPS location, camera serials) — sharp keeps none by default;
 *  - applies the EXIF orientation so the photo still looks right;
 *  - bounds the size (max 1600 px on the longest side);
 *  - discards anything that is not pixel data (e.g. appended scripts in polyglot files).
 * Throws when the bytes are not a decodable image.
 */
export async function reencodeImage(input: Uint8Array): Promise<Uint8Array> {
  const out = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" })
    .rotate()
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
  return new Uint8Array(out);
}
