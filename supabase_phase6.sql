-- ══════════════════════════════════════════════════════════════════════
-- Phase 6 — Active Track Persistence
-- Run this in Supabase SQL Editor (Project → SQL Editor → New query)
-- Requires Phase 5 to have been run first.
-- ══════════════════════════════════════════════════════════════════════

-- ── 1. Create user_settings table ────────────────────────────────────
-- Stores per-user app settings. Currently holds active_track so that
-- when the user switches career tracks in the web app, fetch_profile.py
-- automatically picks up the correct track on the next run.

CREATE TABLE IF NOT EXISTS user_settings (
  user_id      UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  active_track TEXT        NOT NULL DEFAULT 'Main',
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. Row-Level Security ──────────────────────────────────────────────
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users own settings" ON user_settings;
CREATE POLICY "Users own settings"
  ON user_settings FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 3. Seed existing users with 'Main' as active track ────────────────
-- Safe to run multiple times (ON CONFLICT DO NOTHING).
INSERT INTO user_settings (user_id, active_track)
SELECT id, 'Main'
FROM   auth.users
ON CONFLICT (user_id) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════
-- After running this SQL:
-- 1. Every user has a user_settings row defaulting to 'Main'.
-- 2. The web app writes active_track on every track switch (via db.js).
-- 3. fetch_profile.py reads active_track instead of is_default, so it
--    always syncs whichever track the user last selected in the web app.
-- ══════════════════════════════════════════════════════════════════════
