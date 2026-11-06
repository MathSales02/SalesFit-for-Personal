"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import {
  adjustPoints,
  cancelCompetition,
  closeCompetition,
  createCompetition,
  manualCheckin,
  setParticipation,
  setRankingHidden,
  updateGamificationSettings,
} from "@/server/gamification/service";
import { parseForm, runAction } from "@/server/http/action";
import { requestMeta, requireActionActor } from "@/server/http/next";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");
const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use no máximo ${max} caracteres.`)
    .optional()
    .transform((v) => (v ? v : null));
const points = (max: number, label: string) => z.coerce.number().int(`${label}: use um número inteiro.`).min(0, `${label}: mínimo 0.`).max(max, `${label}: máximo ${max}.`);

export async function checkinAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("manual_checkin", async () => {
    const actor = await requireActionActor("training.log_own");
    const { activity } = parseForm(z.strictObject({ activity: optional(60) }), form);
    await manualCheckin(actor, activity, await requestMeta());
    revalidatePath("/aluno");
    return { ok: true, message: "Check-in feito! Bom treino." };
  });
}

export async function rankingVisibilityAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("ranking_visibility", async () => {
    const actor = await requireActionActor("training.log_own");
    const { hidden } = parseForm(z.strictObject({ hidden: z.enum(["1", "0"]) }), form);
    await setRankingHidden(actor, hidden === "1");
    revalidatePath("/aluno/ranking");
    return { ok: true, message: hidden === "1" ? "Você não aparece mais no ranking dos outros alunos." : "Você voltou a aparecer no ranking." };
  });
}

export async function participationAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("competition_participation", async () => {
    const actor = await requireActionActor("challenges.join");
    const { competitionId, join } = parseForm(z.strictObject({ competitionId: z.uuid(), join: z.enum(["1", "0"]) }), form);
    await setParticipation(actor, competitionId, join === "1");
    revalidatePath("/aluno/ranking");
    return { ok: true, message: join === "1" ? "Você está participando!" : "Você saiu da competição." };
  });
}

export async function createCompetitionAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("create_competition", async () => {
    const actor = await requireActionActor("challenges.manage");
    const input = parseForm(
      z
        .strictObject({
          title: z.string().trim().min(3, "Dê um nome com pelo menos 3 letras.").max(80, "Use no máximo 80 caracteres."),
          description: optional(1000),
          prize: optional(200),
          startsOn: isoDate,
          endsOn: isoDate,
        })
        .refine((v) => v.endsOn >= v.startsOn, { path: ["endsOn"], message: "O fim deve ser depois do início." }),
      form,
    );
    const id = await createCompetition(actor, input, await requestMeta());
    redirect(`/treinador/ranking/competicao/${id}`);
  });
}

export async function competitionLifecycleAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("competition_lifecycle", async () => {
    const actor = await requireActionActor("challenges.manage");
    const { competitionId, op } = parseForm(z.strictObject({ competitionId: z.uuid(), op: z.enum(["close", "cancel"]) }), form);
    if (op === "close") await closeCompetition(actor, competitionId, await requestMeta());
    else await cancelCompetition(actor, competitionId, await requestMeta());
    revalidatePath(`/treinador/ranking/competicao/${competitionId}`);
    return { ok: true, message: op === "close" ? "Resultado oficial registrado." : "Competição cancelada." };
  });
}

export async function gamificationSettingsAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("gamification_settings", async () => {
    const actor = await requireActionActor("gamification.configure");
    const input = parseForm(
      z.strictObject({
        rankingEnabled: z.literal("on").optional().transform((v) => v === "on"),
        manualCheckinsEnabled: z.literal("on").optional().transform((v) => v === "on"),
        workoutPoints: points(100, "Treino concluído"),
        manualCheckinPoints: points(100, "Check-in manual"),
        weeklyGoalPoints: points(200, "Meta semanal"),
      }),
      form,
    );
    await updateGamificationSettings(actor, input, await requestMeta());
    revalidatePath("/treinador/ranking");
    return { ok: true, message: "Regras salvas. Valem para os próximos check-ins." };
  });
}

export async function adjustPointsAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("adjust_points", async () => {
    const actor = await requireActionActor("gamification.configure");
    const input = parseForm(
      z.strictObject({
        memberId: z.uuid({ error: "Escolha o aluno." }),
        points: z.coerce
          .number()
          .int("Use um número inteiro.")
          .min(-1000)
          .max(1000)
          .refine((n) => n !== 0, "Use um valor diferente de zero."),
        note: z.string().trim().min(3, "Explique o motivo do ajuste.").max(200),
      }),
      form,
    );
    await adjustPoints(actor, input, await requestMeta());
    revalidatePath("/treinador/ranking");
    return { ok: true, message: "Ajuste registrado." };
  });
}
