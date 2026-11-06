import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { resolveActor } from "@/server/auth/actor";
import type { Actor } from "@/server/authz/policy";
import { closeDb } from "@/server/db/client";
import { withTenant } from "@/server/db/context";
import { programDays, programExercises, programs, programVersions } from "@/server/db/schema";
import { createExercise, listExercises } from "@/server/exercises/service";
import { AppError } from "@/server/lib/errors";
import { testOutbox } from "@/server/mail/mailer";
import {
  archiveProgram,
  assignProgram,
  createProgram,
  discardDraft,
  duplicateProgram,
  endAssignment,
  getMyProgram,
  getProgram,
  listPrograms,
  publishDraft,
  saveDraft,
  startDraft,
} from "@/server/programs/service";
import { acceptInvitationWithNewAccount, inviteStudent } from "@/server/students/invitations";
import { setStudentStatus } from "@/server/students/students";
import { createTrainer, loginAs, meta, PASSWORD, uniqueEmail } from "./support/factories";

afterAll(closeDb);

async function trainer() {
  const t = await createTrainer();
  return (await resolveActor((await loginAs(t.email)).token))!;
}

async function studentOf(tr: Actor) {
  const email = uniqueEmail("aluno");
  await inviteStudent(tr, email, meta());
  const token = [...testOutbox].reverse().find((m) => m.to === email)!.text.match(/token=([A-Za-z0-9_-]{43})/)![1]!;
  const s = await acceptInvitationWithNewAccount({ token, displayName: "Aluno", password: PASSWORD }, meta());
  return (await resolveActor(s.token))!;
}

async function code(p: Promise<unknown>) {
  return p.then(
    () => "ok",
    (e: unknown) => (e instanceof AppError ? e.code : ((e as { cause?: { code?: string } }).cause?.code ?? String(e))),
  );
}

async function platformExercise(actor: Actor, name: string) {
  return (await listExercises(actor, { q: name }))[0]!.id;
}

const prescription = (exerciseId: string, over: Record<string, unknown> = {}) => ({
  exerciseId,
  variationExerciseId: null,
  sets: 3,
  reps: "8-12",
  load: "20 kg",
  restSeconds: 90,
  tempo: "3-0-1-0",
  notes: null,
  ...over,
});

/** Trainer with a published two-day program. */
async function publishedProgram() {
  const t = await trainer();
  const programId = await createProgram(t, { name: "Hipertrofia ABC", description: null, isTemplate: false }, meta());
  const supino = await platformExercise(t, "Supino reto com barra");
  const agacha = await platformExercise(t, "Agachamento livre");
  await saveDraft(
    t,
    programId,
    [
      { name: "Treino A", notes: null, exercises: [prescription(supino)] },
      { name: "Treino B", notes: "Aquecer 10 min", exercises: [prescription(agacha, { sets: 4, reps: "6" })] },
    ],
    meta(),
  );
  await publishDraft(t, programId, meta());
  return { t, programId, supino, agacha };
}

