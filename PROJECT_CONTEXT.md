# Cadência — Contexto do projeto

Documento para retomar o trabalho sem precisar reler a conversa inteira. Resume o que foi pedido, o que foi decidido, o que existe hoje e o que vem a seguir. Atualizado em 06/11/2026.

Documentos técnicos de apoio: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/SECURITY.md](docs/SECURITY.md), [docs/ROADMAP.md](docs/ROADMAP.md), [README.md](README.md).

---

## 1. O que é

Plataforma SaaS (multi-tenant) para personal trainers e seus alunos, combinando **treino + comunidade + competição + progresso + recompensas**.

- **Treinador:** gerencia alunos, monta treinos com vídeos, acompanha evolução.
- **Aluno:** vê e executa o treino, registra séries, acompanha progresso, participa da comunidade.
- **Administrador da plataforma:** gerencia contas, planos e moderação, sem acesso irrestrito a dados de saúde ou conversas.

Público inicial: Brasil (interface em português, LGPD). Nome provisório: **Cadência**.

## 2. Como o trabalho foi definido

O projeto começou com um "master prompt" detalhado do dono do projeto (Matheus). Os pontos centrais:

- Segurança em primeiro lugar (OWASP ASVS nível 2, OWASP Top 10 e API Top 10), isolamento entre consultorias no banco e na API, rate limiting em tudo, nada de confiar no frontend.
- LGPD: dados de saúde são sensíveis; consentimento explícito; nada sensível nas funções sociais.
- Gamificação que premia constância, não volume excessivo; pontos calculados só no servidor, com livro-razão imutável e idempotência.
- UI premium, mobile-first, sem cara de template gerado por IA.
- Trabalho em 7 fases, com testes, revisão de autorização e documentação ao fim de cada uma.

As fases:

| Fase | Conteúdo | Situação |
|---|---|---|
| 1 | Fundação: arquitetura, banco, autenticação, RBAC, isolamento, design system | ✅ |
| 2 | Gestão do treinador: alunos, exercícios, vídeos, montagem de treinos | ✅ |
| 3 | Experiência do aluno: execução do treino, cronômetro, histórico, progresso | ✅ (3A e 3C). A 3B (IA) foi adiada pelo usuário |
| 4 | Rede social: feed, comentários, curtidas, mensagens, notificações, moderação | **4A feita** (feed, curtidas, comentários, perfis, seguir, bloquear, denunciar, moderação, filtro NSFW); 4B (mensagens e notificações) a seguir |
| 5 | Gamificação: pontos, desafios, rankings, conquistas, recompensas | — |
| 6 | Administração e SaaS: planos, limites, pagamentos, webhooks | — |
| 7 | Segurança e otimização: auditoria, MFA, E2E, acessibilidade, deploy | — |

## 3. Histórico da conversa (resumo)

