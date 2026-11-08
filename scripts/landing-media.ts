/**
 * Records the landing page demo clips from the real app, with fictional demo data.
 *
 *   1. Start an isolated dev server (see README, "Testes de navegador") on :3100, with
 *      NEXT_HIDE_DEV_INDICATOR=1 so the dev badge is not recorded.
 *   2. npm run landing:media
 *
 * Creates a demo consultancy in the LOCAL database (signup and invites go through the
 * real UI, history is back-dated with the owner role), records 8–15 s clips with
 * Playwright, and converts them with ffmpeg to MP4 (H.264) + WebM (VP9), no audio,
 * plus a WebP poster from the first frame. Output: public/landing/videos/.
 * Never run against production.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import ffmpegPath from "ffmpeg-static";
import { Pool } from "pg";
import sharp from "sharp";

process.loadEnvFile();
const BASE = process.env.LANDING_MEDIA_URL ?? "http://localhost:3100";
const MAILPIT = "http://127.0.0.1:8025";
const PASSWORD = "uma frase longa e segura";
const OUT = path.resolve("public/landing/videos");
const TMP = path.resolve(".landing-media-tmp");
if (!/localhost|127\.0\.0\.1/.test(BASE)) throw new Error("Refusing to seed a non-local server.");
fs.mkdirSync(OUT, { recursive: true });
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });

const tag = String(Date.now()).slice(-4);
const email = (name: string) => `${name.toLowerCase().normalize("NFD").replace(/[^a-z ]/g, "").replace(/ /g, ".")}.${tag}@example.com`;
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function mailLink(to: string, part: string) {
  for (let i = 0; i < 30; i++) {
    const list = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)).json();
    for (const m of list.messages ?? []) {
      const full = await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json();
      const match = (full.Text as string).match(new RegExp(`(http\\S*${part}\\?token=[A-Za-z0-9_-]{43})`));
      if (match) return match[1]!;
    }
    await pause(500);
  }
  throw new Error(`no ${part} mail for ${to}`);
}

async function login(ctx: BrowserContext, who: string) {
  const p = await ctx.newPage();
  await p.goto(`${BASE}/entrar`);
  await p.getByLabel("E-mail").fill(who);
  await p.getByLabel("Senha").fill(PASSWORD);
  await p.getByRole("button", { name: "Entrar" }).click();
  await p.waitForURL(/\/(treinador|aluno)/);
  return p;
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------
const browser: Browser = await chromium.launch();
const setup = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: "light" });
const t = await setup.newPage();
const trainerEmail = email("Marina Costa");
await t.goto(`${BASE}/cadastro`);
await t.getByLabel("Seu nome").fill("Marina Costa");
await t.getByLabel("Nome da consultoria").fill("Marina Costa Treinos");
await t.getByLabel("E-mail").fill(trainerEmail);
await t.getByLabel("Senha").fill(PASSWORD);
await t.getByRole("checkbox").check();
await t.getByRole("button", { name: "Criar conta grátis" }).click();
await t.waitForURL("**/cadastro/confirme");
await t.goto(await mailLink(trainerEmail, "verificar-email"));
await t.getByRole("button", { name: "Confirmar meu e-mail" }).click();
await t.waitForURL("**/entrar?aviso=email-confirmado");
await t.getByLabel("E-mail").fill(trainerEmail);
await t.getByLabel("Senha").fill(PASSWORD);
await t.getByRole("button", { name: "Entrar" }).click();
await t.waitForURL("**/treinador");

const STUDENTS = ["Ana Ribeiro", "Bruno Teixeira", "Camila Duarte", "Diego Martins", "Eduarda Lopes"];
const studentEmails: string[] = [];
for (const name of STUDENTS) {
  const e = email(name);
  studentEmails.push(e);
  await t.goto(`${BASE}/treinador/alunos`);
  await t.getByLabel("E-mail do aluno").fill(e);
  await t.getByRole("button", { name: "Enviar convite" }).click();
  await t.getByText(`Convite enviado para ${e}.`).waitFor();
  const sctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const sp = await sctx.newPage();
  await sp.goto(await mailLink(e, "convite"));
  await sp.getByLabel("Seu nome").fill(name);
  await sp.getByLabel("Crie uma senha").fill(PASSWORD);
  await sp.getByRole("checkbox").check();
  await sp.getByRole("button", { name: "Aceitar e entrar" }).click();
  await sp.waitForURL("**/aluno");
  await sctx.close();
}

