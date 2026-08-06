-- PlaySmart hardening: invite capacity, server-side expiry, atomic accept, password column note
-- Run in Supabase SQL Editor AFTER supabase_booking_invites.sql

-- 1) Expire stale pending invites (call via pg_cron every minute)
CREATE OR REPLACE FUNCTION expire_stale_booking_invites()
RETURNS integer AS $$
DECLARE
    v_count integer;
BEGIN
    UPDATE booking_invites
    SET status = 'expired',
        responded_at = CURRENT_TIMESTAMP
    WHERE status = 'pending'
      AND expires_at < CURRENT_TIMESTAMP;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Optional: schedule with pg_cron (enable extension in Dashboard → Database → Extensions)
-- SELECT cron.schedule('expire-booking-invites', '* * * * *', $$SELECT expire_stale_booking_invites();$$);

-- 2) Capacity must include pending (non-expired) invites
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

    -- Campus clock: real IST unless system_settings.use_simulated_time = 'true'
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

    BEGIN
        SELECT value::jsonb INTO v_capacities_json FROM system_settings WHERE key = 'sport_capacities';
        IF v_capacities_json IS NOT NULL AND v_capacities_json ? r_facility.sport THEN
            v_capacity := (v_capacities_json->>r_facility.sport)::integer;
        ELSE
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
    EXCEPTION WHEN OTHERS THEN
        IF r_facility.sport = 'Box Cricket' THEN
            v_capacity := 22;
        ELSIF r_facility.sport = 'Basketball' THEN
            v_capacity := 10;
        ELSIF r_facility.sport = 'Volleyball' THEN
            v_capacity := 12;
        ELSE
            v_capacity := 4;
        END IF;
    END;

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

    IF (v_joined_count + v_pending_invites) >= v_capacity THEN
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

    IF EXISTS (
        SELECT 1 FROM bookings
        WHERE employee_id = NEW.employee_id
          AND sport = NEW.sport
          AND status != 'cancelled'
          AND booking_id != NEW.booking_id
    ) THEN
        RAISE EXCEPTION 'You already have an active booking for % today. Employees are limited to one active booking per sport per day.', NEW.sport;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3) Atomic accept invite (converts reserved seat → confirmed booking)
CREATE OR REPLACE FUNCTION accept_booking_invite(p_invite_id text, p_employee_id text)
RETURNS jsonb AS $$
DECLARE
    inv booking_invites%ROWTYPE;
    v_booking_id text;
    v_user users%ROWTYPE;
BEGIN
    PERFORM expire_stale_booking_invites();

    SELECT * INTO inv FROM booking_invites WHERE invite_id = p_invite_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invite not found.');
    END IF;

    IF inv.invitee_employee_id <> upper(p_employee_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'This invite is not for your Employee ID.');
    END IF;

    IF inv.status = 'expired' OR inv.expires_at <= CURRENT_TIMESTAMP THEN
        UPDATE booking_invites SET status = 'expired', responded_at = CURRENT_TIMESTAMP WHERE invite_id = p_invite_id;
        RETURN jsonb_build_object('success', false, 'error', 'This invite has expired. You cannot participate.');
    END IF;

    IF inv.status <> 'pending' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invite is already ' || inv.status || '.');
    END IF;

    SELECT * INTO v_user FROM users WHERE employee_id = upper(p_employee_id);
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'User not registered.');
    END IF;

    -- Mark invite accepted first so capacity count drops the pending seat before insert
    UPDATE booking_invites
    SET status = 'accepted', responded_at = CURRENT_TIMESTAMP
    WHERE invite_id = p_invite_id;

    v_booking_id := 'b_' || (extract(epoch from clock_timestamp()) * 1000)::bigint::text || '_acc';

    INSERT INTO bookings (
        booking_id, employee_id, employee_name, facility_id, sport, court_name,
        slot_time, booking_source, status
    ) VALUES (
        v_booking_id, v_user.employee_id, v_user.name, inv.facility_id, inv.sport, inv.court_name,
        inv.slot_time, 'online', 'confirmed'
    );

    UPDATE booking_invites
    SET accepted_booking_id = v_booking_id
    WHERE invite_id = p_invite_id;

    INSERT INTO notifications (id, employee_id, title, message, type, read, created_at)
    VALUES (
        'notif_acc_' || (extract(epoch from clock_timestamp()) * 1000)::bigint::text,
        inv.organizer_employee_id,
        'Invite Accepted',
        inv.invitee_name || ' (' || v_user.employee_id || ') accepted your invite for ' || inv.sport || ' at ' || inv.slot_time || '.',
        'success',
        false,
        CURRENT_TIMESTAMP
    );

    RETURN jsonb_build_object('success', true, 'bookingId', v_booking_id);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION expire_stale_booking_invites() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION accept_booking_invite(text, text) TO anon, authenticated, service_role;
