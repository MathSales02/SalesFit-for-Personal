"use client";

/**
 * HTML replicas of real app screens, built from the app's own dashboard components,
 * filled with fictional example data. They illustrate the interface only: none of
 * these numbers is a business metric or a client result.
 * Wrapped in .lp-app so they always use the app's light theme.
 */
import { Avatar, BarStrip, BigNumber, Card, Pill, Sparkline, WeekColumns } from "@/components/dashboard/widgets";
import { IconActivity, IconMessage, IconTrend, IconTrophy, IconUsers } from "@/components/shell/icons";
import { useT } from "@/i18n/client";

const WEEK = ["S", "T", "Q", "Q", "S", "S", "D"];
const week = (states: ("workout" | "manual" | "missed" | "future")[], today: number) => states.map((state, i) => ({ label: WEEK[i]!, state, today: i === today }));

export function AppFrame({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`lp-app ${className}`}>{children}</div>;
}

export function MockConstancia({ compact = false }: { compact?: boolean }) {
  const t = useT();
  return (
    <AppFrame>
      <Card title={t("Constância")} action={<Pill>{t("Meta batida")}</Pill>}>
        <p className="-mt-2 mb-4 text-sm text-muted">{t("Dias com check-in nesta semana")}</p>
        <WeekColumns days={week(["workout", "missed", "workout", "manual", "workout", "future", "future"], 4)} />
        {!compact && (
          <div className="mt-5 flex items-end justify-between gap-3">
            <BigNumber value={<span data-count="4">4</span>} unit="de 4 dias" />
            <p className="text-right text-xs text-muted">
              <span className="block font-display text-2xl font-bold text-ink">3</span>{t("semanas seguidas")}
            </p>
          </div>
        )}
      </Card>
    </AppFrame>
  );
}

const RANK = [
  { name: "Ana Ribeiro", pts: 50 },
  { name: "Bruno Teixeira", pts: 40 },
  { name: "Camila Duarte", pts: 30 },
];