// Program built through the real builder.
async function buildProgram(p: Page, name: string, exercises: [string, string][]) {
  await p.goto(`${BASE}/treinador/treinos`);
  await p.getByText("Novo programa").click();
  await p.getByLabel("Nome do programa").fill(name);
  await p.getByRole("button", { name: "Criar programa" }).click();
  await p.waitForURL(/\/treinador\/treinos\/[0-9a-f-]{36}$/);
  for (const [q, full] of exercises) {
    await p.getByLabel("Adicionar exercício").fill(q);
    await p.getByRole("button", { name: new RegExp(`^${full}`) }).click();
  }
  await p.getByRole("button", { name: "Publicar" }).click();
  await p.getByText(/Versão 1 publicada/).waitFor({ timeout: 15000 });
  await p.reload();
  for (const s of STUDENTS) await p.getByRole("checkbox", { name: new RegExp(s) }).check();
  await p.getByRole("button", { name: "Atribuir programa" }).click();
  await p.getByText(/Programa atribuído/).waitFor();
}
await buildProgram(t, "Hipertrofia · Bloco 1", [
  ["supino", "Supino reto com barra"],
  ["remada", "Remada curvada com barra"],
  ["agachamento", "Agachamento livre"],
]);

// History, back-dated as the owner role (demo data only).
const owner = new Pool({ connectionString: process.env.DATABASE_MIGRATION_URL, max: 1 });
const ids = (
  await owner.query(
    "select m.id, m.workspace_id, u.display_name from workspace_members m join users u on u.id = m.user_id where u.email = any($1)",
    [studentEmails],
  )
).rows as { id: string; workspace_id: string; display_name: string }[];
const assignment = (await owner.query("select program_id from program_assignments where member_id = $1 limit 1", [ids[0]!.id])).rows[0];
const programPath = `/treinador/treinos/${assignment.program_id}`;
const version = (await owner.query("select v.id, d.id as day from program_versions v join program_days d on d.version_id = v.id where v.program_id = $1 and v.status = 'published' limit 1", [assignment.program_id])).rows[0];
const HISTORY: Record<string, number[]> = {
  "Ana Ribeiro": [1, 2, 3, 5, 6, 8, 9, 10, 12, 13, 15, 16, 17, 19, 20, 22, 23, 26],
  "Bruno Teixeira": [1, 3, 4, 6, 9, 11, 13, 16, 18, 20, 25],
  "Camila Duarte": [2, 4, 7, 9, 14, 21],
  "Eduarda Lopes": [3, 8, 15],
};
for (const m of ids) {
  for (const d of HISTORY[m.display_name] ?? []) {
    const { rows } = await owner.query(
      `insert into workout_sessions (workspace_id, member_id, program_id, version_id, day_id, status, started_at)
       values ($1,$2,$3,$4,$5,'in_progress', now() - ($6 || ' days')::interval - interval '3 hours') returning id`,
      [m.workspace_id, m.id, assignment.program_id, version.id, version.day, String(d)],
    );
    await owner.query("update workout_sessions set status = 'completed', completed_at = started_at + interval '52 minutes', duration_seconds = 3120, effort = 7 where id = $1", [rows[0].id]);
    const day = (await owner.query("select ((now() at time zone 'America/Sao_Paulo')::date - $1::int)::text d", [d])).rows[0].d;
    await owner.query("insert into checkins (workspace_id, member_id, day, source, session_id) values ($1,$2,$3,'workout',$4) on conflict do nothing", [m.workspace_id, m.id, day, rows[0].id]);
    await owner.query(
      "insert into points_ledger (workspace_id, member_id, points, reason, occurred_on, idempotency_key) values ($1,$2,10,'checkin_workout',$3,$4) on conflict do nothing",
      [m.workspace_id, m.id, day, `demo:${m.id}:${day}`],
    );
  }
}
// Weight entries for Ana.
const ana = ids.find((m) => m.display_name === "Ana Ribeiro")!;
for (const [d, kg] of [[56, 68.4], [42, 67.6], [28, 67.1], [14, 66.3], [2, 65.8]] as const) {
  await owner.query(
    "insert into body_measurements (workspace_id, member_id, measured_on, weight_kg) values ($1,$2,(now() at time zone 'America/Sao_Paulo')::date - $3::int,$4)",
    [ana.workspace_id, ana.id, d, kg],
  );
}
await owner.end();
await setup.close();

