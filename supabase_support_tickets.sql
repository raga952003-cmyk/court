-- Support / complaint tickets + IT role
-- Run in Supabase SQL Editor after base schema.

-- Allow IT receivers (employees/admins still raise tickets)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('employee', 'security', 'admin', 'it'));

CREATE TABLE IF NOT EXISTS support_tickets (
  ticket_id TEXT PRIMARY KEY,
  reporter_employee_id TEXT NOT NULL REFERENCES users(employee_id) ON DELETE CASCADE,
  reporter_name TEXT NOT NULL,
  reporter_role TEXT NOT NULL CHECK (reporter_role IN ('employee', 'admin')),
  category TEXT NOT NULL CHECK (category IN ('general', 'court', 'application')),
  subject TEXT NOT NULL,
  details TEXT NOT NULL,
  facility_id TEXT REFERENCES facilities(facility_id) ON DELETE SET NULL,
  court_name TEXT,
  sport TEXT,
  assigned_queue TEXT NOT NULL CHECK (assigned_queue IN ('admin', 'security', 'it')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'acknowledged', 'in_progress', 'resolved', 'closed', 'escalated')),
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  escalate_at TIMESTAMPTZ NOT NULL,
  escalated_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  assigned_to_employee_id TEXT REFERENCES users(employee_id) ON DELETE SET NULL,
  resolution_notes TEXT,
  last_manual_move_at TIMESTAMPTZ,
  last_manual_move_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_queue_status
  ON support_tickets (assigned_queue, status, escalate_at);

CREATE INDEX IF NOT EXISTS idx_support_tickets_reporter
  ON support_tickets (reporter_employee_id, created_at DESC);
