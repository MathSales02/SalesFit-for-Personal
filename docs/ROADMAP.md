# Roadmap

## Phase 1 — Foundation ✅

- Stack, project structure, Docker Compose (Postgres, Redis, Mailpit), CI
- Database foundation + RLS tenant isolation + least-privilege roles
- Auth: trainer signup (workspace + 14-day trial), email verification, login, logout, password reset/change, session list and revocation
- Brute-force protection, rate limiting, audit log, security events
- RBAC policy, three role areas (trainer, student, admin) with distinct shells
- Design system: tokens, type (Barlow / Barlow Condensed), buttons, fields, notices, headings
- 59 automated tests (auth, sessions, tenant isolation, validation, rate limits)

## Phase 2 — Trainer management ✅

Done (2A):
- Student invitations by email (7-day single-use link, re-invite replaces the link, plan seat limit with a per-workspace lock)
- Invitation acceptance for new accounts and for existing accounts (must own the invited email)
- Student list (status tabs, pagination) and student file (goal, level, frequency, private trainer notes)
- Suspend / reactivate / archive (archive frees the seat; suspension cuts access immediately)
- Health records with explicit, revocable consent; student can view, edit and delete their own; trainer reads are audited
- 18 new tests (77 total)

Done (2B-1):
- Exercise library: 35 platform exercises (pt-BR) plus each trainer's own; copy to customize; search and muscle-group filter; archive
- Private video uploads: signed direct-to-storage form (exact key, type and size), server-side size and file-signature check, rejected files deleted, plan storage quota, 15-minute signed playback URLs
- 16 new tests (93 total)

Done (2B-2):
- Program builder: days, prescribed exercises (sets, reps, load, rest, tempo, notes, variation), drag-and-drop plus keyboard reordering, duplicate day
- Versioning: one draft per program; publishing freezes a version (enforced by database triggers); students always see the latest published version
- Templates and duplication; archive
- Assignment to students with start/end dates (one active program per student); student home shows the program with videos and instructions
- 13 new tests (106 total)

## Phase 3 — Student experience ✅ (AI analysis postponed)

Done (3A):
- Workout player (mobile-first): exercise navigation, set logging with optimistic updates, previous performance prefilled, variations, extra sets, rest timer (+15s, skip, vibration), elapsed time, effort (1-10) and notes on finish
- Server-side personal records (estimated 1RM, Epley), idempotent completion, database-clock duration
- History with keyset pagination; summary page; open-workout banner (resume or abandon)
- Trainer view per student: 8-week consistency vs weekly target, recent workouts, recent records
- 11 new tests (117 total)

Done (3C):
- Body measurements (weight, body fat, waist, hip, chest, arm, thigh): student records; trainer sees and records assessments only with the student's health consent; line chart with crosshair/keyboard tooltip plus an exact table
- Progress photos: private by default, shared one by one with the trainer, before/after comparison; server re-encodes every photo (strips EXIF/GPS, max 1600 px WebP, discards non-pixel content)
- 10 new tests (127 total)

Postponed by the product owner (no cost for now):
- 3B: AI progress analysis for the trainer (Claude; training data only, never health data; trainer-only). Needs ANTHROPIC_API_KEY.

## Phase 4 — Social ✅

Done (4A):
- Community feed per workspace (all / following), keyset pagination, pinned trainer announcements
- Posts with text, photo or a shared workout (summary numbers and records only); likes; comments with one level of replies
- Profiles, follow, block (hides content both ways), report; trainer moderation queue, optional approval of student posts, community on/off
- Photo safety: re-encoding (EXIF/GPS stripped) and on-server NSFW screening (open-source model): explicit refused, suggestive held for review
- Anti-spam: link limits, duplicate-post window, per-action rate limits; counters maintained by the database
- 16 new tests (143 total)

Done (4B):
- Direct messages: trainer-student always, student-student unless the trainer turns it off, blocks stop sending; only the two participants can read (not the trainer, not admins); photos screened (only fully clear images); sender deletes; report a message (trainer sees only that message); unread counts; polling every 4 s (WebSocket planned for Phase 7)
- Notifications: likes, comments, replies, followers, messages, program assigned/updated, post approved/removed, announcements; deduplicated, no private text, per-member preferences, ready for email/push
- Header badges; trainer mobile menu
- 13 new tests (156 total)

## Phase 5 — Gamification