export function MockRanking() {
  const t = useT();
  return (
    <AppFrame>
      <Card title={t("Ranking da semana")} icon={<IconTrophy />}>
        <ol className="flex flex-col gap-2">
          {RANK.map((r, i) => (
            <li key={t(r.name)} className="flex items-center gap-3 rounded-full bg-chalk py-1.5 pr-4 pl-1.5">
              <span className={`grid size-8 place-items-center rounded-full text-sm font-bold ${i === 0 ? "bg-signal text-on-accent" : "bg-paper"}`}>{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{t(r.name)}</span>
              <span className="text-sm font-semibold tabular-nums">{r.pts} {t("pts")}</span>
            </li>
          ))}
        </ol>
      </Card>
    </AppFrame>
  );
}

const DAILY = [1, 2, 0, 3, 2, 1, 2, 4, 1, 2, 3, 0, 2, 4];

export function MockTreinos() {
  const t = useT();
  return (
    <AppFrame>
      <Card title={t("Treinos")} icon={<IconActivity />} action={<span className="text-sm font-semibold text-muted">{t("14 dias")}</span>}>
        <BigNumber value={<span data-count="16">16</span>} unit="treinos" label={t("nos últimos 7 dias")} />
        <div className="mt-4">
          <BarStrip values={DAILY.map((d) => d / 4)} emphasize={DAILY.length - 1} label={t("Exemplo: treinos concluídos por dia")} />
        </div>
      </Card>
    </AppFrame>
  );
}

export function MockCheckinToast() {
  const t = useT();
  return (
    <AppFrame>
      <div className="flex items-center gap-3 rounded-full bg-paper py-2 pr-5 pl-2 shadow-[var(--shadow-card)]">
        <span className="grid size-9 place-items-center rounded-full bg-signal text-on-accent" aria-hidden="true">
          ✓
        </span>
        <span className="text-sm">
          <span className="block font-semibold">{t("Check-in de hoje feito")}</span>
          <span className="block text-muted">{t("Treino A · 52 min")}</span>
        </span>
      </div>
    </AppFrame>
  );
}

/** Phone-shaped frame for mobile screens. */
export function PhoneFrame({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-[2.6rem] border border-white/15 bg-[#0e0f11] p-2.5 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)] ${className}`}>
      <div className="overflow-hidden rounded-[2.1rem]">{children}</div>
    </div>
  );
}

export function MockPlayer() {
  const t = useT();
  const sets = [
    { n: 1, reps: 10, kg: 42, done: true },
    { n: 2, reps: 10, kg: 42, done: true },
    { n: 3, reps: 10, kg: null, done: false },
  ];
  return (
    <AppFrame>
      <div className="bg-chalk px-4 pt-5 pb-4">
        <p className="text-xs text-muted">{t("Hipertrofia · Bloco 1")}</p>
        <div className="flex items-end justify-between">
          <p className="font-display text-2xl font-bold">{t("Treino A")}</p>
          <p className="text-sm font-semibold tabular-nums">18:42</p>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-turf-tint">
          <div className="h-full w-2/5 rounded-full bg-turf" />
        </div>
        <div className="mt-4 rounded-[20px] bg-paper p-4 shadow-[var(--shadow-card)]">
          <p className="font-semibold">{t("Supino reto com barra")}</p>
          <p className="text-xs text-muted">{t("3 × 10 · descanso 1:00")}</p>
          <ul className="mt-3 flex flex-col gap-2">
            {sets.map((s) => (
              <li key={s.n} className={`flex items-center gap-2 rounded-xl p-2 ${s.done ? "bg-turf-tint" : "bg-chalk"}`}>
                <span className="w-4 text-sm font-semibold">{s.n}</span>
                <span className="flex-1 rounded-lg bg-paper px-2 py-1.5 text-center text-sm tabular-nums">{s.reps}</span>
                <span className="flex-1 rounded-lg bg-paper px-2 py-1.5 text-center text-sm tabular-nums">{s.kg ?? "—"}</span>
                <span className={`grid h-8 w-14 place-items-center rounded-lg text-xs font-semibold ${s.done ? "bg-turf-solid text-white" : "border border-turf text-turf"}`}>{s.done ? "✓" : t("Feita")}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="flex items-center justify-between bg-night px-4 py-3 text-white">
        <span>
          <span className="block text-xs text-white/70">{t("Descanso")}</span>
          <span className="font-display text-2xl font-bold tabular-nums">0:42</span>
        </span>
        <span className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-[#0e0f11]">{t("Pular")}</span>
      </div>
    </AppFrame>
  );
}

export function MockEvolucao() {
  const t = useT();
  return (
    <AppFrame>
      <Card title={t("Peso")} icon={<IconTrend />}>
        <p className="-mt-2 text-sm text-muted">{t("Exemplo de evolução em 8 semanas")}</p>
        <div className="my-4">
          <Sparkline points={[68.4, 68.1, 67.6, 67.4, 67.1, 66.6, 66.3, 65.8]} label={t("Exemplo: peso caindo de 68,4 para 65,8 kg em 8 semanas")} />
        </div>
        <div className="flex items-end justify-between">
          <BigNumber value="65,8" unit="kg" />
          <p className="text-right text-xs text-muted">
            <span className="block text-base font-semibold text-ink">{t("−2,6 kg")}</span>{t("em 8 semanas")}
          </p>
        </div>
      </Card>
    </AppFrame>
  );
}

export function MockBuilder() {
  const t = useT();
  const rows = [
    [t("Supino reto com barra"), "4", "8–10", "60"],
    [t("Remada curvada com barra"), "3", "10", "60"],
    [t("Agachamento livre"), "4", "8", "90"],
  ];
  return (
    <AppFrame>
      <div className="rounded-[var(--radius-panel)] bg-paper p-5 shadow-[var(--shadow-card)]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="font-semibold">{t("Rascunho da versão 2")}</p>
          <span className="rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-paper">{t("Publicar")}</span>
        </div>
        <div className="mb-3 flex gap-2 text-xs font-semibold">
          <span className="rounded-full bg-turf-solid px-3 py-1.5 text-white">{t("A · Peito e costas")}</span>
          <span className="rounded-full border border-line-strong px-3 py-1.5 text-ink-soft">{t("B · Pernas")}</span>
        </div>
        <ul className="flex flex-col gap-2">
          {rows.map(([name, s, r, d], i) => (
            <li key={name} className="rounded-2xl bg-chalk p-3">
              <p className="text-sm font-semibold">
                {i + 1} · {name}
              </p>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                {[
                  [t("Séries"), s],
                  [t("Repetições"), r],
                  [t("Descanso (s)"), d],
                ].map(([label, value]) => (
                  <span key={label}>
                    <span className="block text-muted">{label}</span>
                    <span className="mt-0.5 block rounded-lg bg-paper px-2 py-1.5 font-semibold tabular-nums">{value}</span>
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </AppFrame>
  );
}

export function MockComunidade() {
  const t = useT();
  return (
    <AppFrame>
      <div className="flex flex-col gap-3">
        <div className="rounded-[var(--radius-panel)] bg-paper p-4 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-3">
            <Avatar name="Bruno Teixeira" size="sm" />
            <p className="text-sm">
              <span className="font-semibold">{t("Bruno Teixeira")}</span> <span className="text-muted">{t("· há 2 h")}</span>
            </p>
          </div>
          <p className="mt-3 text-sm">{t("Treino B fechado. Agachamento subiu 5 kg!")}</p>
          <p className="mt-2 inline-flex rounded-full bg-signal px-2 py-0.5 text-xs font-bold text-on-accent">{t("Recorde")}</p>
          <p className="mt-3 text-xs text-muted">{t("12 curtidas · 3 comentários")}</p>
        </div>
        <div className="ml-auto max-w-[80%] rounded-[20px] bg-turf-solid px-3.5 py-2 text-sm text-white">{t("Boa! Semana que vem a gente ajusta a carga.")}</div>
        <div className="flex items-center gap-2 text-xs text-muted">
          <span className="size-4">
            <IconMessage />
          </span>
          {t("Mensagem para Bruno Teixeira")}
        </div>
      </div>
    </AppFrame>
  );
}

export function MockAlunos() {
  const t = useT();
  const students = [
    [t("Ana Ribeiro"), t("Intermediário · 4x por semana")],
    [t("Bruno Teixeira"), "Iniciante · 3x por semana"],
    [t("Camila Duarte"), t("Avançado · 5x por semana")],
  ];
  return (
    <AppFrame>
      <div className="flex flex-col gap-3">
        <div className="rounded-[var(--radius-panel)] bg-paper p-4 shadow-[var(--shadow-card)]">
          <ul className="divide-y divide-line">
            {students.map(([name, info]) => (
              <li key={name} className="flex items-center gap-3 py-2.5">
                <Avatar name={name!} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{name}</span>
                  <span className="block text-xs text-muted">{info}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <Card title={t("Precisam de atenção")} icon={<IconUsers />}>
          <div className="flex items-center gap-3">
            <Avatar name="Diego Martins" size="sm" />
            <span className="flex-1 text-sm font-semibold">{t("Diego Martins")}</span>
            <span className="text-xs text-muted">{t("há 9 dias")}</span>
          </div>
        </Card>
      </div>
    </AppFrame>
  );
}
