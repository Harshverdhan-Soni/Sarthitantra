-- ══════════════════════════════════════════════════════════════════════
-- Phase 5 — Multi Career Track / Profile Support
-- Run this in Supabase SQL Editor (Project → SQL Editor → New query)
-- ══════════════════════════════════════════════════════════════════════

-- ── 1. Create career_profiles table ───────────────────────────────────
CREATE TABLE IF NOT EXISTS career_profiles (
  profile_id   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_name TEXT        NOT NULL DEFAULT 'Main',
  is_default   BOOLEAN     NOT NULL DEFAULT false,
  data         JSONB       DEFAULT '{}'::jsonb,
  preferences  JSONB       DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, profile_name)
);

-- ── 2. Row-Level Security ──────────────────────────────────────────────
ALTER TABLE career_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users own career profiles" ON career_profiles;
CREATE POLICY "Users own career profiles"
  ON career_profiles FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 3. Migrate existing user_profiles data ────────────────────────────
-- Copies every existing user's data into career_profiles as their 'Main' track.
-- Safe to run multiple times (ON CONFLICT DO NOTHING).
INSERT INTO career_profiles (user_id, profile_name, is_default, data)
SELECT id, 'Main', true, COALESCE(data, '{}'::jsonb)
FROM   user_profiles
ON CONFLICT (user_id, profile_name) DO NOTHING;

-- ── 4. Add profile_name to job_listings ──────────────────────────────
-- Allows each career track to have its own job board.
ALTER TABLE job_listings
  ADD COLUMN IF NOT EXISTS profile_name TEXT NOT NULL DEFAULT 'Main';

-- Index for fast per-profile queries
CREATE INDEX IF NOT EXISTS job_listings_user_profile_idx
  ON job_listings(user_id, profile_name);

-- ══════════════════════════════════════════════════════════════════════
-- After running this SQL:
-- 1. Existing users' data is preserved in the 'Main' career track.
-- 2. New career tracks can be created from the My Profile tab.
-- 3. Each track has its own job board, preferences, and resume.
-- ══════════════════════════════════════════════════════════════════════
