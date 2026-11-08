# Landing page do CadênciaFit: relatório de entrega

Rota `/` (`src/app/page.tsx`). Só a landing mudou, e também foram criados os planos oficiais no banco (autorizado). Autenticação, APIs, dashboard, permissões e pagamentos ficaram como estavam.

## 1. Direção de arte: "Compasso"

- **Ideia:** treino é ritmo. A marca usa barras verticais (os "beats"), que aparecem no logo, na barra de progresso da navbar e como textura nas seções.
- **Cores:** fundos escuros `#0e0e10` alternando com claro `#f4f2ee`; um único acento laranja do sistema (`#F97316` para preenchimentos com texto preto, `#C2410C` para texto laranja em fundo claro). Tokens escopados em `.lp` (`landing.css`), sem vazar para o resto do app.
- **Tipografia:** Manrope (a fonte da marca SalesFit), títulos em peso 800 e apertados (`.lp-display`).
- **Hero:** a foto de academia enviada (licenciada) como fundo, com escurecimento para manter o contraste do texto.
- **Movimento:** GSAP com batida de 0,5 s e easing `expo.out`. Entrada do hero em sequência, contadores, parallax leve pelo ponteiro, seção de funcionalidades fixada (pin) no desktop, linhas dos benefícios reveladas por máscara, inclinação leve dos cards de preço. Com "reduzir movimento" ativado, tudo aparece de uma vez e os vídeos não tocam sozinhos.

## 2. Arquivos e dependências

**Novos**

| Arquivo | Para quê |
|---|---|
| `src/components/landing/*` | Seções (navbar, hero, demo, funcionalidades, benefícios, preços, FAQ, CTA final, rodapé), mockups, player de vídeo, CSS escopado e o arquivo de conteúdo |
| `src/components/landing/assets/hero-treino.jpg` | Foto do hero (2560 px, 154 KB, sem EXIF) |
| `public/landing/videos/*` | 5 gravações (MP4 H.264 + WebM VP9 + pôster WebP, 40–230 KB cada) |
| `public/landing/og.jpg` | Imagem de compartilhamento (1200×630) |
| `src/app/icon.svg` | Favicon da marca (antes dava 404 no site inteiro) |
| `src/server/billing/public-plans.ts` | Leitura pública dos planos ativos para a página de preços |
| `drizzle/0031_official_plans.sql` | Planos oficiais (ver item 4) |
| `scripts/landing-media.ts` | Grava os vídeos a partir do sistema real |
| `e2e/landing.spec.ts` | 8 testes de navegador da landing |
| `docs/landing/RELATORIO.md` | Este relatório |

**Alterados:** `src/app/page.tsx` (substituiu a landing anterior em andamento), `next.config.ts` (formatos AVIF/WebP para `next/image`; badge de dev escondido só quando `NEXT_HIDE_DEV_INDICATOR` está definido), `package.json`, `.gitignore`, `README.md`, testes de cobrança (`starter` virou `solo`).

**Dependências**

- `gsap` + `@gsap/react`: animações com ScrollTrigger, SplitText e matchMedia, com limpeza automática no React. Todos os plugins são gratuitos desde a 3.13.
- `ffmpeg-static` (dev): converte as gravações sem exigir ffmpeg instalado na máquina.
- `@axe-core/playwright` (dev): já era usado nos testes de acessibilidade.

## 3. Funcionalidades mostradas e de onde vêm

Tudo o que a página afirma existe no código:

| Na landing | No sistema |
|---|---|
| Montador de treinos com versões e rascunho | `src/app/treinador/treinos`, programas versionados |
| Treino no celular, descanso cronometrado, recordes | Tela de treino do aluno, cálculo de PRs no servidor |
| Evolução: peso, medidas, fotos privadas | Módulo de evolução com consentimento |
| Constância, pontos, ranking, competições | Gamificação no servidor (`points_ledger`, desafios) |
| Comunidade e mensagens em tempo real | Feed com moderação, mensagens via SSE |
| Gestão de alunos, convites, alunos parados | Painel do treinador, convites por e-mail |
| Pix, boleto ou cartão; cancelamento | Integração Asaas |
| LGPD, exportação e exclusão de dados | Módulo LGPD |

Fora da página por não existir: controle financeiro, app nativo nas lojas, integrações com relógios.

