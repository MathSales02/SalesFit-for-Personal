import "server-only";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../env";

/**
 * Private object storage (S3 API). Two clients: one for server-to-storage calls,
 * one that signs URLs with the origin the browser can reach. Nothing here makes
 * an object public; every browser access goes through a short-lived signature.
 */
const g = globalThis as unknown as { __cadenciaS3?: { internal: S3Client; signer: S3Client } };

function clients() {
  if (!g.__cadenciaS3) {
    const e = env();
    const base = {
      region: e.S3_REGION,
      forcePathStyle: true,
      credentials: { accessKeyId: e.S3_ACCESS_KEY, secretAccessKey: e.S3_SECRET_KEY },
    };
    g.__cadenciaS3 = {
      internal: new S3Client({ ...base, endpoint: e.S3_ENDPOINT }),
      signer: new S3Client({ ...base, endpoint: e.S3_PUBLIC_ENDPOINT }),
    };
  }
  return g.__cadenciaS3;
}

const bucket = () => env().S3_BUCKET;

export const UPLOAD_URL_TTL_SEC = 10 * 60;
export const PLAYBACK_URL_TTL_SEC = 15 * 60;

/** Signed form upload: exact key, exact content type and a hard size ceiling, enforced by the storage server. */
export function presignUpload(key: string, contentType: string, maxBytes: number) {
  return createPresignedPost(clients().signer, {
    Bucket: bucket(),
    Key: key,
    Expires: UPLOAD_URL_TTL_SEC,
    Conditions: [
      ["content-length-range", 1, maxBytes],
      ["eq", "$Content-Type", contentType],
    ],
    Fields: { "Content-Type": contentType },
  });
}

export async function headObject(key: string) {
  try {
    const h = await clients().internal.send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return { size: h.ContentLength ?? 0, contentType: h.ContentType ?? "" };
  } catch (err) {
    if ((err as { name?: string }).name === "NotFound" || (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null;
    throw err;
  }
}

/** First bytes of an object, used to check the real file signature. */
export async function readHead(key: string, bytes = 64): Promise<Uint8Array> {
  const res = await clients().internal.send(new GetObjectCommand({ Bucket: bucket(), Key: key, Range: `bytes=0-${bytes - 1}` }));
  return res.Body ? new Uint8Array(await res.Body.transformToByteArray()) : new Uint8Array();
}

/** Whole object, refusing anything larger than maxBytes (protects memory). */
export async function getObjectBytes(key: string, maxBytes: number): Promise<Uint8Array> {
  const res = await clients().internal.send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  if ((res.ContentLength ?? 0) > maxBytes) throw new Error("object larger than allowed");
  return res.Body ? new Uint8Array(await res.Body.transformToByteArray()) : new Uint8Array();
}

export async function putObject(key: string, body: Uint8Array, contentType: string) {
  await clients().internal.send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }));
}

export async function deleteObject(key: string) {
  await clients().internal.send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

/** Short-lived read URL. Call only after checking the viewer may see the asset. */
export function presignPlayback(key: string, contentType: string) {
  return getSignedUrl(
    clients().signer,
    new GetObjectCommand({ Bucket: bucket(), Key: key, ResponseContentType: contentType, ResponseContentDisposition: "inline" }),
    { expiresIn: PLAYBACK_URL_TTL_SEC },
  );
}

/** Origin of the storage endpoint the browser talks to (for the CSP). */
export function storageOrigin(): string {
  return new URL(env().S3_PUBLIC_ENDPOINT).origin;
}
