-- Per-location sport capacities + optional per-court player capacity.
-- Same booking workflow everywhere; each location configures its own infrastructure size.

-- Optional override on each court (NULL = use location sport default)
ALTER TABLE facilities ADD COLUMN IF NOT EXISTS player_capacity INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'facilities_player_capacity_check'
  ) THEN
    ALTER TABLE facilities
      ADD CONSTRAINT facilities_player_capacity_check
      CHECK (player_capacity IS NULL OR (player_capacity >= 1 AND player_capacity <= 100));
  END IF;
END $$;

-- Location sport capacities are stored in system_settings as:
--   key = 'sport_capacities::<Location Name>'
--   value = JSON object e.g. {"Badminton":4,"Basketball":10,...}
-- No table change required for that pattern.
