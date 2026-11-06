import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { resolveActor } from "@/server/auth/actor";
import { closeDb } from "@/server/db/client";
import { runRetention } from "@/server/jobs/retention";
import { requestUpload } from "@/server/media/service";
import { createTrainer, loginAs, meta } from "./support/factories";

const owner = new Pool({ connectionString: process.env.TEST_DATABASE_MIGRATION_URL, max: 1 });
afterAll(async () => {
  await owner.end();
  await closeDb();
});

const count = async (sql: string, params: unknown[]) => Number((await owner.query<{ n: string }>(sql, params)).rows[0]!.n);

describe("data retention job", () => {
  it("keeps recent data and the audit log, prunes old data and abandoned uploads", async () => {
    const t = await createTrainer();
    const actor = (await resolveActor((await loginAs(t.email)).token))!;
    const ticket = await requestUpload(actor, { contentType: "video/mp4", sizeBytes: 1000 }, meta());
    const deleted: string[] = [];
    const del = async (k: string) => {
      deleted.push(k);
    };

    // Today: nothing of this user is old enough.
    await runRetention(owner, del);
    expect(await count("select count(*) n from sessions where user_id = $1", [t.userId])).toBeGreaterThan(0);
    expect(await count("select count(*) n from login_attempts where user_id = $1", [t.userId])).toBeGreaterThan(0);
    expect(await count("select count(*) n from media_assets where id = $1", [ticket.assetId])).toBe(1);

    // 400 days later.
    const later = new Date(Date.now() + 400 * 24 * 60 * 60 * 1000);
    const report = await runRetention(owner, del, later);
    expect(report.sessions).toBeGreaterThan(0);
    expect(await count("select count(*) n from sessions where user_id = $1", [t.userId])).toBe(0);
    expect(await count("select count(*) n from login_attempts where user_id = $1", [t.userId])).toBe(0);
    expect(await count("select count(*) n from auth_tokens where user_id = $1", [t.userId])).toBe(0);
    expect(await count("select count(*) n from media_assets where id = $1", [ticket.assetId])).toBe(0);
    expect(deleted.length).toBeGreaterThan(0);
    // Audit trail and the account itself stay.
    expect(await count("select count(*) n from audit_logs where actor_user_id = $1", [t.userId])).toBeGreaterThan(0);
    expect(await count("select count(*) n from users where id = $1", [t.userId])).toBe(1);
  });
});
