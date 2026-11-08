/**
 * All editable landing page content in one place.
 *
 * Rules:
 *  - Only what the product really does. Nothing invented: no numbers, clients or reviews.
 *  - Lists that depend on real data (testimonials, metrics, social links) render
 *    nothing while empty. Fill them only with real, verifiable content.
 *  - Prices and plan limits are NOT here: they come from the database (admin → Planos),
 *    the same source the checkout charges.
 */

export const BRAND = "CadênciaFit";

export const CONTACT = {
  email: "matheusssales0218@gmail.com",
  whatsapp: { display: "(13) 98196-9513", href: "https://wa.me/5513981969513" },
};

/** Real profiles only, e.g. { label: "Instagram", href: "https://instagram.com/..." }. Empty: hidden. */
export const SOCIAL: { label: string; href: string }[] = [];

/** Real testimonials only, with permission. Empty: the section is hidden. */
export const TESTIMONIALS: { quote: string; name: string; role: string }[] = [];

/** Real, verifiable metrics only (with a source). Empty: hidden. */
export const METRICS: { value: string; label: string; source: string }[] = [];

export const NAV = [
  { id: "demonstracao", label: "Demonstração" },
  { id: "funcionalidades", label: "Funcionalidades" },
  { id: "beneficios", label: "Benefícios" },
  { id: "precos", label: "Preços" },
  { id: "faq", label: "Dúvidas" },
] as const;

/**
 * Demo clips recorded from the real app with fictional demo data (scripts/landing-media.ts).
 * `frame`: how the clip is presented. A clip without `src` is not rendered.
 */
export const DEMOS: { id: string; title: string; text: string; src: string; poster: string; frame: "desktop" | "phone"; width: number; height: number }[] = [
  {
    id: "visao-geral",
    title: "Visão geral",
    text: "Alunos ativos, treinos dos últimos 14 dias, quem está sem treinar e o ranking da semana, logo ao entrar.",
    src: "/landing/videos/visao-geral",
    poster: "/landing/videos/visao-geral.webp",
    frame: "desktop",
    width: 1280,
    height: 800,
  },
  {
    id: "alunos",
    title: "Alunos",
    text: "Convite por e-mail, lista por situação e a ficha completa de cada aluno.",
    src: "/landing/videos/alunos",
    poster: "/landing/videos/alunos.webp",
    frame: "desktop",
    width: 1280,
    height: 800,
  },
  {
    id: "treinos",
    title: "Montador de treinos",
    text: "Edite o programa num rascunho: os alunos seguem na versão publicada até você publicar a nova.",
    src: "/landing/videos/treinos",
    poster: "/landing/videos/treinos.webp",
    frame: "desktop",
    width: 1280,
    height: 800,
  },
  {
    id: "treino-do-aluno",
    title: "Treino no celular",
    text: "O aluno registra carga e repetições, e o descanso já começa a contar.",
    src: "/landing/videos/treino-do-aluno",
    poster: "/landing/videos/treino-do-aluno.webp",
    frame: "phone",
    width: 390,
    height: 844,
  },
  {
    id: "ranking",
    title: "Ranking",
    text: "Pontos de constância por semana, mês ou desde o início. O aluno pode sair do ranking quando quiser.",
    src: "/landing/videos/ranking",
    poster: "/landing/videos/ranking.webp",
    frame: "phone",
    width: 390,
    height: 844,
  },
];

export type FeatureId = "treinos" | "celular" | "evolucao" | "constancia" | "comunidade" | "alunos";

export const FEATURES: { id: FeatureId; name: string; pitch: string; gain: string }[] = [
  {
    id: "treinos",
    name: "Montador de treinos",
    pitch: "Monte por dias, com séries, repetições, carga, descanso, cadência e vídeo de execução. Cada publicação vira uma versão, sem apagar o histórico.",
    gain: "Um programa bem feito serve para vários alunos: atribua de uma vez e ajuste quando precisar.",
  },
  {
    id: "celular",
    name: "Treino no celular do aluno",
    pitch: "O aluno abre o treino do dia, registra carga e repetições e tem o descanso cronometrado. Recordes pessoais são calculados sozinhos.",
    gain: "Você vê o que foi feito de verdade, não o que ficou na memória.",
  },
  {
    id: "evolucao",
    name: "Evolução",
    pitch: "Peso e medidas em gráfico, e fotos de progresso privadas. O aluno escolhe o que compartilha com você.",
    gain: "Conversas sobre resultado com dado na mão.",
  },
  {
    id: "constancia",
    name: "Constância e ranking",
    pitch: "Treino concluído vira check-in. Pontos por frequência, bônus de meta semanal e competições com prêmio opcional.",
    gain: "A motivação de grupo trabalha a favor da frequência, sem premiar exagero.",
  },
  {
    id: "comunidade",
    name: "Comunidade e mensagens",
    pitch: "Um feed só da sua consultoria, com curtidas, comentários e moderação. Mensagens diretas em tempo real.",
    gain: "Avisos, conquistas e conversas no mesmo lugar onde o treino acontece.",
  },
  {
    id: "alunos",
    name: "Gestão de alunos",
    pitch: "Convites por e-mail, ficha com objetivo e nível, dados de saúde com consentimento e alunos parados em destaque.",
    gain: "Você sabe quem precisa de atenção antes da semana passar.",
  },
];

export const BENEFITS: { line: string; detail: string }[] = [
  {
    line: "Menos tempo administrando. Mais tempo treinando gente.",
    detail: "Programas com modelos e versões, atribuídos a vários alunos de uma vez.",
  },
  {
    line: "Quem some, aparece no seu painel.",
    detail: "Alunos há mais de 7 dias sem treinar ficam em destaque na visão geral.",
  },
  {
    line: "Constância vira hábito.",
    detail: "Um check-in por dia, pontos por treino concluído e bônus quando a meta da semana é batida.",
  },
  {
    line: "Todas as informações importantes. Em um só lugar.",
    detail: "Treinos, histórico, medidas e saúde do aluno na mesma ficha.",
  },
  {
    line: "Dados de saúde tratados como dados de saúde.",
    detail: "Só com consentimento do aluno, login em duas etapas e exportação ou exclusão dos dados quando ele pedir (LGPD).",
  },
];

/** Features every plan includes (plans differ only in students and storage: see the plans table). */
export const PLAN_FEATURES = [
  "Montador de treinos e biblioteca com vídeos",
  "Treino no celular do aluno",
  "Evolução: medidas e fotos privadas",
  "Check-in, ranking e competições",
  "Comunidade e mensagens em tempo real",
  "Login em duas etapas e ferramentas de LGPD",
];

/** The plan highlighted on the pricing section (by plan code). */
export const RECOMMENDED_PLAN = "equipe";
