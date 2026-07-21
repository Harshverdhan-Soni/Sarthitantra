-- ────────────────────────────────────────────────────────────────────────────
-- supabase_cli_auth.sql
-- Permanent CLI API tokens — no expiry, no rotation, works with any OAuth
-- provider (Google, email/password, etc.).
--
-- Run ONCE in the Supabase SQL Editor at: supabase.com → your project → SQL.
-- It is safe to re-run (CREATE IF NOT EXISTS / CREATE OR REPLACE throughout).
-- ────────────────────────────────────────────────────────────────────────────

-- ── 1. Table: one permanent API token per user ───────────────────────────────
--    Generated server-side with gen_random_bytes so it never passes through
--    the browser. Web app upserts a row at kit-download time; token persists
--    until the user explicitly re-downloads (which regenerates it).

CREATE TABLE IF NOT EXISTS user_api_tokens (
  user_id    UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  api_token  TEXT        NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used  TIMESTAMPTZ
);

ALTER TABLE user_api_tokens ENABLE ROW LEVEL SECURITY;

-- Users can read/write their own row (needed for the web app to upsert).
-- The RPC functions use SECURITY DEFINER so they bypass this policy.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'user_api_tokens'
      AND policyname = 'Users manage own CLI token'
  ) THEN
    CREATE POLICY "Users manage own CLI token"
      ON user_api_tokens FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;


-- ── 2. RPC: fetch all profile data — called by fetch_profile.py ──────────────
--    Returns {career_profiles: [...], user_settings: {...}}
--    No Supabase auth session needed — api_token is the only credential.

CREATE OR REPLACE FUNCTION cli_get_profile(p_user_id UUID, p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stored_token TEXT;
BEGIN
  -- Verify token
  SELECT api_token INTO v_stored_token
  FROM user_api_tokens
  WHERE user_id = p_user_id;

  IF v_stored_token IS NULL THEN
    RAISE EXCEPTION 'no_token_found — re-download the starter kit';
  END IF;
  IF v_stored_token != p_token THEN
    RAISE EXCEPTION 'invalid_token — re-download the starter kit to regenerate';
  END IF;

  -- Stamp last_used
  UPDATE user_api_tokens SET last_used = NOW() WHERE user_id = p_user_id;

  -- Return all profile data in one round-trip
  RETURN jsonb_build_object(
    'career_profiles', (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'profile_name', cp.profile_name,
            'is_default',   cp.is_default,
            'data',         cp.data,
            'preferences',  cp.preferences
          )
          ORDER BY cp.created_at
        ),
        '[]'::jsonb
      )
      FROM career_profiles cp
      WHERE cp.user_id = p_user_id
    ),
    'user_settings', (
      SELECT to_jsonb(us)
      FROM user_settings us
      WHERE us.user_id = p_user_id
      LIMIT 1
    )
  );
END;
$$;

-- Allow the anon role (unauthenticated clients) to call this function.
-- The api_token is the only gate — no Supabase session required.
GRANT EXECUTE ON FUNCTION cli_get_profile(UUID, TEXT) TO anon;


-- ── 3. RPC: upsert job_listings — called by sync_jobs.py ─────────────────────
--    Accepts a JSONB array of normalised job rows and upserts them.
--    Returns the count of rows processed.

CREATE OR REPLACE FUNCTION cli_sync_jobs(p_user_id UUID, p_token TEXT, p_rows JSONB)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stored_token TEXT;
  v_row          JSONB;
  v_count        INT := 0;
BEGIN
  -- Verify token
  SELECT api_token INTO v_stored_token
  FROM user_api_tokens
  WHERE user_id = p_user_id;

  IF v_stored_token IS NULL OR v_stored_token != p_token THEN
    RAISE EXCEPTION 'invalid_token — re-download the starter kit';
  END IF;

  -- Upsert each row
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    INSERT INTO job_listings (
      user_id,
      job_id,
      profile_name,
      company,
      role,
      location,
      work_mode,
      job_url,
      score,
      status,
      deal_breaker,
      eligible,
      notes,
      date_sourced,
      date_applied,
      salary_range,
      raw_data
    )
    VALUES (
      p_user_id,
      v_row->>'job_id',
      COALESCE(v_row->>'profile_name', 'Main'),
      v_row->>'company',
      v_row->>'role',
      v_row->>'location',
      v_row->>'work_mode',
      v_row->>'job_url',
      CASE WHEN v_row->>'score' IS NOT NULL AND v_row->>'score' != ''
           THEN (v_row->>'score')::INT ELSE NULL END,
      COALESCE(v_row->>'status', 'Sourced'),
      v_row->>'deal_breaker',
      v_row->>'eligible',
      v_row->>'notes',
      CASE WHEN v_row->>'date_sourced' IS NOT NULL AND v_row->>'date_sourced' != ''
           THEN (v_row->>'date_sourced')::DATE ELSE NULL END,
      CASE WHEN v_row->>'date_applied' IS NOT NULL AND v_row->>'date_applied' != ''
           THEN (v_row->>'date_applied')::DATE ELSE NULL END,
      v_row->>'salary_range',
      v_row->'raw_data'
    )
    ON CONFLICT (user_id, job_id, profile_name) DO UPDATE SET
      status       = EXCLUDED.status,
      score        = COALESCE(EXCLUDED.score,        job_listings.score),
      notes        = COALESCE(EXCLUDED.notes,        job_listings.notes),
      date_applied = COALESCE(EXCLUDED.date_applied, job_listings.date_applied),
      deal_breaker = COALESCE(EXCLUDED.deal_breaker, job_listings.deal_breaker),
      eligible     = COALESCE(EXCLUDED.eligible,     job_listings.eligible),
      salary_range = COALESCE(EXCLUDED.salary_range, job_listings.salary_range),
      raw_data     = COALESCE(EXCLUDED.raw_data,     job_listings.raw_data);

    v_count := v_count + 1;
  END LOOP;

  UPDATE user_api_tokens SET last_used = NOW() WHERE user_id = p_user_id;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION cli_sync_jobs(UUID, TEXT, JSONB) TO anon;
