-- scripts/setup_supabase_schema.sql
--
-- AQMAR Supabase schema. Paste this into the Supabase Dashboard
-- SQL Editor and click "Run". Idempotent — safe to re-run.
--
-- After running:
--   1. martyrs table exists with RLS enabled
--   2. martyrs_duplicates table exists
--   3. Public can SELECT, only authenticated users can INSERT/UPDATE
--   4. updated_at auto-updates on row modification

-- =========================================================================
-- MAIN TABLE
-- =========================================================================

CREATE TABLE IF NOT EXISTS martyrs (
  msg_id              integer PRIMARY KEY,
  name                text,
  name_normalized     text,
  birth_date          date,
  martyrdom_date      date,
  city                text,
  military_rank       text,
  weapon              text,
  battalion           text,
  brigade             text,
  photo_path          text,
  posted_date         timestamptz,
  message_link        text,
  extraction_status   text,
  duplicate_status    text,
  manual_edited_at    timestamptz,
  manual_edited_by    text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

-- Auto-update updated_at on UPDATE
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS martyrs_updated_at ON martyrs;
CREATE TRIGGER martyrs_updated_at
  BEFORE UPDATE ON martyrs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Indexes for the SPA's filter/sort dimensions
CREATE INDEX IF NOT EXISTS idx_martyrs_birth     ON martyrs (birth_date);
CREATE INDEX IF NOT EXISTS idx_martyrs_martyrdom ON martyrs (martyrdom_date);
CREATE INDEX IF NOT EXISTS idx_martyrs_status    ON martyrs (extraction_status);

-- Row Level Security: public reads, only authenticated admin writes
ALTER TABLE martyrs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read martyrs" ON martyrs;
CREATE POLICY "Anyone can read martyrs"
  ON martyrs FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Authenticated can insert martyrs" ON martyrs;
CREATE POLICY "Authenticated can insert martyrs"
  ON martyrs FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated can update martyrs" ON martyrs;
CREATE POLICY "Authenticated can update martyrs"
  ON martyrs FOR UPDATE
  TO authenticated
  USING (true);

-- =========================================================================
-- DUPLICATES TABLE
-- =========================================================================

CREATE TABLE IF NOT EXISTS martyrs_duplicates (
  msg_id              integer PRIMARY KEY,
  name                text,
  reason              text,
  resolution          text,
  size_mb             numeric,
  kept_msg_id         integer,
  link                text,
  created_at          timestamptz DEFAULT now()
);

ALTER TABLE martyrs_duplicates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read dupes" ON martyrs_duplicates;
CREATE POLICY "Anyone can read dupes"
  ON martyrs_duplicates FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Authenticated can insert dupes" ON martyrs_duplicates;
CREATE POLICY "Authenticated can insert dupes"
  ON martyrs_duplicates FOR INSERT
  TO authenticated
  WITH CHECK (true);
