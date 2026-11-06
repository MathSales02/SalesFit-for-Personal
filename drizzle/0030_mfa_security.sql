-- MFA integrity: an enabled factor always has a secret.
ALTER TABLE users ADD CONSTRAINT users_mfa_ck CHECK (NOT mfa_enabled OR mfa_secret IS NOT NULL);
--> statement-breakpoint
REVOKE TRUNCATE ON mfa_recovery_codes FROM cadencia_app;
