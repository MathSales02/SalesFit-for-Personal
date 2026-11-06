/**
 * Creates the private media bucket if it does not exist.
 *   npm run storage:init            -> S3_BUCKET
 *   npm run storage:init -- --test  -> TEST_S3_BUCKET
 * No bucket policy is set, so objects stay private: reads need a presigned URL.
 */
import { CreateBucketCommand, HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";

export async function ensureBucket(opts: { endpoint: string; region: string; accessKey: string; secretKey: string; bucket: string }) {
  const s3 = new S3Client({
    endpoint: opts.endpoint,
    region: opts.region,
    forcePathStyle: true,
    credentials: { accessKeyId: opts.accessKey, secretAccessKey: opts.secretKey },
  });
  try {
    await s3.send(new HeadBucketCommand({ Bucket: opts.bucket }));
    return "exists";
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: opts.bucket }));
    return "created";
  } finally {
    s3.destroy();
  }
}

const isCli = process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/storage-init.ts");
if (isCli) {
  try {
    process.loadEnvFile();
  } catch {
    /* env may come from the environment */
  }
  const e = process.env;
  const bucket = process.argv.includes("--test") ? e.TEST_S3_BUCKET : e.S3_BUCKET;
  if (!e.S3_ENDPOINT || !e.S3_ACCESS_KEY || !e.S3_SECRET_KEY || !bucket) {
    console.error("Set S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY and S3_BUCKET (or TEST_S3_BUCKET).");
    process.exit(1);
  }
  ensureBucket({ endpoint: e.S3_ENDPOINT, region: e.S3_REGION ?? "us-east-1", accessKey: e.S3_ACCESS_KEY, secretKey: e.S3_SECRET_KEY, bucket })
    .then((r) => console.log(`bucket ${bucket}: ${r}`))
    .catch((err: unknown) => {
      console.error("storage init failed:", err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
