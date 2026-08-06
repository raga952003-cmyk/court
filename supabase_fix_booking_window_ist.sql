-- Fix: booking window must use Asia/Kolkata wall clock in production.
-- simulated_time is ONLY used when system_settings.use_simulated_time = 'true' (demo mode).
-- Run this in Supabase SQL Editor once.

CREATE OR REPLACE FUNCTION validate_booking_rules_fn()
RETURNS trigger AS $$
DECLARE
    r_facility record;
    sim_hour integer;
    creator_role text;
    v_capacity integer;
    v_joined_count integer;
    v_pending_invites integer;
    v_capacities_json jsonb;
    v_use_sim text;
    v_player_cap integer;
BEGIN
    PERFORM expire_stale_booking_invites();

    SELECT * INTO r_facility FROM facilities WHERE facility_id = NEW.facility_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Facility not found.';
    END IF;
    IF r_facility.status = 'maintenance' THEN
        RAISE EXCEPTION '% % is under maintenance and cannot be booked.', r_facility.sport, r_facility.court_name;
    END IF;

    NEW.sport := r_facility.sport;
    NEW.court_name := r_facility.court_name;

    -- Campus clock: real IST unless demo flag is enabled
    v_use_sim := NULL;
    BEGIN
        SELECT value INTO v_use_sim FROM system_settings WHERE key = 'use_simulated_time';
    EXCEPTION WHEN OTHERS THEN
        v_use_sim := NULL;
    END;

    IF lower(coalesce(v_use_sim, 'false')) IN ('true', '1', 'yes') THEN
        SELECT hour INTO sim_hour FROM simulated_time WHERE key = 'current_time';
    END IF;

    IF sim_hour IS NULL THEN
        sim_hour := EXTRACT(HOUR FROM (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata'))::integer;
    END IF;

    SELECT role INTO creator_role FROM users WHERE employee_id = NEW.employee_id;
    IF creator_role IS NULL THEN
        creator_role := 'employee';
    END IF;

    IF creator_role != 'admin' THEN
        IF NEW.booking_source = 'online' THEN
            -- Employees: 10:00 AM – 8:00 PM only
            IF sim_hour < 10 OR sim_hour >= 20 THEN
                RAISE EXCEPTION 'Online booking is closed. Employee Booking Window is active from 10:00 AM to 8:00 PM.';
            END IF;
        ELSIF NEW.booking_source = 'security' THEN
            -- Security: all day while facilities are open (5:00 AM – 8:00 PM)
            IF sim_hour < 5 OR sim_hour >= 20 THEN
                RAISE EXCEPTION 'Security desk booking is unavailable while campus facilities are closed (open 5:00 AM – 8:00 PM).';
            END IF;
        END IF;
    END IF;

    -- Capacity: prefer per-court player_capacity, then location/global sport capacities
    v_capacity := NULL;
    BEGIN
        IF r_facility.player_capacity IS NOT NULL AND r_facility.player_capacity > 0 THEN
            v_capacity := r_facility.player_capacity;
        END IF;
    EXCEPTION WHEN undefined_column THEN
        v_capacity := NULL;
    END;

    IF v_capacity IS NULL THEN
        BEGIN
            -- location-scoped capacities if present
            IF r_facility.location IS NOT NULL THEN
                SELECT value::jsonb INTO v_capacities_json
                FROM system_settings
                WHERE key = 'sport_capacities::' || r_facility.location;
            END IF;
            IF v_capacities_json IS NULL THEN
                SELECT value::jsonb INTO v_capacities_json FROM system_settings WHERE key = 'sport_capacities';
            END IF;
            IF v_capacities_json IS NOT NULL AND v_capacities_json ? r_facility.sport THEN
                v_capacity := (v_capacities_json->>r_facility.sport)::integer;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            v_capacities_json := NULL;
        END;
    END IF;

    IF v_capacity IS NULL THEN
        IF r_facility.sport = 'Box Cricket' THEN
            v_capacity := 22;
        ELSIF r_facility.sport = 'Basketball' THEN
            v_capacity := 10;
        ELSIF r_facility.sport = 'Volleyball' THEN
            v_capacity := 12;
        ELSE
            v_capacity := 4;
        END IF;
    END IF;

    SELECT COUNT(*) INTO v_joined_count
    FROM bookings
    WHERE facility_id = NEW.facility_id
      AND slot_time = NEW.slot_time
      AND status != 'cancelled'
      AND booking_id != NEW.booking_id;

    SELECT COUNT(*) INTO v_pending_invites
    FROM booking_invites
    WHERE facility_id = NEW.facility_id
      AND slot_time = NEW.slot_time
      AND status = 'pending'
      AND expires_at > CURRENT_TIMESTAMP;

    IF v_joined_count + coalesce(v_pending_invites, 0) >= v_capacity THEN
        RAISE EXCEPTION 'This slot is already fully booked (including pending invites).';
    END IF;

    IF EXISTS (
        SELECT 1 FROM bookings
        WHERE employee_id = NEW.employee_id
          AND slot_time = NEW.slot_time
          AND status != 'cancelled'
          AND booking_id != NEW.booking_id
    ) THEN
        RAISE EXCEPTION 'You already have another booking at %.', NEW.slot_time;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Keep trigger attached (idempotent)
DROP TRIGGER IF EXISTS validate_booking_rules_trigger ON bookings;
CREATE TRIGGER validate_booking_rules_trigger
    BEFORE INSERT OR UPDATE ON bookings
    FOR EACH ROW
    EXECUTE FUNCTION validate_booking_rules_fn();

-- Sync simulated_time row to current IST so any leftover readers aren't stuck at 9:00
UPDATE simulated_time
SET hour = EXTRACT(HOUR FROM (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata'))::integer,
    minute = EXTRACT(MINUTE FROM (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata'))::integer
WHERE key = 'current_time';

-- Ensure demo flag defaults to off
INSERT INTO system_settings (key, value)
VALUES ('use_simulated_time', 'false')
ON CONFLICT (key) DO NOTHING;
