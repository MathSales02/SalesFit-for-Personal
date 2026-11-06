import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { resolveActor } from "@/server/auth/actor";
import { validateSessionToken } from "@/server/auth/session";
import { closeDb, db } from "@/server/db/client";
import { withTenant } from "@/server/db/context";
import { auditLogs, plans, sessions, subscriptions, workspaceMembers, workspaces } from "@/server/db/schema";
import { createStudent, createTrainer, loginAs } from "./support/factories";

afterAll(closeDb);

/** Postgres error code (drizzle wraps driver errors in .cause). */
async function pgError(p: Promise<unknown>): Promise<string | undefined> {
  return p.then(
    () => undefined,
    (e: { code?: string; cause?: { code?: string } }) => e.cause?.code ?? e.code ?? "unknown",
  );
}

describe("tenant isolation (row-level security)", () => {
  it("Trainer A cannot read Trainer B's students, even when pointing the query at B's workspace", async () => {
    const a = await createTrainer("A");
    const b = await createTrainer("B");
    await createStudent(b);

    const rows = await withTenant({ userId: a.userId, workspaceId: b.workspaceId }, (tx) =>
      tx.select().from(workspaceMembers).where(eq(workspaceMembers.workspaceId, b.workspaceId)),
    );
    expect(rows).toHaveLength(0);

    // Sanity check: B sees their own student.
    const own = await withTenant({ userId: b.userId, workspaceId: b.workspaceId }, (tx) =>
      tx.select().from(workspaceMembers).where(eq(workspaceMembers.role, "student")),
    );
    expect(own).toHaveLength(1);
  });

  it("Trainer A cannot add a student to Trainer B's workspace", async () => {
    const a = await createTrainer("A");
    const b = await createTrainer("B");
    const victim = await createTrainer("C");
    const code = await pgError(
      withTenant({ userId: a.userId, workspaceId: b.workspaceId }, (tx) =>
        tx.insert(workspaceMembers).values({ workspaceId: b.workspaceId, userId: victim.userId, role: "student" }),
      ),
    );
    expect(code).toBe("42501"); // insufficient_privilege: RLS WITH CHECK failed
  });

  it("Trainer A cannot rename or archive Trainer B's workspace", async () => {
    const a = await createTrainer("A");
    const b = await createTrainer("B");
    const updated = await withTenant({ userId: a.userId, workspaceId: b.workspaceId }, (tx) =>
      tx.update(workspaces).set({ name: "hacked" }).where(eq(workspaces.id, b.workspaceId)).returning(),
    );
    expect(updated).toHaveLength(0);
  });

  it("a student cannot promote themselves to trainer", async () => {
    const t = await createTrainer();
    const s = await createStudent(t);
    const updated = await withTenant({ userId: s.userId, workspaceId: t.workspaceId }, (tx) =>
      tx.update(workspaceMembers).set({ role: "trainer" }).where(eq(workspaceMembers.userId, s.userId)).returning(),
    );
    expect(updated).toHaveLength(0);
  });

  it("a student cannot add other students", async () => {
    const t = await createTrainer();
    const s = await createStudent(t);
    const other = await createTrainer("Other");
    const code = await pgError(
      withTenant({ userId: s.userId, workspaceId: t.workspaceId }, (tx) =>
        tx.insert(workspaceMembers).values({ workspaceId: t.workspaceId, userId: other.userId, role: "student" }),
      ),
    );
    expect(code).toBe("42501");
  });

  it("without a context, tenant tables return nothing (deny by default)", async () => {
    await createTrainer();
    expect(await db().select().from(workspaces)).toHaveLength(0);
    expect(await db().select().from(workspaceMembers)).toHaveLength(0);
    expect(await db().select().from(subscriptions)).toHaveLength(0);
  });

  it("tenant code cannot change billing status (only system jobs can)", async () => {
    const t = await createTrainer();
    const updated = await withTenant({ userId: t.userId, workspaceId: t.workspaceId }, (tx) =>
      tx.update(subscriptions).set({ status: "active" }).where(eq(subscriptions.workspaceId, t.workspaceId)).returning(),
    );
    expect(updated).toHaveLength(0);
    const [sub] = await withTenant({ userId: t.userId, workspaceId: t.workspaceId }, (tx) =>
      tx.select().from(subscriptions).where(eq(subscriptions.workspaceId, t.workspaceId)),
    );
    expect(sub!.status).toBe("trialing");
  });

  it("students cannot see the subscription of their trainer", async () => {
    const t = await createTrainer();
    const s = await createStudent(t);
    const rows = await withTenant({ userId: s.userId, workspaceId: t.workspaceId }, (tx) => tx.select().from(subscriptions));
    expect(rows).toHaveLength(0);
  });

  it("plans are read-only for non-admins", async () => {
    const t = await createTrainer();
    const updated = await withTenant({ userId: t.userId, workspaceId: t.workspaceId }, (tx) =>
      tx.update(plans).set({ priceCents: 0 }).returning(),
    );
    expect(updated).toHaveLength(0);
  });

  it("audit logs are append-only for the application role", async () => {
    const t = await createTrainer();
    const update = await pgError(
      withTenant({ userId: t.userId, workspaceId: t.workspaceId }, (tx) => tx.update(auditLogs).set({ action: "tampered" })),
    );
    const del = await pgError(withTenant({ userId: t.userId, workspaceId: t.workspaceId }, (tx) => tx.delete(auditLogs)));
    expect(update).toBe("42501");
    expect(del).toBe("42501");
  });

  it("Trainer A cannot read Trainer B's audit log", async () => {
    const a = await createTrainer("A");
    const b = await createTrainer("B");
    const rows = await withTenant({ userId: a.userId, workspaceId: b.workspaceId }, (tx) =>
      tx.select().from(auditLogs).where(eq(auditLogs.workspaceId, b.workspaceId)),
    );
    expect(rows).toHaveLength(0);
  });

  it("the runtime role cannot run DDL or bypass RLS", async () => {
    expect(await pgError(db().execute(sql`alter table workspaces disable row level security`))).toBe("42501");
    expect(await pgError(db().execute(sql`set role cadencia_owner`))).toBe("42501");
  });

  it("a session pointed at a foreign workspace gets no membership", async () => {
    const a = await createTrainer("A");
    const b = await createTrainer("B");
    const { token } = await loginAs(a.email);
    const s = await validateSessionToken(token);
    await db().update(sessions).set({ activeWorkspaceId: b.workspaceId }).where(eq(sessions.id, s!.session.id));
    const actor = await resolveActor(token);
    expect(actor).not.toBeNull();
    expect(actor!.membership).toBeNull();
  });

  it("a suspended student loses workspace access immediately", async () => {
    const t = await createTrainer();
    const s = await createStudent(t);
    const { token } = await loginAs(s.email);
    expect((await resolveActor(token))!.membership?.role).toBe("student");
    await withTenant({ userId: t.userId, workspaceId: t.workspaceId }, (tx) =>
      tx.update(workspaceMembers).set({ status: "suspended" }).where(eq(workspaceMembers.userId, s.userId)),
    );
    expect((await resolveActor(token))!.membership).toBeNull();
  });

  it("platform admins can list workspaces across tenants", async () => {
    const t = await createTrainer();
    const rows = await withTenant({ userId: t.userId, isPlatformAdmin: true }, (tx) => tx.select().from(workspaces));
    expect(rows.length).toBeGreaterThan(0);
  });
});
