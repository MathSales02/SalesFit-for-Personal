# Cadência

Platform for personal trainers and their students: training, progress, community and consistency-based rewards.

- Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Security controls: [docs/SECURITY.md](docs/SECURITY.md)
- Roadmap and phase status: [docs/ROADMAP.md](docs/ROADMAP.md)

## Run locally

Requirements: Node.js 22+, Docker Desktop.

```bash
cp .env.example .env          # then replace every "change-me" with a long random value
npm install
npm run infra:up              # Postgres, Redis, object storage and Mailpit, bound to 127.0.0.1
npm run db:migrate            # main database
npm run db:migrate -- --test  # test database
npm run storage:init          # private media bucket (add -- --test for the test bucket)
npm run dev                   # http://localhost:3000
```

Emails (verification, password reset) are captured by Mailpit at http://localhost:8025.

Create a platform administrator (admins cannot sign up through the site):

```bash
ADMIN_PASSWORD='a long passphrase' npm run admin:create -- admin@example.com "Admin Name"
```

## Checks

```bash
npm run lint
npm run typecheck
npm test        # needs TEST_DATABASE_URL and TEST_DATABASE_MIGRATION_URL (see .env.example)
npm run build
```
