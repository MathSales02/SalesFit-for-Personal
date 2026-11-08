/**
 * Prepares and checks a hosted bucket for the app's upload flow:
 *   1. sets CORS so the site (APP_URL) may POST uploads and GET media from the browser;
 *   2. uploads a tiny file through a signed form (as the app does), checks the size limit
 *      is enforced, reads it back through a signed URL, checks CORS, then deletes it.
 *
 *   railway run --service web -- npx tsx scripts/storage-check.ts
 *
 * Uses S3_* and APP_URL from the environment. Prints results only, never credentials.
 */
import { DeleteObjectCommand, GetBucketCorsCommand, GetObjectCommand, PutBucketCorsCommand, S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const e = process.env;
for (const k of ["APP_URL", "S3_ENDPOINT", "S3_PUBLIC_ENDPOINT", "S3_REGION", "S3_BUCKET", "S3_ACCESS_KEY", "S3_SECRET_KEY"]) {
  if (!e[k]) {
    console.error(`missing ${k}`);
    process.exit(1);
  }
}
const origin = new URL(e.APP_URL!).origin;
const Bucket = e.S3_BUCKET!;
const s3 = new S3Client({
  endpoint: e.S3_PUBLIC_ENDPOINT,
  region: e.S3_REGION,
  forcePathStyle: true, // same as the app (src/server/storage/s3.ts)
  credentials: { accessKeyId: e.S3_ACCESS_KEY!, secretAccessKey: e.S3_SECRET_KEY! },
});

const ok = (label: string, pass: boolean, extra = "") => console.log(`${pass ? "OK  " : "FAIL"} ${label}${extra ? ` (${extra})` : ""}`);

async function main() {
  await s3.send(
    new PutBucketCorsCommand({
      Bucket,
      CORSConfiguration: {
        CORSRules: [{ AllowedOrigins: [origin], AllowedMethods: ["POST", "GET", "HEAD"], AllowedHeaders: ["*"], MaxAgeSeconds: 3600 }],
      },
    }),
  );
  const cors = await s3.send(new GetBucketCorsCommand({ Bucket }));
  ok("CORS saved", (cors.CORSRules ?? []).some((r) => r.AllowedOrigins?.includes(origin)), origin);

  const Key = `healthcheck/${Date.now()}.txt`;
  const post = await createPresignedPost(s3, {
    Bucket,
    Key,
    Expires: 300,
    Conditions: [
      ["content-length-range", 1, 64],
      ["eq", "$Content-Type", "text/plain"],
    ],
    Fields: { "Content-Type": "text/plain" },
  });
  const form = (body: string) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(post.fields)) f.append(k, v);
    f.append("file", new Blob([body], { type: "text/plain" }));
    return f;
  };

  const preflight = await fetch(post.url, {
    method: "OPTIONS",
    headers: { Origin: origin, "Access-Control-Request-Method": "POST" },
  });
  const allow = preflight.headers.get("access-control-allow-origin");
  ok("browser may POST (preflight)", allow === origin || allow === "*", `status ${preflight.status}, allow-origin ${allow}`);

  const tooBig = await fetch(post.url, { method: "POST", body: form("x".repeat(200)), headers: { Origin: origin } });
  ok("size limit enforced", tooBig.status >= 400, `status ${tooBig.status}`);

  const up = await fetch(post.url, { method: "POST", body: form("cadenciafit"), headers: { Origin: origin } });
  ok("signed form upload", up.status >= 200 && up.status < 300, `status ${up.status}`);
  ok("upload response readable by the site", up.headers.get("access-control-allow-origin") === origin || up.headers.get("access-control-allow-origin") === "*");

  const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket, Key }), { expiresIn: 300 });
  const get = await fetch(url, { headers: { Origin: origin } });
  ok("signed read", get.ok && (await get.text()) === "cadenciafit", `status ${get.status}`);

  const anon = await fetch(`${new URL(post.url).origin}/${Bucket}/${Key}`);
  ok("private without signature", anon.status === 403 || anon.status === 401 || anon.status === 404, `status ${anon.status}`);

  await s3.send(new DeleteObjectCommand({ Bucket, Key }));
  console.log("test file deleted");
}

main().catch((err: unknown) => {
  console.error("storage check failed:", err instanceof Error ? `${err.name}: ${err.message}` : err);
  process.exit(1);
});
