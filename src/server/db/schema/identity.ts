import { sql } from "drizzle-orm";
import { bigint, boolean, index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { timestamps } from "./_shared";

/**
 * Identity layer. These tables are global (not tenant scoped) and only the
 * auth service touches them. They have no RLS policies; application code never
 * exposes them without scoping by the authenticated user.
 */

export const userStatus = pgEnum("user_status", ["active", "suspended", "deactivated"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    displayName: text("display_name").notNull(),
    avatarKey: text("avatar_key"),
    status: userStatus("status").notNull().default("active"),
    isPlatformAdmin: boolean("is_platform_admin").notNull().default(false),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    mfaEnabled: boolean("mfa_enabled").notNull().default(false),
    /** TOTP secret, AES-256-GCM encrypted with MFA_ENCRYPTION_KEY. Set during enrollment, kept while MFA is on. */
    mfaSecret: text("mfa_secret"),
    /** Last accepted TOTP time step: a code can be used once. */
    mfaLastStep: bigint("mfa_last_step", { mode: "number" }),
    passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("users_email_lower_uq").on(sql`lower(${t.email})`)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    /** SHA-256 of the session token. The raw token only ever lives in the cookie. */
    tokenHash: text("token_hash").notNull(),
    activeWorkspaceId: uuid("active_workspace_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    idleExpiresAt: timestamp("idle_expires_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedReason: text("revoked_reason"),
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
  },
  (t) => [
    uniqueIndex("sessions_token_hash_uq").on(t.tokenHash),
    index("sessions_user_active_idx").on(t.userId).where(sql`revoked_at is null`),
  ],
);

export const authTokenPurpose = pgEnum("auth_token_purpose", ["email_verification", "password_reset", "mfa_challenge"]);

/** Single-use, short-lived tokens for email verification and password reset. Stored hashed. */
export const authTokens = pgTable(
  "auth_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    purpose: authTokenPurpose("purpose").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("auth_tokens_hash_uq").on(t.tokenHash),
    index("auth_tokens_user_purpose_idx").on(t.userId, t.purpose),
  ],
);

/** Login attempt log used for brute-force detection and progressive delays. */
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** HMAC of the normalized email, so attempts against unknown emails are not stored in clear text. */
    emailHash: text("email_hash").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    ipHash: text("ip_hash"),
    success: boolean("success").notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("login_attempts_email_time_idx").on(t.emailHash, t.createdAt),
    index("login_attempts_ip_time_idx").on(t.ipHash, t.createdAt),
  ],
);

export const consentPurpose = pgEnum("consent_purpose", [
  "terms_of_service",
  "privacy_policy",
  "health_data_processing",
  "community_profile",
  "marketing_email",
]);

/** Append-only consent records (LGPD art. 8). A withdrawal is a new row with granted = false. */
export const consents = pgTable(
  "consents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    purpose: consentPurpose("purpose").notNull(),
    documentVersion: text("document_version").notNull(),
    granted: boolean("granted").notNull(),
    ipHash: text("ip_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("consents_user_purpose_idx").on(t.userId, t.purpose, t.createdAt)],
);

/** One-time recovery codes for MFA, stored hashed. */
export const mfaRecoveryCodes = pgTable(
  "mfa_recovery_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("mfa_recovery_codes_hash_uq").on(t.codeHash), index("mfa_recovery_codes_user_idx").on(t.userId)],
);
