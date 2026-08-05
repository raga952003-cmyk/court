-- Location-scoped courts: each TCS location has its own facilities.
-- Admins add/remove courts for their location only.
-- Run in Supabase SQL Editor after base schema.

ALTER TABLE facilities ADD COLUMN IF NOT EXISTS location TEXT;

-- Backfill existing courts to Chennai (PlaySmart default campus)
UPDATE facilities
SET location = 'Chennai, India'
WHERE location IS NULL OR trim(location) = '';

ALTER TABLE facilities ALTER COLUMN location SET DEFAULT 'Chennai, India';
ALTER TABLE facilities ALTER COLUMN location SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_facilities_location ON facilities (location);
CREATE INDEX IF NOT EXISTS idx_facilities_location_sport ON facilities (location, sport);

-- Prevent duplicate court names per sport within the same location
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'facilities_location_sport_court_unique'
  ) THEN
    ALTER TABLE facilities
      ADD CONSTRAINT facilities_location_sport_court_unique
      UNIQUE (location, sport, court_name);
  END IF;
END $$;