// ---------------------------------------------------------------------------
// Record
// ---------------------------------------------------------------------------
/** `path` is where the clip opens (its first frame becomes the poster). */
type Clip = { name: string; path: string; mobile: boolean; who: "trainer" | "ana"; run: (p: Page) => Promise<void> };
const CLIPS: Clip[] = [
  {
    name: "visao-geral",
    path: "/treinador",
    mobile: false,
    who: "trainer",
    run: async (p) => {
      await pause(2500);
      await p.mouse.wheel(0, 380);
      await pause(2500);
      await p.mouse.wheel(0, -380);
      await pause(2500);
    },
  },
  {
    name: "alunos",
    path: "/treinador/alunos",
    mobile: false,
    who: "trainer",
    run: async (p) => {
      await pause(1500);
      await p.getByLabel("E-mail do aluno").pressSequentially(`gabriel.souza.${tag}@example.com`, { delay: 45 });
      await pause(400);
      await p.getByRole("button", { name: "Enviar convite" }).click();
      await p.getByText(/Convite enviado/).waitFor();
      await pause(1800);
      await p.getByRole("link", { name: /Ana Ribeiro/ }).first().click();
      await p.waitForURL(/\/treinador\/alunos\/[0-9a-f-]{36}$/);
      await pause(1500);
      await p.mouse.wheel(0, 500);
      await pause(2200);
    },
  },
  {
    name: "treinos",
    path: programPath,
    mobile: false,
    who: "trainer",
    run: async (p) => {
      await pause(1800);
      await p.getByRole("button", { name: "Editar treino" }).click();
      await p.getByLabel("Adicionar exercício").waitFor();
      await pause(700);
      for (const [q, full] of [["leg", "Leg press"], ["puxada", "Puxada frontal"]] as const) {
        await p.getByLabel("Adicionar exercício").pressSequentially(q, { delay: 70 });
        await pause(500);
        await p.getByRole("button", { name: new RegExp(`^${full}`) }).first().click();
        await pause(700);
      }
      await p.getByLabel("Séries").first().fill("4");
      await pause(1500);
    },
  },
  {
    name: "ranking",
    path: "/aluno/ranking",
    mobile: true,
    who: "ana",
    run: async (p) => {
      await pause(2200);
      await p.getByRole("link", { name: "Mês" }).click();
      await pause(2000);
      await p.getByRole("link", { name: "Geral" }).click();
      await pause(2200);
    },
  },
  {
    name: "treino-do-aluno",
    path: "/aluno",
    mobile: true,
    who: "ana",
    run: async (p) => {
      await pause(1600);
      await p.getByRole("button", { name: "Começar" }).first().click();
      await p.waitForURL(/\/aluno\/treino\/[0-9a-f-]{36}$/);
      await pause(900);
      await p.getByLabel("Kg").first().fill("42");
      await pause(500);
      await p.getByRole("button", { name: "Concluir série 1" }).click();
      await p.getByRole("region", { name: "Descanso" }).waitFor();
      await pause(3500);
      await p.getByRole("button", { name: "Pular" }).click();
      await pause(1500);
    },
  },
];

const ffmpeg = ffmpegPath as unknown as string;
for (const clip of CLIPS) {
  const size = clip.mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 };
  // Sign in outside the recording, then record only the scenario.
  const auth = await browser.newContext({ viewport: size, colorScheme: "light" });
  await login(auth, clip.who === "trainer" ? trainerEmail : studentEmails[0]!);
  const state = await auth.storageState();
  await auth.close();
  const ctx = await browser.newContext({ viewport: size, colorScheme: "light", storageState: state, recordVideo: { dir: TMP, size } });
  const p = await ctx.newPage();
  const t0 = Date.now();
  await p.goto(`${BASE}${clip.path}`);
  await p.waitForLoadState("networkidle");
  const start = (Date.now() - t0) / 1000;
  await clip.run(p);
  const raw = await p.video()!.path();
  await ctx.close();

  const mp4 = path.join(OUT, `${clip.name}.mp4`);
  const webm = path.join(OUT, `${clip.name}.webm`);
  const scale = clip.mobile ? "scale=390:-2" : "scale=1280:-2";
  execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-ss", String(start), "-i", raw, "-an", "-vf", `${scale},fps=30`, "-c:v", "libx264", "-preset", "slow", "-crf", "27", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4]);
  execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-ss", String(start), "-i", raw, "-an", "-vf", `${scale},fps=30`, "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "38", "-row-mt", "1", webm]);
  const frame = path.join(TMP, `${clip.name}.png`);
  execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-i", mp4, "-frames:v", "1", frame]);
  await sharp(frame).webp({ quality: 78 }).toFile(path.join(OUT, `${clip.name}.webp`));
  const kb = (f: string) => Math.round(fs.statSync(f).size / 1024);
  console.log(`${clip.name}: mp4 ${kb(mp4)} KB, webm ${kb(webm)} KB, ${size.width}x${size.height}`);
}
await browser.close();
fs.rmSync(TMP, { recursive: true, force: true });
console.log(`demo trainer: ${trainerEmail} / student: ${studentEmails[0]} (password in this script)`);