1. **Auditoria inicial.** A pasta estava vazia (só arquivos de skills de agentes). Foi proposta a stack (seção 4) e construída a Fase 1.
2. **Docker não subia.** O WSL não tinha a distribuição do Docker. Os testes da Fase 1 rodaram num PostgreSQL temporário criado a partir da instalação local. O usuário reiniciou o computador e o Docker passou a funcionar.
3. **GitHub.** O usuário criou o repositório https://github.com/MathSales02/cadencia e o código foi enviado (branch `main`).
4. **Conflito de portas.** A máquina já tem um PostgreSQL 18 como serviço do Windows (porta 5432) e um Redis de outro projeto (`crm_redis`, porta 6379). O Cadência passou a usar 5442 (Postgres) e 6389 (Redis), sem tocar nos outros.
5. **Fase 2A:** convites de alunos, ficha do aluno, suspender/arquivar, dados de saúde com consentimento.
6. **"Não consigo criar a conta, diz que tentei muitas vezes."** O servidor de desenvolvimento do usuário tinha sido iniciado antes da troca de portas e não alcançava o Redis. O cadastro bloqueia por segurança nesse caso, mas a mensagem dizia "muitas tentativas". A mensagem foi corrigida para "serviço temporariamente indisponível". Havia também um processo antigo do `next dev` preso na porta 3000; o usuário reiniciou e funcionou.
7. **Fase 2B-1:** biblioteca de exercícios e upload privado de vídeos. O MinIO deixou de publicar imagens Docker gratuitas, então foi adotado o **SeaweedFS** (compatível com S3).
8. **Fase 2B-2:** montador de treinos com versões, modelos e atribuição.
9. Durante os testes no navegador, os testes esgotaram o limite de cadastro do localhost (compartilhado com o servidor do usuário). Os contadores foram limpos e os testes passaram a usar um banco Redis separado. Também havia recarregamento em loop entre dois servidores `next dev`, corrigido com a pasta de build de teste dentro de `.next`.
10. **IA de evolução:** o usuário pediu, na Fase 3, uma IA que entenda a evolução do aluno e repasse ao personal. Ele escolheu Claude, só dados de treino, visível só ao personal. Depois **adiou a IA** para não ter custo agora (seção 7).
11. **Fase 3A:** execução do treino (player, séries, cronômetro, recordes, histórico). Os testes encontraram e fecharam uma brecha nas regras do banco: funções com privilégio de dono usavam `current_user`; agora usam `session_user`.
12. **Fase 3C:** medidas corporais e fotos de progresso privadas. Cada foto é reprocessada no servidor (sem GPS nem metadados).
13. **Fase 4 (rede social).** O usuário quer uma rede social de verdade dentro da consultoria: alunos postam treinos, curtem e comentam, com segurança e **filtro NSFW** nas imagens. Decisões:
    - Filtro NSFW **no próprio servidor, sem custo** (modelo open-source `nsfwjs`): bloqueia o explícito e manda o duvidoso para revisão do treinador.
    - **Mensagens entre alunos ligadas por padrão**, com o treinador podendo desligar (configuração da consultoria).
    - **4A** (feed, curtidas, comentários, seguir, bloquear, denunciar, moderação) e **4B** (mensagens e notificações).
    - Os testes da 4A encontraram outra brecha: o autor podia alterar direto o contador de curtidas do próprio post. Fechada.

Commits até aqui:

```
071a1da Phase 1: foundation (auth, RBAC, tenant isolation, design system)
231e690 Local infra: avoid port clashes, add Redis limiter tests
3a37582 Phase 2A: student invitations, profiles, health data with consent
90f9e3b Report an unreachable rate-limit store as unavailable, not as too many attempts
c533ae6 Phase 2B-1: exercise library and private video uploads
ed98eda CI: fix line continuation in storage step
b42baf5 Phase 2B-2: program builder, versioning and assignments
defb831 Remove test build paths that next dev added to tsconfig
fcfed76 Add PROJECT_CONTEXT.md
35bc13c Phase 3A backend: workout sessions, set logging and personal records
a0e4749 Phase 3A UI: workout player, rest timer, summary, history, trainer view
f42e903 Phase 3C: body measurements and private progress photos
9ee5fdc Phase 4A backend: community feed, likes, comments, follows, blocks, reports, NSFW screening
```

### Onde paramos (atualizado a cada etapa)

**Fase 4A concluída e no GitHub** (backend, interface e teste no navegador). **Próximo: 4B**, com mensagens diretas (aluno ↔ treinador sempre; aluno ↔ aluno salvo se o treinador desligar; bloqueio impede conversa) e notificações (curtidas, comentários, mensagens, treino atribuído, posts aprovados).

## 4. Stack e decisões principais

| Área | Escolha | Por quê |
|---|---|---|
| App | Next.js 16 (App Router, `proxy.ts`), React 19, TypeScript strict | Um único app (monólito modular); lógica e autorização no servidor. Atenção: o Next 16 tem mudanças; a documentação dele está em `node_modules/next/dist/docs/` (ver `AGENTS.md`). |
| Banco | PostgreSQL 18 + Drizzle ORM | Integridade relacional, transações e **Row-Level Security** para isolar consultorias no próprio banco. |
| Rate limiting | Redis (janela deslizante em Lua) | Contadores compartilhados entre instâncias. Produção não sobe sem Redis. |
| Senhas | Argon2id | Parâmetros OWASP, re-hash automático. |
| Arquivos | Storage S3 privado (SeaweedFS local) | Upload direto do navegador com formulário assinado; verificação do conteúdo real no servidor; reprodução por link que expira em 15 min. |
| E-mail | SMTP (Mailpit local) | Independente de provedor. |
| Testes | Vitest com Postgres, Redis e storage reais; Playwright nos fluxos de navegador | RLS e transações só se provam no banco real. |