## 4. Planos

**Confirmados e gravados no banco** (migração 0031; o plano antigo `starter` foi desativado, não apagado):

| Plano | Preço/mês | Alunos | Espaço |
|---|---|---|---|
| Solo | R$ 69,90 | 15 | 5 GB |
| Equipe (recomendado) | R$ 99,90 | 40 | 15 GB |
| Pro | R$ 139,90 | 100 | 40 GB |
| Elite | R$ 189,90 | 250 | 100 GB |

- Teste grátis de 14 dias, sem cartão, até 10 alunos.
- Todos os planos têm todos os recursos; muda só o limite de alunos e de espaço.
- A página lê preços e limites do banco, a mesma fonte que a cobrança usa. Mudou no admin, muda na página.

**Pendente:** nada nos planos.

## 5. Conteúdo pendente

- **Depoimentos, métricas e redes sociais:** listas vazias em `landing-content.ts`. A seção de prova social fica escondida até haver conteúdo real.
- **E-mail de contato:** usei `matheusssales0218@gmail.com` (a mensagem dizia só "@gmail"). Confirmar.
- **Termos de uso e política de privacidade:** ainda são rascunho; revisar com advogado antes de lançar.
- **Escolha de plano no cadastro:** os botões "Começar com {plano}" levam ao cadastro comum; o plano é escolhido depois, em Assinatura. Não existe parâmetro `?plano=`.

## 6. Como atualizar

**Textos, contato, depoimentos, métricas, redes:** edite `src/components/landing/landing-content.ts`. Listas vazias não aparecem. Só conteúdo real e verificável. As perguntas frequentes ficam em `faq-content.tsx`.

**Preços e limites:** pelo admin (Planos) ou por migração. Não ficam no código da página.

**Vídeos:**

1. Suba o servidor isolado da porta 3100 (README, "Testes de navegador") com `NEXT_HIDE_DEV_INDICATOR=1`.
2. Rode `npm run landing:media`. O script cria uma consultoria fictícia no banco **local** (recusa qualquer URL que não seja localhost), grava os 5 trechos e salva em `public/landing/videos/`.
3. Para trocar um vídeo à mão, mantenha o mesmo nome com `.mp4`, `.webm` e `.webp` e ajuste a entrada em `DEMOS`.

**Foto do hero:** substitua `src/components/landing/assets/hero-treino.jpg` (paisagem, cerca de 2560 px, sem EXIF).

## 7. QA

- **Testes:** 8 testes de navegador da landing + 8 do sistema, 197 testes unitários, typecheck e lint passando.
- **Larguras:** sem rolagem lateral em 360, 390, 768, 1024, 1280, 1440 e 1920 px. Abaixo de 1280 px as seções ficam no menu.
- **Acessibilidade:** axe sem violações em 390 e 1440 px. Navegação completa por teclado (abas com setas/Home/End, FAQ, menu com foco preso e Esc). Link "pular para o conteúdo". Página legível sem JavaScript.
- **Lighthouse (celular, build de produção):**

| Categoria | Nota |
|---|---|
| Performance | 89–90 |
| Acessibilidade | 100 |
| Boas práticas | 100 |
| SEO | 100 |

CLS 0; TBT ~210 ms; LCP simulado 3,1 s (o LCP observado foi 0,63 s; a diferença vem da simulação de CPU lenta processando o JavaScript).

## 8. Limitações e próximos passos

1. **Performance 89–90 em vez de 90+ estável:** o próximo ganho é carregar o GSAP depois da primeira pintura.
2. **Bug encontrado fora da landing (não corrigido):** em algumas consultas, `${tabela.id}` dentro de subconsultas SQL vira `"id"` sem o nome da tabela e passa a apontar para a tabela errada. Efeitos: a lista de programas mostra "0 alunos", e as contagens de alunos/assinantes no admin ficam erradas. A correção é pequena (qualificar a coluna).
3. **Arquivos antigos da navbar Liquid Glass** (`src/components/ui/liquid-glass-navbar.tsx` e `liquid-glass-navbar-demo.tsx`) não são mais usados e quebram o lint do repositório inteiro. Não foram apagados sem sua confirmação.
4. **Nome:** a landing usa "CadênciaFit"; o resto do sistema ainda diz "Cadência".
5. A landing anterior, que estava em andamento, foi substituída.
