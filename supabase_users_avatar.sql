-- Add avatar column if missing (fixes register 400: column users.avatar does not exist)
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT;