Princípios que valem para todo código novo:

- **Duas camadas de autorização:** `assertCan(actor, permissão)` no serviço (tabela central em `src/server/authz/policy.ts`, negação por padrão) **e** RLS no Postgres. O app conecta como `cadencia_app`, sem permissão de DDL nem `BYPASSRLS`.
- **Contexto do banco:** toda consulta de dados de consultoria passa por `withTenant({ userId, workspaceId })`. Faturamento só é gravado em `withSystem()`.
- **Chaves estrangeiras compostas** `(id, workspace_id)` impedem referência cruzada entre consultorias.
- **Dados de saúde:** tabela separada; o treinador só lê com consentimento ativo; admin não tem acesso; cada leitura é auditada; o aluno pode apagar.
- **Histórico imutável:** versões publicadas de treino não mudam (gatilho no banco); logs de auditoria e eventos de segurança só aceitam inserção.
- **Entrada validada com Zod em modo estrito;** campos inesperados são rejeitados.
- **Erros:** o usuário vê só mensagens genéricas, nunca stack trace ou erro de SQL.
- **Formulários:** `ActionForm` envia por transição para o React não limpar os campos após erro; use `resetOnSuccess` quando o formulário deve ser limpo.

## 5. O que existe hoje

- **Autenticação:** cadastro de treinador (cria a consultoria e 14 dias de teste), confirmação de e-mail obrigatória, login com bloqueio progressivo, recuperação e troca de senha, lista de sessões com encerramento.
- **Treinador:** visão geral, **Alunos** (convite por e-mail, abas por situação, ficha, saúde com consentimento, suspender/arquivar), **Treinos** (montador com dias, versões, modelos, atribuição), **Exercícios** (biblioteca própria + 35 padrão, vídeos).
- **Aluno:** início com o programa atual (dias, séries, vídeo e instruções), **Saúde** (consentimento, dados próprios, exclusão), perfil e sessões.
- **Admin:** painel com números agregados e eventos de segurança.
- **Treino do aluno (3A):** player no celular com registro de séries, cronômetro de descanso, carga da última vez, recordes calculados no servidor, resumo, histórico; o treinador vê constância de 8 semanas, últimos treinos e recordes na ficha do aluno.
- **Progresso (3C):** medidas corporais com gráfico e tabela (o treinador vê e registra avaliações só com consentimento de saúde); fotos privadas por padrão, compartilhadas uma a uma, com comparação antes/depois; o servidor reprocessa cada foto e remove localização GPS e metadados.
- **Comunidade (4A):** feed da consultoria (todos/seguindo), avisos fixados do treinador, posts com texto, foto ou treino compartilhado, curtidas, comentários com respostas, perfis, seguir, bloquear, denunciar; fila de moderação do treinador; aprovação prévia opcional; filtro NSFW no servidor.
- **Qualidade:** 143 testes automáticos, lint, typecheck, CI no GitHub Actions (Postgres, Redis e storage reais), auditoria de dependências de produção.

## 6. Ambiente local

```bash
npm run infra:up              # Postgres :5442, Redis :6389, storage S3 :8333, Mailpit :1025/:8025
npm run db:migrate            # e: npm run db:migrate -- --test
npm run storage:init          # e: npm run storage:init -- --test
npm run dev                   # http://localhost:3000  (e-mails em http://localhost:8025)
npm test
```