describe("program versions", () => {
  it("publishing freezes a version; edits go to a new draft and history stays intact", async () => {
    const { t, programId, supino } = await publishedProgram();
    await startDraft(t, programId, meta());
    await saveDraft(t, programId, [{ name: "Treino A (novo)", notes: null, exercises: [prescription(supino, { sets: 5 })] }], meta());

    const before = await getProgram(t, programId);
    expect(before.published!.number).toBe(1);
    expect(before.published!.content.days).toHaveLength(2);
    expect(before.draft!.content.days[0]!.exercises[0]!.sets).toBe(5);

    expect(await publishDraft(t, programId, meta())).toBe(2);
    const after = await getProgram(t, programId);
    expect(after.published!.number).toBe(2);
    expect(after.draft).toBeNull();
  });

  it("the database refuses changes to a published version, even with direct queries", async () => {
    const { t, programId } = await publishedProgram();
    const ws = t.membership!.workspaceId;
    const ctx = { userId: t.userId, workspaceId: ws };
    const [v] = await withTenant(ctx, (tx) => tx.select().from(programVersions).where(eq(programVersions.programId, programId)));
    expect(await code(withTenant(ctx, (tx) => tx.update(programExercises).set({ sets: 9 }).where(eq(programExercises.versionId, v!.id))))).toBe("42501");
    expect(await code(withTenant(ctx, (tx) => tx.delete(programDays).where(eq(programDays.versionId, v!.id))))).toBe("42501");
    expect(await code(withTenant(ctx, (tx) => tx.update(programVersions).set({ status: "draft" }).where(eq(programVersions.id, v!.id))))).toBe("42501");
  });

  it("cannot publish an empty program, and saving needs an open draft", async () => {
    const t = await trainer();
    const id = await createProgram(t, { name: "Vazio", description: null, isTemplate: false }, meta());
    expect(await code(publishDraft(t, id, meta()))).toBe("VALIDATION");
    const { t: t2, programId } = await publishedProgram();
    expect(await code(saveDraft(t2, programId, [{ name: "X", notes: null, exercises: [] }], meta()))).toBe("CONFLICT");
  });

  it("discarding a draft keeps the published version", async () => {
    const { t, programId } = await publishedProgram();
    await startDraft(t, programId, meta());
    await discardDraft(t, programId, meta());
    const p = await getProgram(t, programId);
    expect(p.draft).toBeNull();
    expect(p.published!.content.days).toHaveLength(2);
  });

  it("duplicating copies content into a new independent program", async () => {
    const { t, programId } = await publishedProgram();
    const copyId = await duplicateProgram(t, programId, meta());
    const copy = await getProgram(t, copyId);
    expect(copy.program.name).toBe("Hipertrofia ABC (cópia)");
    expect(copy.draft!.content.days.map((d) => d.name)).toEqual(["Treino A", "Treino B"]);
    expect(copy.published).toBeNull();
  });
});

describe("program isolation", () => {
  it("Trainer B cannot read, edit, duplicate or assign Trainer A's program", async () => {
    const { programId } = await publishedProgram();
    const b = await trainer();
    const bStudent = await studentOf(b);
    expect(await code(getProgram(b, programId))).toBe("NOT_FOUND");
    expect(await code(startDraft(b, programId, meta()))).toBe("NOT_FOUND");
    expect(await code(duplicateProgram(b, programId, meta()))).toBe("NOT_FOUND");
    expect(await code(assignProgram(b, { programId, memberIds: [bStudent.membership!.memberId], startsOn: "2026-11-10", endsOn: null }, meta()))).toBe("NOT_FOUND");
    expect((await listPrograms(b)).length).toBe(0);
  });

  it("a trainer cannot assign their program to another trainer's student", async () => {
    const { t, programId } = await publishedProgram();
    const other = await studentOf(await trainer());
    expect(await code(assignProgram(t, { programId, memberIds: [other.membership!.memberId], startsOn: "2026-11-10", endsOn: null }, meta()))).toBe("NOT_FOUND");
  });

  it("a program cannot use another trainer's private exercise", async () => {
    const { t, programId } = await publishedProgram();
    const b = await trainer();
    const privateB = await createExercise(b, { name: "Segredo do B", muscleGroup: "core", equipment: null, description: null, instructions: null }, meta());
    await startDraft(t, programId, meta());
    expect(await code(saveDraft(t, programId, [{ name: "A", notes: null, exercises: [prescription(privateB)] }], meta()))).toBe("VALIDATION");
  });

  it("students cannot manage programs", async () => {
    const { t, programId } = await publishedProgram();
    const s = await studentOf(t);
    expect(await code(createProgram(s, { name: "Meu", description: null, isTemplate: false }, meta()))).toBe("FORBIDDEN");
    expect(await code(getProgram(s, programId))).toBe("FORBIDDEN");
  });
});

