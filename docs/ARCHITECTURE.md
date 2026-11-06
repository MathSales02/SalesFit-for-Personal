# Cadência — Architecture

Fitness platform for personal trainers (consultorias) and their students: training management, workout logging, a private community, and gamification that rewards consistency.

## Stack and why

| Concern | Choice | Why |
|---|---|---|
| App | Next.js 16 (App Router), React 19, TypeScript strict | One deployable for UI and server logic; server components keep data and authorization on the server; server actions get built-in Origin checks (CSRF). |
| Database | PostgreSQL 18 + Drizzle ORM | Relational integrity, transactions, and **Row-Level Security** for tenant isolation in the database itself. Drizzle is thin, typed, and always parameterized. |
| Rate limiting | Redis (sliding window in Lua) | Shared counters across instances. In-memory store only for tests/local dev; production refuses to start without `REDIS_URL`. |
| Passwords | Argon2id (`@node-rs/argon2`) | OWASP baseline parameters (19 MiB, t=2, p=1); transparent rehash on login when parameters change. |
| Email | SMTP via nodemailer; Mailpit locally | Provider-agnostic. |
| Media (Phase 2) | S3-compatible private bucket + short-lived signed URLs | Cheap, CDN-friendly, no public object access. |
| Tests | Vitest against a real Postgres; Playwright for browser flows | RLS and transactions can only be proven against the real database. |

**Modular monolith.** No microservices: one app, with modules separated by folder and by rules (services never import `next/*`; UI never imports the database).

## Code layout

```
src/
  app/                 Routes (pt-BR URLs). Pages and server actions only — thin.
    (auth)/            entrar, cadastro, esqueci-senha, redefinir-senha, verificar-email
    treinador/ aluno/ admin/   One area per role, each with its own shell
    conta/             Account and session security, shared by all roles
  components/          Design system (ui/) and app shells (shell/)
  lib/                 Client-safe code: validation schemas, shared types
  server/              Server-only code
    auth/              Passwords, sessions, auth service, actor resolution
    authz/policy.ts    Central permission table (deny by default)
    db/                Schema, client, tenant context (withTenant / withSystem)
    http/              Next.js adapters: cookies, request meta, action runner
    security/          Rate limiting, audit log, security events
    mail/              Transport and templates
    workspace/         Workspace queries (dashboards)
  proxy.ts             Per-request CSP nonce + global per-IP rate limit
drizzle/               Versioned SQL migrations (0001_security.sql = RLS policies)
tests/                 Integration and security tests
```

## Multi-tenancy

- A **workspace** is one trainer's consultoria. Students and all future domain data carry `workspace_id`.
- Membership (`workspace_members`) holds the role (`trainer` / `student`) and status. Platform admin is a separate user flag, not a workspace role.
- Isolation is enforced twice:
  1. **Application:** every service calls `assertCan(actor, permission)` and scopes queries to `actor.membership.workspaceId`.
  2. **Database:** the app connects as `cadencia_app` (no DDL, no `BYPASSRLS`). `withTenant()` sets `app.user_id` / `app.workspace_id` per transaction; RLS policies check membership through `app_member_role()`, which reads `workspace_members` — a forged context cannot invent a role. With no context, tenant tables return nothing.
- Billing rows are writable only from `withSystem()` (trusted jobs, verified webhooks) or by platform admins. Tenant code cannot change its own subscription status.
- Platform admins see aggregates. RLS on future health, photo and message tables will **not** include an admin clause; access will require an audited break-glass flow.

## Sessions

Opaque 256-bit tokens in an `HttpOnly`, `SameSite=Lax`, `Secure` (`__Host-` prefix in production) cookie. Only the SHA-256 hash is stored. 7-day idle timeout, 30-day absolute lifetime, server-side revocation (logout, password change/reset, user list of active sessions). Membership is re-read on every request, so suspensions take effect immediately.

## Data model

Implemented in Phase 1: `users`, `sessions`, `auth_tokens`, `login_attempts`, `consents`, `workspaces`, `workspace_members`, `plans`, `subscriptions`, `audit_logs`, `security_events`.

Planned (all with `workspace_id` + RLS, soft delete where history matters):

| Phase | Tables |
|---|---|
| 2 Trainer | `student_profiles` (goals, level, frequency), `student_health_records` (restrictions, injuries — sensitive, consent-gated, no admin access), `invitations`, `exercises`, `media_assets` (videos/images, private keys only), `programs`, `program_versions`, `program_days`, `program_exercises`, `program_assignments` |
| 3 Student | `workout_sessions`, `workout_sets`, `personal_records`, `body_measurements`, `progress_photos` (private by default) |
| 4 Social | `posts`, `post_media`, `comments`, `reactions`, `follows`, `blocks`, `conversations`, `conversation_participants`, `messages`, `notifications`, `notification_preferences`, `reports`, `moderation_actions` |
| 5 Gamification | `point_rules` (trainer-configurable), `points_ledger` (append-only, unique `idempotency_key`), `achievements`, `user_achievements`, `challenges`, `challenge_participants`, `rewards`, `reward_redemptions` |
| 6 SaaS | `billing_events` (unique provider event id, signature-verified), `usage_counters`, `privileged_access_grants` |

Design rules for these:
- **Program versioning:** editing a program creates a new `program_version`; logged sets reference the version they were done against, so history never changes.
- **Points:** never stored as a balance only. Balance = `sum(points_ledger)`; rankings are derived views/materialized snapshots that can be rebuilt from the ledger. Points come from server-side rules reacting to verified events (a completed `workout_session` with sets), never from a client "award" call.
- **Redemption:** one transaction with `SELECT … FOR UPDATE` on the reward stock plus a unique constraint per (user, reward, period); the ledger debit and redemption row commit together.
- **Feeds and chat:** cursor pagination on `(created_at, id)` with matching indexes.

## Trade-offs

- **CSP `style-src 'unsafe-inline'`:** React style attributes need it. Scripts stay nonce-locked with `strict-dynamic`, which is where XSS risk lives.
- **Every page is dynamic** (nonce CSP requires it). Acceptable for an authenticated app; marketing pages can move to a static CDN later.
- **Global proxy rate limit fails open** if Redis is down, to avoid a full outage; auth limits marked `failClosed` deny instead, and login also has a database-backed lockout that works without Redis.
- **Server actions** report rate limits as a result object (the UI shows the wait time) instead of an HTTP 429; the proxy and future JSON route handlers return real 429 + `Retry-After`.
