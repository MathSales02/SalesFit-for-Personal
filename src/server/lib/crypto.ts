import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "../env";

/** 256-bit URL-safe random token. */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Tokens are high-entropy, so a fast hash is enough; it lets us look them up by hash. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Keyed hash for personal data kept only for correlation (IPs, unknown emails). */
export function hmacPii(kind: "ip" | "email", value: string): string {
  return createHmac("sha256", env().PII_HASH_SECRET).update(`${kind}:${value}`).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** AES-256-GCM with a key derived from MFA_ENCRYPTION_KEY. Output: v1.iv.tag.ciphertext (base64url). */
function secretKey() {
  return createHash("sha256").update(`cadencia-mfa:${env().MFA_ENCRYPTION_KEY}`).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function decryptSecret(sealed: string): string {
  const [v, iv, tag, data] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("bad sealed secret");
  const decipher = createDecipheriv("aes-256-gcm", secretKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
