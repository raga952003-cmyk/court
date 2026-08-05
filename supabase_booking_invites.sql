-- Booking invites: organizer books a seat; invitees must Accept within 5 minutes.
-- Run this in Supabase SQL Editor on the deployed project.

CREATE TABLE IF NOT EXISTS booking_invites (
    invite_id TEXT PRIMARY KEY,
    booking_id TEXT NOT NULL REFERENCES bookings(booking_id) ON DELETE CASCADE,
    organizer_employee_id TEXT NOT NULL REFERENCES users(employee_id) ON DELETE CASCADE,
    invitee_employee_id TEXT NOT NULL REFERENCES users(employee_id) ON DELETE CASCADE,
    invitee_name TEXT NOT NULL,
    facility_id TEXT NOT NULL REFERENCES facilities(facility_id) ON DELETE CASCADE,
    sport TEXT NOT NULL,
    court_name TEXT NOT NULL,
    slot_time TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    responded_at TIMESTAMP WITH TIME ZONE,
    accepted_booking_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_booking_invites_invitee_status
    ON booking_invites(invitee_employee_id, status);

CREATE INDEX IF NOT EXISTS idx_booking_invites_slot_status
    ON booking_invites(facility_id, slot_time, status);

CREATE INDEX IF NOT EXISTS idx_booking_invites_expires
    ON booking_invites(expires_at)
    WHERE status = 'pending';

ALTER TABLE booking_invites DISABLE ROW LEVEL SECURITY;
