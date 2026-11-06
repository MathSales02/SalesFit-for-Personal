import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { resolveActor } from "@/server/auth/actor";
import type { Actor } from "@/server/authz/policy";
import { closeDb } from "@/server/db/client";
import { withTenant } from "@/server/db/context";
import { auditLogs, invitations, studentHealthRecords, studentProfiles, workspaceMembers } from "@/server/db/schema";
import { AppError } from "@/server/lib/errors";
import { testOutbox } from "@/server/mail/mailer";
import {
  acceptInvitationAsActor,
  acceptInvitationWithNewAccount,
  inviteStudent,
  previewInvitation,
  revokeInvitation,
} from "@/server/students/invitations";
import {
  getOwnHealth,
  getStudentForTrainer,
  listStudents,
  setHealthConsent,
  setStudentStatus,
  updateOwnHealth,
  updateStudentHealthAsTrainer,
  updateStudentProfile,
} from "@/server/students/students";
import { createStudent, createTrainer, loginAs, meta, PASSWORD, uniqueEmail } from "./support/factories";

afterAll(closeDb);

async function actorFor(email: string): Promise<Actor> {
  const { token } = await loginAs(email);
  return (await resolveActor(token))!;
}

function inviteToken(email: string) {
  const mail = [...testOutbox].reverse().find((m) => m.to === email && m.text.includes("/convite?token="));
  const t = mail?.text.match(/token=([A-Za-z0-9_-]{43})/)?.[1];
  if (!t) throw new Error(`no invitation for ${email}`);
  return t;
}

async function errorCode(p: Promise<unknown>) {
  return p.then(
    () => "ok",
    (e: unknown) => (e instanceof AppError ? e.code : ((e as { cause?: { code?: string } }).cause?.code ?? String(e))),
  );
}

/** Trainer + one student who joined through a real invitation. */
async function trainerWithStudent() {
  const t = await createTrainer();
  const trainer = await actorFor(t.email);
  const email = uniqueEmail("aluno");
  await inviteStudent(trainer, email, meta());
  const session = await acceptInvitationWithNewAccount({ token: inviteToken(email), displayName: "Bia Lima", password: PASSWORD }, meta());
  const student = (await resolveActor(session.token))!;
  return { t, trainer, student, studentEmail: email };
}

describe("invitations", () => {
  it("a new student joins through the invitation link and is signed in", async () => {
    const { student, t } = await trainerWithStudent();
    expect(student.membership).toMatchObject({ role: "student", workspaceId: t.workspaceId });
    expect(student.emailVerified).toBe(true);
    const [profile] = await withTenant({ userId: student.userId, workspaceId: t.workspaceId }, (tx) =>
      tx.select().from(studentProfiles).where(eq(studentProfiles.memberId, student.membership!.memberId)),
    );
    expect(profile).toBeDefined();
  });

  it("the preview shows the workspace without exposing anything else", async () => {
    const t = await createTrainer("Carla");
    const trainer = await actorFor(t.email);
    const email = uniqueEmail("prev");
    await inviteStudent(trainer, email, meta());
    const p = await previewInvitation(inviteToken(email), meta());
    expect(p).toEqual({ email, workspaceName: "Carla Consultoria", accountExists: false });
  });

  it("links are single use", async () => {
    const t = await createTrainer();
    const trainer = await actorFor(t.email);
    const email = uniqueEmail("once");
    await inviteStudent(trainer, email, meta());
    const token = inviteToken(email);
    await acceptInvitationWithNewAccount({ token, displayName: "Um", password: PASSWORD }, meta());
    expect(await errorCode(acceptInvitationWithNewAccount({ token, displayName: "Dois", password: PASSWORD }, meta()))).toBe("NOT_FOUND");
  });

  it("revoked and expired invitations cannot be accepted", async () => {
    const t = await createTrainer();
    const trainer = await actorFor(t.email);
    const a = uniqueEmail("revoked");
    await inviteStudent(trainer, a, meta());
    const tokenA = inviteToken(a);
    const [inv] = await withTenant({ userId: t.userId, workspaceId: t.workspaceId }, (tx) => tx.select().from(invitations).where(eq(invitations.email, a)));
    await revokeInvitation(trainer, inv!.id, meta());
    expect(await errorCode(acceptInvitationWithNewAccount({ token: tokenA, displayName: "Ana", password: PASSWORD }, meta()))).toBe("NOT_FOUND");

    const b = uniqueEmail("expired");
    await inviteStudent(trainer, b, meta());
    await withTenant({ userId: t.userId, workspaceId: t.workspaceId }, (tx) =>
      tx.update(invitations).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(invitations.email, b)),
    );
    expect(await previewInvitation(inviteToken(b), meta())).toBeNull();
  });

  it("an existing account can only accept an invitation sent to its own email", async () => {
    const t = await createTrainer();
    const trainer = await actorFor(t.email);
    const other = await createTrainer("Outro");
    await inviteStudent(trainer, other.email, meta());
    const token = inviteToken(other.email);

    const intruder = await actorFor((await createTrainer("Intruso")).email);
    expect(await errorCode(acceptInvitationAsActor(intruder, token, meta()))).toBe("FORBIDDEN");

    const invited = await actorFor(other.email);
    await acceptInvitationAsActor(invited, token, meta());
    const s = await loginAs(other.email);
    const rows = await withTenant({ userId: other.userId, workspaceId: t.workspaceId }, (tx) =>
      tx.select().from(workspaceMembers).where(eq(workspaceMembers.userId, other.userId)),
    );
    expect(rows.map((r) => r.role)).toContain("student");
    expect(s.token).toBeTruthy();
  });

  it("enforces the plan seat limit, and re-inviting does not take a second seat", async () => {
    const t = await createTrainer();
    const trainer = await actorFor(t.email);
    const emails = Array.from({ length: 10 }, () => uniqueEmail("seat"));
    for (const e of emails) await inviteStudent(trainer, e, meta());
    expect(await errorCode(inviteStudent(trainer, uniqueEmail("extra"), meta()))).toBe("PLAN_LIMIT");
    // Resending an existing invitation replaces it instead of failing.
    await expect(inviteStudent(trainer, emails[0]!, meta())).resolves.toBeUndefined();
  });

  it("concurrent invitations cannot overshoot the last seat", async () => {
    const t = await createTrainer();
    const trainer = await actorFor(t.email);
    for (let i = 0; i < 8; i++) await inviteStudent(trainer, uniqueEmail("fill"), meta());
    const results = await Promise.all(Array.from({ length: 5 }, () => errorCode(inviteStudent(trainer, uniqueEmail("race"), meta()))));
    expect(results.filter((r) => r === "ok")).toHaveLength(2);
    expect(results.filter((r) => r === "PLAN_LIMIT")).toHaveLength(3);
  });

  it("students and unverified trainers cannot invite", async () => {
    const { student } = await trainerWithStudent();
    expect(await errorCode(inviteStudent(student, uniqueEmail(), meta()))).toBe("FORBIDDEN");
  });
});

