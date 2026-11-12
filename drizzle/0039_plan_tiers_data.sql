-- SalesFit Start / Pro / Elite (November 2026).
--
-- Plans now differ in features as well as in students and storage. What a student needs to
-- train (workout sheet, player, demonstrations, check-in, messages with the trainer) is in
-- every plan; the keys below unlock the rest:
--   community     feed, profiles, discover
--   ranking       points and weekly ranking
--   evolution     trainer sees students' measurements; progress photos
--   student_dm    messages between students
--   own_videos    trainer's own exercise videos
--   competitions  challenges with a prize
--
--              monthly   yearly (15% off)  students  storage
--   Start      R$ 29,90  R$ 304,98         10         1 GB    (no keys)
--   Pro        R$ 49,90  R$ 508,98         30        10 GB    all but competitions
--   Elite      R$ 79,90  R$ 814,98         100       50 GB    all

-- The previous line-up stops being offered. Whoever subscribed keeps the plan and everything
-- it had: every feature stays on for them.
UPDATE plans
SET is_active = false,
    features = '{"community": true, "ranking": true, "evolution": true, "student_dm": true, "own_videos": true, "competitions": true}'::jsonb,
    updated_at = now()
WHERE code IN ('starter', 'solo', 'equipe', 'pro', 'elite');
--> statement-breakpoint

-- The free trial shows the whole product, for up to 10 students.
UPDATE plans
SET features = '{"community": true, "ranking": true, "evolution": true, "student_dm": true, "own_videos": true, "competitions": true}'::jsonb,
    max_students = 10, storage_quota_mb = 1024, updated_at = now()
WHERE code = 'trial';
--> statement-breakpoint

INSERT INTO plans (code, name, max_students, storage_quota_mb, features, price_cents, annual_price_cents, is_active) VALUES
  ('sf_start', 'SalesFit Start', 10,  1024,  '{}', 2990, 30498, true),
  ('sf_pro',   'SalesFit Pro',   30,  10240, '{"community": true, "ranking": true, "evolution": true, "student_dm": true, "own_videos": true}', 4990, 50898, true),
  ('sf_elite', 'SalesFit Elite', 100, 51200, '{"community": true, "ranking": true, "evolution": true, "student_dm": true, "own_videos": true, "competitions": true}', 7990, 81498, true)
ON CONFLICT (code) DO NOTHING;
--> statement-breakpoint

ALTER TABLE plans ADD CONSTRAINT plans_annual_price_ck CHECK (annual_price_cents IS NULL OR annual_price_cents > 0);
