/**
 * What each plan unlocks. A plan's `features` (in the database) lists the keys it includes;
 * everything else in the app is part of every plan. The essentials a student needs to train
 * (workout sheet, workout player, demonstrations, check-in, messages with the trainer) are
 * never behind a feature.
 */
export const FEATURES = ["community", "ranking", "evolution", "student_dm", "own_videos", "competitions"] as const;
export type Feature = (typeof FEATURES)[number];
export type PlanFeatures = Partial<Record<Feature, boolean>>;

export const FEATURE_INFO: Record<Feature, { label: string; plan: "Pro" | "Elite"; pitch: string }> = {
  community: { label: "Comunidade", plan: "Pro", pitch: "Feed, perfis e descoberta entre os alunos da sua consultoria, para manter todo mundo treinando." },
  ranking: { label: "Ranking e pontos", plan: "Pro", pitch: "Pontos de constância e ranking semanal, que dão motivo para o aluno não faltar." },
  evolution: { label: "Evolução física", plan: "Pro", pitch: "Medidas e fotos de progresso dos alunos, para mostrar o resultado do seu trabalho." },
  student_dm: { label: "Mensagens entre alunos", plan: "Pro", pitch: "Conversas diretas entre os alunos da consultoria." },
  own_videos: { label: "Vídeos próprios", plan: "Pro", pitch: "Envie seus próprios vídeos de execução para os exercícios." },
  competitions: { label: "Competições", plan: "Elite", pitch: "Desafios com período, regras e prêmio para a sua turma." },
};

export const hasFeature = (features: PlanFeatures | Record<string, boolean> | null | undefined, feature: Feature) => !!features?.[feature];

/** Paying the year at once costs 15% less than twelve monthly charges. */
export const ANNUAL_DISCOUNT_PERCENT = 15;
export const annualPriceCents = (monthlyCents: number) => Math.round(monthlyCents * 12 * (1 - ANNUAL_DISCOUNT_PERCENT / 100));
/** The annual price may be split on a credit card. */
export const MAX_INSTALLMENTS = 12;

export const BILLING_CYCLES = ["monthly", "yearly"] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

/** Free trial length, and how long after buying during the trial the first charge falls due. */
export const TRIAL_DAYS = 7;
export const FIRST_CHARGE_DELAY_DAYS = 3;