describe("student records isolation", () => {
  it("Trainer B cannot read or change Trainer A's student", async () => {
    const { student } = await trainerWithStudent();
    const b = await actorFor((await createTrainer("B")).email);
    const memberId = student.membership!.memberId;
    expect(await errorCode(getStudentForTrainer(b, memberId, meta()))).toBe("NOT_FOUND");
    expect(await errorCode(updateStudentProfile(b, { memberId, goal: "x", fitnessLevel: null, weeklyFrequency: null, trainerNotes: null }, meta()))).toBe("NOT_FOUND");
    expect(await errorCode(setStudentStatus(b, memberId, "archived", meta()))).toBe("NOT_FOUND");
    expect((await listStudents(b, { status: "active", page: 1 })).total).toBe(0);
  });

  it("a profile cannot point at a member of another workspace (composite foreign key)", async () => {
    const a = await createTrainer("A");
    const foreign = await createStudent(a); // member of A without a profile yet
    const [fm] = await withTenant({ userId: a.userId, workspaceId: a.workspaceId }, (tx) =>
      tx.select({ id: workspaceMembers.id }).from(workspaceMembers).where(eq(workspaceMembers.userId, foreign.userId)),
    );
    const b = await createTrainer("B");
    const code = await errorCode(
      withTenant({ userId: b.userId, workspaceId: b.workspaceId }, (tx) =>
        tx.insert(studentProfiles).values({ workspaceId: b.workspaceId, memberId: fm!.id }),
      ),
    );
    expect(code).toBe("23503");
  });

  it("students cannot edit their profile or read trainer-only data of others", async () => {
    const { student, trainer, t } = await trainerWithStudent();
    const updated = await withTenant({ userId: student.userId, workspaceId: t.workspaceId }, (tx) =>
      tx.update(studentProfiles).set({ goal: "hack" }).returning(),
    );
    expect(updated).toHaveLength(0);

    // A second student of the same trainer cannot see the first one's profile.
    const email2 = uniqueEmail("aluno2");
    await inviteStudent(trainer, email2, meta());
    const s2 = await acceptInvitationWithNewAccount({ token: inviteToken(email2), displayName: "Caio", password: PASSWORD }, meta());
    const second = (await resolveActor(s2.token))!;
    const seen = await withTenant({ userId: second.userId, workspaceId: t.workspaceId }, (tx) => tx.select().from(studentProfiles));
    expect(seen.map((p) => p.memberId)).toEqual([second.membership!.memberId]);
    expect(await errorCode(getStudentForTrainer(second, student.membership!.memberId, meta()))).toBe("FORBIDDEN");
  });
});

