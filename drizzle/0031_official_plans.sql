-- Official plans (November 2026). Every feature is in every plan; plans differ in
-- how many students (active + invited) and how much media storage they include.
--   Solo   R$ 69,90   15 students    5 GB
--   Equipe R$ 99,90   40 students   15 GB
--   Pro    R$ 139,90 100 students   40 GB
--   Elite  R$ 189,90 250 students  100 GB
-- The previous "Inicial" plan stops being offered; current subscribers keep it.

UPDATE plans SET is_active = false, updated_at = now() WHERE code = 'starter';
--> statement-breakpoint
UPDATE plans
SET name = 'Pro', price_cents = 13990, max_students = 100, storage_quota_mb = 40960,
    features = '{"community": true, "challenges": true}'::jsonb, is_active = true, updated_at = now()
WHERE code = 'pro';
--> statement-breakpoint
INSERT INTO plans (code, name, max_students, storage_quota_mb, features, price_cents, is_active) VALUES
  ('solo',   'Solo',   15,   5120, '{"community": true, "challenges": true}', 6990,  true),
  ('equipe', 'Equipe', 40,  15360, '{"community": true, "challenges": true}', 9990,  true),
  ('elite',  'Elite',  250, 102400, '{"community": true, "challenges": true}', 18990, true)
ON CONFLICT (code) DO NOTHING;
