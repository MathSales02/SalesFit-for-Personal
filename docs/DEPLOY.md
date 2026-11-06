# Guia de deploy

Como colocar o Cadência em produção com segurança. Vale para qualquer hospedagem que rode Node.js 24 e um container ou VM: Render, Railway, Fly.io, AWS, Google Cloud, Azure ou uma VPS.

> **Decisão em aberto: região de hospedagem.** Com dados de saúde, hospedar no Brasil (por exemplo AWS São Paulo, `sa-east-1`) evita discussões de transferência internacional na LGPD. Se a hospedagem for fora do Brasil, a política de privacidade precisa dizer isso.

## 1. Peças

| Peça | O que usar | Observações |
|---|---|---|
| App | `npm run build` e depois `npm start` (Next.js 16, Node 24) | Uma ou mais instâncias atrás de HTTPS. |
| PostgreSQL 16+ | Gerenciado (RDS, Cloud SQL, Neon, Supabase, Crunchy…) | Backup automático com recuperação ponto a ponto (PITR) e criptografia em repouso. |
| Redis 7 | Gerenciado (ElastiCache, Upstash, Redis Cloud…) | Obrigatório em produção: limites de requisição e sinais do chat ao vivo. |
| Armazenamento S3 | AWS S3, Cloudflare R2, Backblaze B2, MinIO… | Bucket **privado**, sem acesso público. CORS liberando o domínio do app (POST para upload, GET para fotos e vídeos). |
| E-mail (SMTP) | Amazon SES, Postmark, Resend, Mailgun… | Configure SPF, DKIM e DMARC no domínio do remetente. |
| Pagamentos | Asaas | Checklist em [ASAAS_NOTES.md](ASAAS_NOTES.md). |

### CORS do bucket

O navegador envia fotos e vídeos direto para o armazenamento (formulário assinado, POST) e os exibe por links assinados (GET). Na AWS S3 ou no Cloudflare R2, configure:

```json
[
  {
    "AllowedOrigins": ["https://seu-dominio"],
    "AllowedMethods": ["POST", "GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }
]
```

Crie o bucket com `npm run storage:init` (ou pelo painel). Não adicione política de leitura pública.

## 2. Banco de dados: dois usuários

O app **nunca** conecta como dono do banco. Crie dois usuários, como faz [docker/postgres/init.sh](../docker/postgres/init.sh):

- `cadencia_owner`: dono do schema. Usado **só** para migrações e para a rotina de limpeza.
- `cadencia_app`: usado pelo app. Pode só ler e escrever dados; não pode alterar a estrutura, não é superusuário e não tem `BYPASSRLS`. Por isso as regras de isolamento entre consultorias (RLS) valem sempre.

Rode o script de criação (ajustando host e senhas) uma vez. Depois, a cada versão nova, antes de subir o app:

```bash
DATABASE_MIGRATION_URL=postgres://cadencia_owner:...@host/cadencia npm run db:migrate
```

## 3. Variáveis de ambiente

Guarde-as no cofre de segredos da hospedagem, nunca no repositório. O app valida tudo ao iniciar e não sobe se faltar algo.

| Variável | Valor em produção |
|---|---|
| `NODE_ENV` | `production` |
| `APP_URL` | `https://seu-dominio` (o app exige https em produção) |
| `DATABASE_URL` | Conexão como `cadencia_app`, com `sslmode=require` |
| `DATABASE_MIGRATION_URL` | Conexão como `cadencia_owner` (só no job de migração e no job de limpeza) |
| `REDIS_URL` | `rediss://…` (com TLS e senha) |
| `SMTP_URL`, `MAIL_FROM` | Do provedor de e-mail |
| `TRUSTED_PROXY_HOPS` | Quantos proxies ficam na frente do app (balanceador = 1; CDN + balanceador = 2). Errar esse número permite falsificar o IP nos limites de requisição. |
| `PII_HASH_SECRET` | 32+ caracteres aleatórios. **Não troque depois**: os registros de segurança antigos deixariam de bater. |
| `MFA_ENCRYPTION_KEY` | 32+ caracteres aleatórios. **Não troque depois**: todos os autenticadores cadastrados parariam de funcionar. |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | Obrigatória com mais de uma instância. Chave AES de 32 bytes em base64, a mesma em todas as instâncias. |
| `S3_ENDPOINT`, `S3_PUBLIC_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | Do armazenamento. A chave de acesso deve valer só para esse bucket. |
| `ASAAS_API_URL`, `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN` | Produção do Asaas: `https://api.asaas.com/v3`. Use uma chave nova, nunca a do sandbox. |

