# Roadmap

## Phase 1 — Foundation ✅

- Stack, project structure, Docker Compose (Postgres, Redis, Mailpit), CI
- Database foundation + RLS tenant isolation + least-privilege roles
- Auth: trainer signup (workspace + 14-day trial), email verification, login, logout, password reset/change, session list and revocation
- Brute-force protection, rate limiting, audit log, security events
- RBAC policy, three role areas (trainer, student, admin) with distinct shells
- Design system: tokens, type (Barlow / Barlow Condensed), buttons, fields, notices, headings
- 59 automated tests (auth, sessions, tenant isolation, validation, rate limits)

## Phase 2 — Trainer management (in progress)

Done (2A):
- Student invitations by email (7-day single-use link, re-invite replaces the link, plan seat limit with a per-workspace lock)
- Invitation acceptance for new accounts and for existing accounts (must own the invited email)
- Student list (status tabs, pagination) and student file (goal, level, frequency, private trainer notes)
- Suspend / reactivate / archive (archive frees the seat; suspension cuts access immediately)
- Health records with explicit, revocable consent; student can view, edit and delete their own; trainer reads are audited
- 18 new tests (77 total)

Next (2B):
1. Exercise library (platform defaults + trainer's own)
2. Media pipeline: S3-compatible private storage (MinIO locally), upload validation, signed URLs
3. Program builder: days, exercises, sets/reps/load/rest/tempo, drag and drop, duplicate, templates, versioning, assignment

## Phase 3 — Student experience

Workout player (progress, rest timer, set logging, previous performance), history, PR detection, progress tracking, measurements and photos (private).

## Phase 4 — Social

Feed (chronological + ranked, cursor pagination), posts, comments, reactions, profiles, follows, messaging, notifications, reports, blocking, moderation.

## Phase 5 — Gamification

Configurable point rules, append-only ledger with idempotency, streaks, achievements, challenges with server-computed leaderboards, rewards and atomic redemptions.

## Phase 6 — Administration and SaaS

Admin tools (accounts, workspaces, reports, security events), plans, limits, payment provider integration with verified webhooks, break-glass access, data subject requests.

## Phase 7 — Hardening

MFA, Playwright E2E suite in CI, accessibility audit, performance review, retention jobs, deployment guide.

## Open business questions

- Plan prices and limits (seeded placeholders: Inicial R$ 79 / 30 alunos; Profissional R$ 149 / 150 alunos).
- Payment provider (Stripe, Mercado Pago, Pagar.me, Asaas…).
- Can students message other students by default, or only when the trainer enables it?
- Hosting region (Brazil-based hosting simplifies LGPD international transfer questions).