- O `.env` só é lido quando o `npm run dev` inicia. Mudou o `.env`, reinicie.
- Não usar as portas 5432 e 6379 nem mexer no `crm_redis`/`crm_mysql` (são de outros projetos).
- Testes de navegador em paralelo ao servidor do usuário:
  `REDIS_URL=<REDIS_URL do .env>/1 NEXT_DIST_DIR=.next/e2e APP_URL=http://localhost:3100 npx next dev -p 3100`.
  Ao terminar, pare o servidor e apague `.next/e2e`. Se o `next dev` adicionar caminhos `.next/e2e` ao `tsconfig.json`, remova antes do commit.
- Admin da plataforma: `ADMIN_PASSWORD='...' npm run admin:create -- email "Nome"`.
- O projeto está dentro do OneDrive; considerar mover para fora ou excluir `node_modules` da sincronização.

## 7. Próximo passo: Fase 3 + IA de evolução

### Fase 3 (experiência do aluno)

- Executar o treino: progresso, navegação entre exercícios, registro de séries, repetições e carga.
- Cronômetro de descanso.
- Referência do último desempenho.
- Resumo ao concluir; detecção de recorde pessoal; histórico automático.
- Cada sessão registrada aponta para a **versão** do programa usada.
- Medidas corporais e fotos de progresso: privadas por padrão, com consentimento.
- Pontos e recompensas ficam para a Fase 5, mas os registros precisam permitir calculá-los no servidor (sessão verificada, idempotência).

### IA de evolução do aluno (pedido do usuário)

**Objetivo:** a IA lê o histórico de treinos de cada aluno, entende a evolução e repassa ao personal: resumos, alertas e sugestões.

Exemplos de saída para o treinador:
- Resumo semanal por aluno: frequência, cargas, recordes, aderência ao programa.
- Alertas: queda de frequência, estagnação de carga, sessões abandonadas, dor relatada.
- Sugestões, como progressão de carga ou troca de exercício. O personal sempre decide; a IA nunca altera o treino sozinha.

Diretrizes já definidas pelo master prompt e pela arquitetura:
- A IA roda **no servidor**, com dados de **uma consultoria por vez**, dentro do mesmo controle de acesso (RLS, `withTenant`).
- Só o treinador do aluno vê as análises. O aluno pode ver as próprias, se for decidido.
- **Dados de saúde** só entram na análise com consentimento ativo e devem ser minimizados (enviar o necessário, sem nome e e-mail).
- Enviar dados a um provedor de IA é tratamento de dado pessoal, e possivelmente **transferência internacional** pela LGPD: precisa de base legal, de constar na política de privacidade e provavelmente de consentimento específico.
- Custos por chamada: gerar em lote (por exemplo, semanal) e sob demanda com limite de uso, cacheando o resultado.
- Cada análise gerada fica registrada (quando, de qual período, por qual versão do modelo), com trilha de auditoria.

Decisões tomadas pelo usuário (06/11/2026):
- **Provedor:** Claude (Anthropic), via API, com chave no `.env` (nunca no código).
- **Dados enviados:** só dados de treino (frequência, séries, cargas, recordes, observações de treino). **Dados de saúde não entram.**
- **Quem vê:** só o personal. A IA é assistente do treinador, que decide o que repassar ao aluno.

Ordem de construção: 3A (execução do treino, séries, cronômetro, recordes, histórico) ✅, depois 3C (medidas e fotos de progresso). **A 3B (IA) foi adiada pelo usuário em 06/11/2026** para não gerar custo agora. Quando for retomada, será preciso uma chave `ANTHROPIC_API_KEY` no `.env`. Os dados de treino da 3A já estão estruturados para a análise.

## 8. Decisões de negócio em aberto

- Preço e limite de alunos de cada plano (hoje são valores de exemplo: R$ 79 com 30 alunos, R$ 149 com 150).
- Provedor de pagamento (Stripe, Mercado Pago, Asaas…).
- ~~Alunos podem trocar mensagens entre si por padrão?~~ Decidido: sim, com o treinador podendo desligar.
- Região de hospedagem (no Brasil simplifica a LGPD).
- **IA:** quem paga o custo (incluso no plano ou recurso premium) e o texto de aviso/consentimento sobre o uso de IA. Provedor, dados enviados e quem vê já foram decididos (seção 7).
- Os textos de Termos e Privacidade são rascunhos e precisam de revisão jurídica antes do lançamento.
