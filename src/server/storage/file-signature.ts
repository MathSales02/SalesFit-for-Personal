/**
 * Allowed upload types and their real file signatures ("magic bytes"). The
 * browser-declared Content-Type is never trusted on its own: after upload the
 * server reads the first bytes and rejects files whose content does not match.
 */
export const UPLOAD_TYPES = {
  "video/mp4": { kind: "video", ext: "mp4", maxBytes: 200 * 1024 * 1024 },
  "video/quicktime": { kind: "video", ext: "mov", maxBytes: 200 * 1024 * 1024 },
  "video/webm": { kind: "video", ext: "webm", maxBytes: 200 * 1024 * 1024 },
  "image/jpeg": { kind: "image", ext: "jpg", maxBytes: 10 * 1024 * 1024 },
  "image/png": { kind: "image", ext: "png", maxBytes: 10 * 1024 * 1024 },
  "image/webp": { kind: "image", ext: "webp", maxBytes: 10 * 1024 * 1024 },
} as const;

export type UploadContentType = keyof typeof UPLOAD_TYPES;

export function isUploadContentType(v: string): v is UploadContentType {
  return Object.hasOwn(UPLOAD_TYPES, v);
}

const ascii = (b: Uint8Array, start: number, end: number) => String.fromCharCode(...b.slice(start, end));

/** True when the first bytes match the declared type. */
export function matchesSignature(contentType: UploadContentType, b: Uint8Array): boolean {
  switch (contentType) {
    case "video/mp4":
    case "video/quicktime":
      // ISO base media / QuickTime: box size (4 bytes) then "ftyp".
      return b.length >= 12 && ascii(b, 4, 8) === "ftyp";
    case "video/webm":
      return b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3;
    case "image/jpeg":
      return b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    case "image/png":
      return b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v);
    case "image/webp":
      return b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP";
  }
}