Done (5A):
- Check-ins: a completed workout checks in automatically; a manual check-in (activity outside the program) is allowed once per day, worth fewer points, and the trainer can turn it off. One check-in per local day (America/Sao_Paulo); a workout after a manual check-in upgrades it by the difference.
- Constancy points in an append-only ledger with idempotency keys: workout, manual check-in, weekly-goal bonus (student's weekly frequency), trainer adjustments with a mandatory reason (audited). All computed on the server.
- Rankings by week / month / all time, computed in SQL; students can hide themselves (only they and the trainer still see their position); the trainer can turn the ranking off.
- Competitions with dates, rules and an optional prize; students join or leave while open; after the last day the trainer closes it and the official result is frozen; cancel.
- Student home card (points, position, weekly goal, streak, check-in), ranking page, trainer panel (rules, adjustments, competitions).
- 11 new tests (167 total).

Next (5B, if wanted): achievements, reward catalog and atomic redemptions.

## Phase 6 — Administration and SaaS

Admin tools (accounts, workspaces, reports, security events), plans, limits, payment provider integration with verified webhooks, break-glass access, data subject requests.

Decisions: payment provider is **Asaas** (Pix, boleto and card subscriptions); plan prices stay as placeholders, editable in the admin panel. Achievements and rewards (old 5B) move to after launch.

Done (6A):
- Subscription-based access computed at read time:
  - trial, active, a 7-day grace period after a missed payment, then blocked.
  - Blocked workspaces keep only account, subscription and notice screens; every other page redirects and every other action is refused.
  - Students see a neutral notice; nothing is deleted.
- Trainer subscription page and reminders (trial ending, late payment, paused access).
- Admin panel:
  - Workspaces: search, detail, suspend/reactivate with reason.
  - Manual subscription changes: extend trial, grant a paid plan until a date, change plan, expire.
  - Users: search, suspend/reactivate, which ends sessions; never admins or yourself.
  - Plan editing: the trial plan stays free and available.
  - Security events and audit log viewers.
  - Admins still cannot read student, health, training, community or message data (RLS).
- 8 new tests (175 total).

Done (6C), Asaas online payment:
- The trainer picks a plan and gives the CPF/CNPJ once (validated, not stored by us), then pays the Asaas invoice by Pix, boleto or card.
- Plan changes apply at renewal; cancel keeps the paid period.
- Webhook:
  - Authenticated by a constant-time token check and rate limited.
  - Each event is stored once before processing, so redeliveries do nothing.
  - Failures are kept for an admin to reprocess.
  - Unknown fields and events are tolerated.
- If saving a checkout fails, the subscription created at Asaas is undone.
- Admin page for billing events.
- Verified end to end against the Asaas sandbox.
- 9 new tests with a fake Asaas (184 total).
- Production checklist in [ASAAS_NOTES.md](ASAAS_NOTES.md).

Done (6B):
- **Data export (LGPD access and portability).** Every user can download a JSON file of their account, sessions, consents and, per workspace, the data they own:
  - training, health, progress, community activity, messages they sent, notifications and points.
  - Secrets and storage paths are excluded.
- **Account deletion (LGPD erasure).**
  - Requires the password and typing "EXCLUIR".
  - The user row is deleted and everything the member owns cascades; files are removed from storage.
  - History guards let cascaded deletes through (trigger depth), and the comment counter handles deletes.
  - Audit entries keep only ids.
  - Workspace owners and admins go through support.
- **Break-glass support access.**
  - An admin opens a 15, 30 or 60 minute read-only window on one workspace with a written reason (at least 20 characters). The database caps grants at 2 hours and makes them immutable except for revocation.
  - The owner is emailed and sees every access on the overview.
  - The data comes from a SQL function that re-checks the grant and returns only students' names, status, program and workout counts, plus program names. It never returns health, photos, measurements, messages or posts.
  - Every view is audited.
- 5 new tests (189 total).

Phase 6 is complete.

## Phase 7 — Hardening

MFA, Playwright E2E suite in CI, accessibility audit, performance review, retention jobs, deployment guide.

Done (7A), two-step verification (TOTP):
- Login works with any authenticator app.
- Optional for trainers and students; required for platform admins (admin pages and actions are refused until it is on).
- Secrets are encrypted at rest (AES-256-GCM, `MFA_ENCRYPTION_KEY`), and each code is accepted once.
- 10 single-use recovery codes, stored hashed and regenerable.
- The password step only returns a 5-minute single-use challenge; the session is created after the code.
- Enabling ends other sessions. Email on enable/disable; security event when a recovery code is used.
- Rate limited per user (failures only).
- 6 new tests, including the RFC 6238 vectors (195 total).

## Open business questions

- Plan prices and limits (seeded placeholders: Inicial R$ 79 / 30 alunos; Profissional R$ 149 / 150 alunos).
- Payment provider (Stripe, Mercado Pago, Pagar.me, Asaas…).
- Can students message other students by default, or only when the trainer enables it?
- Hosting region (Brazil-based hosting simplifies LGPD international transfer questions).
