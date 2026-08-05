-- Fix 401 Unauthorized from PostgREST when using the anon key from the browser.
-- Run this in Supabase → SQL Editor if facilities (or other tables) return 401.

-- Allow API roles to use public schema
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Core app tables used by frontend/src/lib/database.ts
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated, service_role;

-- This app authenticates in-app (not Supabase Auth sessions). Disable RLS for sandbox ops.
ALTER TABLE IF EXISTS users DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS facilities DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS bookings DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS waitlist DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS simulated_time DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS simulated_emails DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS system_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS booking_invites DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS support_tickets DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS feedback DISABLE ROW LEVEL SECURITY;