describe("assignments and the student view", () => {
  it("the student sees the latest published version of their program, never the draft", async () => {
    const { t, programId, supino } = await publishedProgram();
    const s = await studentOf(t);
    await assignProgram(t, { programId, memberIds: [s.membership!.memberId], startsOn: "2026-11-10", endsOn: "2026-12-10" }, meta());

    let mine = await getMyProgram(s);
    expect(mine!.name).toBe("Hipertrofia ABC");
    expect(mine!.content.days[1]!.notes).toBe("Aquecer 10 min");
    expect(mine!.content.days[0]!.exercises[0]!.exerciseName).toBe("Supino reto com barra");

    await startDraft(t, programId, meta());
    await saveDraft(t, programId, [{ name: "Rascunho secreto", notes: null, exercises: [prescription(supino)] }], meta());
    mine = await getMyProgram(s);
    expect(mine!.content.days.map((d) => d.name)).not.toContain("Rascunho secreto");

    await publishDraft(t, programId, meta());
    mine = await getMyProgram(s);
    expect(mine!.version).toBe(2);
    expect(mine!.content.days.map((d) => d.name)).toEqual(["Rascunho secreto"]);
  });

  it("RLS: a student cannot read programs that are not assigned to them, nor any draft", async () => {
    const { t, programId } = await publishedProgram();
    const s = await studentOf(t);
    const ctx = { userId: s.userId, workspaceId: t.membership!.workspaceId };
    expect(await withTenant(ctx, (tx) => tx.select().from(programs))).toHaveLength(0);
    await assignProgram(t, { programId, memberIds: [s.membership!.memberId], startsOn: "2026-11-10", endsOn: null }, meta());
    await startDraft(t, programId, meta());
    const versions = await withTenant(ctx, (tx) => tx.select().from(programVersions));
    expect(versions.every((v) => v.status === "published")).toBe(true);
    const otherStudent = await studentOf(t);
    expect(await getMyProgram(otherStudent)).toBeNull();
  });

  it("assigning a new program replaces the current one; ending or archiving removes it", async () => {
    const { t, programId } = await publishedProgram();
    const s = await studentOf(t);
    const memberId = s.membership!.memberId;
    await assignProgram(t, { programId, memberIds: [memberId], startsOn: "2026-11-10", endsOn: null }, meta());
    const second = await duplicateProgram(t, programId, meta());
    await publishDraft(t, second, meta());
    await assignProgram(t, { programId: second, memberIds: [memberId], startsOn: "2026-11-12", endsOn: null }, meta());
    expect((await getMyProgram(s))!.name).toBe("Hipertrofia ABC (cópia)");

    const p = await getProgram(t, second);
    await endAssignment(t, p.assignments[0]!.id, meta());
    expect(await getMyProgram(s)).toBeNull();

    await assignProgram(t, { programId, memberIds: [memberId], startsOn: "2026-11-12", endsOn: null }, meta());
    await archiveProgram(t, programId, meta());
    expect(await getMyProgram(s)).toBeNull();
  });

  it("drafts cannot be assigned; suspended students cannot be assigned", async () => {
    const t = await trainer();
    const id = await createProgram(t, { name: "Novo", description: null, isTemplate: false }, meta());
    const s = await studentOf(t);
    expect(await code(assignProgram(t, { programId: id, memberIds: [s.membership!.memberId], startsOn: "2026-11-10", endsOn: null }, meta()))).toBe("CONFLICT");

    const { t: t2, programId } = await publishedProgram();
    const s2 = await studentOf(t2);
    await setStudentStatus(t2, s2.membership!.memberId, "suspended", meta());
    expect(await code(assignProgram(t2, { programId, memberIds: [s2.membership!.memberId], startsOn: "2026-11-10", endsOn: null }, meta()))).toBe("NOT_FOUND");
  });
});
