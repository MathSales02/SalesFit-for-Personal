# Security controls

Target: OWASP ASVS Level 2, OWASP Top 10, OWASP API Security Top 10. Status reflects what is implemented **and covered by tests** as of Phase 1.

## Implemented

| Control | Where | Verified by |
|---|---|---|
| Argon2id hashing, rehash on parameter change | `src/server/auth/password.ts` | `tests/security-units.test.ts`, `tests/auth.test.ts` |
| Opaque session tokens, hashed at rest, idle + absolute expiry, revocation | `src/server/auth/session.ts` | `tests/auth.test.ts` (logout, expired, idle, suspended user, BOLA on revoke) |
| Cookie flags: HttpOnly, SameSite=Lax, Secure + `__Host-` in production | `src/server/http/next.ts` | Browser smoke test |
| Email verification required before login; single-use, 24 h tokens | `src/server/auth/service.ts` | `tests/auth.test.ts` |
| Password reset: 30 min single-use token, newer link voids older, all sessions revoked | `src/server/auth/service.ts` | `tests/auth.test.ts` |
| No account enumeration: same response for signup/reset on known and unknown emails; timing equalized on login | `src/server/auth/service.ts`, `password.ts` | `tests/auth.test.ts` |
| Brute force: per-IP and per-account limits + progressive lockout (30 s doubling to 15 min) stored in Postgres | `service.ts`, `security/rate-limit.ts` | `tests/auth.test.ts` (IP rotation does not bypass) |
| Rate limiting on every request (proxy, per IP) and every action (per user, per workspace, per sensitive action) | `src/proxy.ts`, `security/rate-limit.ts` | `tests/security-units.test.ts`, `tests/redis-rate-limit.test.ts` (atomic under concurrency) |
| Client IP from the trusted end of `X-Forwarded-For` only | `src/server/http/request-meta.ts` | `tests/security-units.test.ts` |
| RBAC, deny by default, central permission table | `src/server/authz/policy.ts` | `tests/security-units.test.ts` |
| Tenant isolation in Postgres RLS; app role without DDL/BYPASSRLS | `drizzle/0001_security.sql`, `db/context.ts` | `tests/tenant-isolation.test.ts` (14 negative cases) |
| Billing status writable only by system/admin context | RLS on `subscriptions` | `tests/tenant-isolation.test.ts` |
| Append-only audit log and security events (no UPDATE/DELETE grant) | `0001_security.sql`, `security/audit.ts` | `tests/tenant-isolation.test.ts` |
| Strict input validation; unknown, duplicated and file fields rejected | `lib/validation/*`, `http/action.ts` | `tests/security-units.test.ts` |
| Generic errors to users; no stack traces or SQL errors | `http/action.ts`, `app/error.tsx` | Code review |
| Log redaction of passwords, tokens, cookies, bodies | `lib/logger.ts` | `tests/security-units.test.ts` |
| CSP with per-request nonce, HSTS (prod), nosniff, frame-ancestors none, no-referrer, COOP/CORP, Permissions-Policy | `proxy.ts`, `next.config.ts` | Header check on running app |
| IPs and unknown emails stored only as keyed HMAC | `lib/crypto.ts` | `tests/security-units.test.ts` |
| Consent records (versioned, append-only) | `consents` table | Signup flow |
| Health data: RLS lets the trainer read only while consent is active; no admin clause; reads audited; student can erase | `drizzle/0003_students_security.sql`, `server/students/students.ts` | `tests/students.test.ts` |
| Invitations: hashed single-use tokens, 7-day expiry, email must match for existing accounts, seat limit race-safe | `server/students/invitations.ts` | `tests/students.test.ts` (incl. concurrent last-seat race) |
| Uploads: allowlisted types, signed POST bound to key/type/size, magic-byte verification after upload, rejected files deleted and logged, storage quota with lock, private bucket, 15-min signed playback | `server/media/service.ts`, `server/storage/*` | `tests/media-exercises.test.ts` (spoofed file, oversize, cross-workspace playback) |
| Programs: published versions immutable (trigger), exercises limited to platform or own workspace (trigger), students read only their assigned program's published content (RLS) | `drizzle/0007_programs_security.sql` | `tests/programs.test.ts` |
| Workouts: sets only for the day's prescribed exercises and only while open; finished sessions immutable; records and record flags only in system context; completion time from DB clock (all enforced by triggers using session_user) | `drizzle/0009..0011_*.sql`, `server/workouts/service.ts` | `tests/workouts.test.ts` |
| Progress data: measurements visible to the trainer only with health consent (RLS); photos private by default and shared per photo; private media readable only by owner or, when shared, the trainer (RLS, so signed URLs follow); photos re-encoded server-side to strip EXIF/GPS and non-pixel content; decompression-bomb guard | `drizzle/0013_progress_security.sql`, `server/progress/service.ts`, `server/storage/image-processing.ts` | `tests/progress.test.ts` |
| Community: RLS per workspace; held/removed posts visible only to author and trainer; announcements trainer-only; authors cannot edit, pin, approve or change counters (triggers); community images readable only once in a published post; NSFW verdict writable only by the system context; blocks hide content both ways without revealing the blocker | `drizzle/0015..0017_*.sql`, `server/community/service.ts`, `server/moderation/image-screen.ts` | `tests/community.test.ts` |
| Messaging: RLS limits conversations and messages to the two participants (no trainer or admin access); who-may-talk rule (blocks, trainer switch) re-checked on every message by the database; impersonation, read-marker tampering and edits refused; reported message disclosed to the trainer alone via system context | `drizzle/0019_messaging_security.sql`, `server/messaging/service.ts` | `tests/messaging.test.ts` |
| Notifications: created only from the system context, recipients can only mark as read, no private message text stored | `server/notifications/service.ts` | `tests/messaging.test.ts` |
| Gamification: check-ins and points written only by the server (system context, RLS), ledger append-only with unique idempotency keys, one check-in per day enforced by a unique index, ranking computed by a SQL function that respects hidden students, closed competitions frozen by trigger, point adjustments audited | `server/gamification/service.ts`, `0022_gamification_security.sql` | `tests/gamification.test.ts` |
| Subscription access: derived on every request from server-side dates (trial, paid period, 7-day grace); blocked workspaces are refused in `requirePageActor`/`requireActionActor` except an explicit allow-list (account, subscription, notice) | `server/billing/access.ts`, `server/http/next.ts` | `tests/admin-billing.test.ts` |
| Platform admin: separate permission list, every change audited with a mandatory reason, cannot suspend admins or itself, suspending a user revokes all sessions, admin DB context has no access to student, health, training, community or message tables | `server/admin/service.ts`, RLS policies | `tests/admin-billing.test.ts` |
| Payments (Asaas): API key only in server env; webhook authenticated by constant-time token comparison, rate limited, 256 KB cap; events stored once by unique id before processing (idempotent); workspace resolved only from the stored provider subscription id; invoice links restricted to https *.asaas.com; CPF/CNPJ validated and never stored; access changes only on verified payment events; billing tables written only in system context | `server/billing/*`, `app/api/webhooks/asaas/route.ts`, `0024_billing_provider_security.sql` | `tests/billing-provider.test.ts` |
| LGPD rights: self-service JSON export (secrets and storage keys stripped, read under the user's own RLS context, audited); account deletion with password re-check, cascading erasure of member data and storage files, ids-only audit trail | `server/privacy/service.ts`, `app/conta/meus-dados/route.ts`, `0026_privacy_security.sql` | `tests/privacy.test.ts` |
| Break-glass: admin support access is time-boxed (≤ 2 h, DB check), reason required, owner emailed and shown every grant, grants immutable except revocation (trigger), data served only by `app_support_overview()` which re-checks the caller's active grant and excludes health, photos, measurements, messages and posts; every view audited | `server/admin/support.ts`, `0026_privacy_security.sql`, `0028_support_overview.sql` | `tests/privacy.test.ts` |
| Cross-tenant integrity: composite foreign keys (member_id, workspace_id) | `0003_students_security.sql` | `tests/students.test.ts` |
| Secrets only via environment; validated at startup | `server/env.ts`, `.env.example` | — |
| Local services bound to 127.0.0.1; Redis password; least-privilege DB roles | `docker-compose.yml`, `docker/postgres/init.sh` | — |
| CI: lint, typecheck, tests, production dependency audit | `.github/workflows/ci.yml` | — |

## Not yet implemented (planned)

- MFA (TOTP). Schema flag exists; required for platform admins before launch. — Phase 7
- NSFW model is a first line of defence (false positives/negatives possible); reports and trainer review back it up. Text moderation (offensive words) relies on reports for now. — Phase 7
- Malware scanning of uploads (hook point marked in `server/media/service.ts`). — Phase 7
- Production bucket CORS allowlist (local storage reflects any origin; uploads still need a valid signature). — deployment
- Audited break-glass access for admins to sensitive data. — Phase 6
- Payment webhook signature verification and idempotency (`billing_events`). — Phase 6
- Data subject requests (export, deletion) and retention jobs for `login_attempts`, `security_events`, revoked sessions. — Phase 6/7
- Alerting on security events. — Phase 7

## Known dev-only advisories

`npm audit` reports moderate advisories in dev tooling only (esbuild inside drizzle-kit; minimatch inside ESLint). Production dependencies: 0 known vulnerabilities. CI fails on any production advisory.

## LGPD notes

Health data (restrictions, injuries, measurements, progress photos) is sensitive personal data (art. 11). Implemented: separate table, explicit `health_data_processing` consent (latest decision wins, enforced in RLS), no admin RLS clause, trainer reads audited, self-service deletion. Must never be shown in social features (Phase 4). Consent is currently per user, not per workspace; revisit if students may belong to several trainers. Legal texts in `/termos` and `/privacidade` are drafts and must be reviewed by a qualified professional before commercial launch.