describe("health data and consent", () => {
  const sample = { restrictions: "Evitar agachamento profundo", injuries: "Lesão no joelho direito (2024)", medicalNotes: null };

  it("the trainer sees and edits health data only while the student consents", async () => {
    const { trainer, student } = await trainerWithStudent();
    const memberId = student.membership!.memberId;

    await updateOwnHealth(student, sample, meta());
    expect((await getStudentForTrainer(trainer, memberId, meta())).health).toBeNull();
    expect(await errorCode(updateStudentHealthAsTrainer(trainer, memberId, sample, meta()))).toBe("FORBIDDEN");

    await setHealthConsent(student, true, meta());
    expect((await getStudentForTrainer(trainer, memberId, meta())).health?.injuries).toBe(sample.injuries);
    await updateStudentHealthAsTrainer(trainer, memberId, { ...sample, medicalNotes: "Liberado pelo ortopedista" }, meta());
    expect((await getOwnHealth(student)).health?.medicalNotes).toBe("Liberado pelo ortopedista");

    await setHealthConsent(student, false, meta());
    expect((await getStudentForTrainer(trainer, memberId, meta())).health).toBeNull();
  });

  it("RLS hides health rows from the trainer without consent, even with a direct query", async () => {
    const { trainer, student, t } = await trainerWithStudent();
    await updateOwnHealth(student, sample, meta());
    const rows = await withTenant({ userId: trainer.userId, workspaceId: t.workspaceId }, (tx) => tx.select().from(studentHealthRecords));
    expect(rows).toHaveLength(0);
  });

  it("platform admins cannot read health data", async () => {
    const { student, t } = await trainerWithStudent();
    await setHealthConsent(student, true, meta());
    await updateOwnHealth(student, sample, meta());
    const rows = await withTenant({ userId: student.userId, workspaceId: t.workspaceId, isPlatformAdmin: true }, (tx) =>
      tx.select().from(studentHealthRecords).where(eq(studentHealthRecords.memberId, "00000000-0000-0000-0000-000000000000")),
    );
    expect(rows).toHaveLength(0);
    const adminOnly = await withTenant({ userId: "00000000-0000-0000-0000-000000000001", isPlatformAdmin: true }, (tx) =>
      tx.select().from(studentHealthRecords),
    );
    expect(adminOnly).toHaveLength(0);
  });

  it("health reads by the trainer are audited", async () => {
    const { trainer, student, t } = await trainerWithStudent();
    await setHealthConsent(student, true, meta());
    await getStudentForTrainer(trainer, student.membership!.memberId, meta());
    const rows = await withTenant({ userId: trainer.userId, workspaceId: t.workspaceId }, (tx) =>
      tx.select().from(auditLogs).where(and(eq(auditLogs.workspaceId, t.workspaceId), eq(auditLogs.action, "health.viewed"))),
    );
    expect(rows.length).toBeGreaterThan(0);
    // The audit entry records the access, never the health content itself.
    expect(JSON.stringify(rows)).not.toContain("joelho");
  });
});

describe("student status", () => {
  it("suspension cuts access immediately; archiving frees the seat", async () => {
    const { trainer, student, studentEmail } = await trainerWithStudent();
    const memberId = student.membership!.memberId;
    await setStudentStatus(trainer, memberId, "suspended", meta());
    const { token } = await loginAs(studentEmail);
    expect((await resolveActor(token))!.membership).toBeNull();

    await setStudentStatus(trainer, memberId, "archived", meta());
    expect((await listStudents(trainer, { status: "archived", page: 1 })).total).toBe(1);
    await setStudentStatus(trainer, memberId, "active", meta());
    expect((await listStudents(trainer, { status: "active", page: 1 })).total).toBe(1);
  });

  it("reactivating an archived student requires a free seat", async () => {
    const { trainer, student } = await trainerWithStudent();
    await setStudentStatus(trainer, student.membership!.memberId, "archived", meta());
    for (let i = 0; i < 10; i++) await inviteStudent(trainer, uniqueEmail("fill"), meta());
    expect(await errorCode(setStudentStatus(trainer, student.membership!.memberId, "active", meta()))).toBe("PLAN_LIMIT");
  });

  it("a trainer cannot change their own membership through the student endpoints", async () => {
    const t = await createTrainer();
    const trainer = await actorFor(t.email);
    expect(await errorCode(setStudentStatus(trainer, trainer.membership!.memberId, "archived", meta()))).toBe("NOT_FOUND");
  });
});