Para gerar segredos: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.

Não defina `RATE_LIMIT_OVERRIDES` em produção; ela existe só para testes.

## 4. Proxy, HTTPS e chat ao vivo

- **HTTPS:** só HTTPS, com redirecionamento de HTTP. O app já envia HSTS, CSP com nonce, `X-Frame-Options: DENY` e `Referrer-Policy: no-referrer`.
- **Chat ao vivo:** usa conexões longas em `/api/conversas/<id>/eventos` (Server-Sent Events) que duram até 5 minutos.
  - No balanceador ou CDN, deixe o timeout de inatividade em **6 minutos ou mais**.
  - Não faça buffer nessa rota. O app envia `X-Accel-Buffering: no`, que o nginx respeita.
  - Se o proxy cortar a conexão, o chat continua funcionando com a consulta de reserva, só que mais devagar.
- **Webhook do Asaas** (`/api/webhooks/asaas`): se houver firewall, libere os IPs listados em [ASAAS_NOTES.md](ASAAS_NOTES.md).

## 5. Rotinas agendadas

| Rotina | Quando | Comando |
|---|---|---|
| Limpeza de dados (LGPD) | 1x por dia, de madrugada | `npm run jobs:retention` (precisa de `DATABASE_MIGRATION_URL` e das variáveis do S3) |

Use o agendador da hospedagem (cron, Scheduled Jobs, EventBridge…). A rotina imprime uma linha JSON com quantos registros removeu; fique de olho nela nos logs.

## 6. Primeiro acesso de administrador

Administradores não se cadastram pelo site. Com acesso ao banco:

```bash
ADMIN_PASSWORD='<senha longa>' DATABASE_MIGRATION_URL=... npm run admin:create -- voce@seudominio.com "Seu Nome"
```

No primeiro login, o painel exige ativar a verificação em duas etapas. Guarde os códigos de recuperação num gerenciador de senhas.

## 7. Monitoramento

- **Saúde:** `GET /api/health` responde 200 quando o banco responde. Use no balanceador e num monitor externo (UptimeRobot, Better Stack…).
- **Logs:** o app escreve uma linha JSON por evento (avisos e erros na saída de erro), sem senhas, tokens ou conteúdo de mensagens. Mande para o serviço de logs da hospedagem e crie alertas para:
  - `level: "error"`;
  - `asaas error response` e `webhook storage failed`;
  - `redis error`.
- **No painel admin, revise toda semana:**
  - Segurança: bloqueios de login, webhooks rejeitados, acessos de suporte;
  - Cobrança: eventos com falha.

## 8. Backups e recuperação

- **Backup do Postgres:** gerenciado, com PITR de pelo menos 7 dias, e um backup lógico semanal criptografado guardado em outra conta ou região.
- **Armazenamento:** ative o versionamento ou a replicação do bucket, para recuperar arquivos apagados por engano.
- **Teste de restauração:** restaure um backup numa base separada **a cada trimestre** e rode `npm run db:migrate` nela. Um backup que nunca foi restaurado não está garantido.
- **Segredos:** guarde `PII_HASH_SECRET` e `MFA_ENCRYPTION_KEY` também fora da hospedagem (cofre da empresa). Sem eles, o backup restaura, mas o MFA e os registros de segurança não funcionam.

## 9. Checklist antes de abrir para clientes

- [ ] Revisão jurídica dos Termos e da Política de Privacidade (hoje marcados como rascunho), incluindo a região de hospedagem e os provedores (e-mail, armazenamento, Asaas).
- [ ] Preços finais dos planos no painel admin.
- [ ] Asaas de produção: chave nova, webhook configurado como sequencial e com token, e um pagamento real de teste feito e estornado.
- [ ] Domínio de e-mail com SPF, DKIM e DMARC; teste de cadastro, convite e recuperação de senha chegando na caixa de entrada.
- [ ] `npm audit --omit=dev` sem vulnerabilidades e CI verde (unitários + E2E).
- [ ] Backup restaurado com sucesso pelo menos uma vez.
- [ ] Rotina de limpeza agendada e rodando.
- [ ] Administrador criado, com verificação em duas etapas ativa.
- [ ] Monitor externo apontando para `/api/health`.
