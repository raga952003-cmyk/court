-- TCS PlaySmart - Supabase PostgreSQL Schema DDL

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    employee_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL CHECK (lower(email) LIKE '%@tcs.com' OR lower(email) LIKE '%@gmail.com'),
    phone_number TEXT,
    department TEXT NOT NULL,
    business_unit TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('employee', 'security', 'admin', 'it')),
    password TEXT DEFAULT 'password',
    avatar TEXT,
    approved BOOLEAN DEFAULT TRUE,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending', 'rejected')),
    suspended_until TIMESTAMP WITH TIME ZONE,
    rejection_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index on employee_id for faster foreign-key joins
CREATE INDEX IF NOT EXISTS idx_users_employee_id ON users(employee_id);

-- 2. FACILITIES TABLE
CREATE TABLE IF NOT EXISTS facilities (
    facility_id TEXT PRIMARY KEY,
    sport TEXT NOT NULL,
    court_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'maintenance')) DEFAULT 'active',
    location TEXT NOT NULL DEFAULT 'Chennai, India'
);

-- 3. BOOKINGS TABLE
CREATE TABLE IF NOT EXISTS bookings (
    booking_id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES users(employee_id) ON DELETE CASCADE,
    employee_name TEXT NOT NULL,
    facility_id TEXT NOT NULL REFERENCES facilities(facility_id) ON DELETE CASCADE,
    sport TEXT NOT NULL,
    court_name TEXT NOT NULL,
    slot_time TEXT NOT NULL,
    booking_source TEXT NOT NULL CHECK (booking_source IN ('online', 'security')),
    status TEXT NOT NULL CHECK (status IN ('confirmed', 'checked_in', 'no_show', 'cancelled')) DEFAULT 'confirmed',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    additional_players TEXT
);


-- 4. WAITLIST TABLE
CREATE TABLE IF NOT EXISTS waitlist (
    waitlist_id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES users(employee_id) ON DELETE CASCADE,
    employee_name TEXT NOT NULL,
    facility_id TEXT NOT NULL REFERENCES facilities(facility_id) ON DELETE CASCADE,
    sport TEXT NOT NULL,
    court_name TEXT NOT NULL,
    slot_time TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES users(employee_id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('info', 'success', 'warning', 'error')) DEFAULT 'info',
    read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. SIMULATED SMTP EMAILS OUTBOX
CREATE TABLE IF NOT EXISTS simulated_emails (
    id TEXT PRIMARY KEY,
    to_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. SIMULATED TIME CONFIG
CREATE TABLE IF NOT EXISTS simulated_time (
    key TEXT PRIMARY KEY,
    hour INTEGER NOT NULL,
    minute INTEGER NOT NULL
);

-- 8. SYSTEM SETTINGS TABLE
CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Seed initial settings
INSERT INTO system_settings (key, value) VALUES 
('brevo_api_key', 'YOUR_BREVO_API_KEY'),
('brevo_sender_email', 'raga29429@gmail.com')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;


-- Seed initial facilities data (Chennai campus)
INSERT INTO facilities (facility_id, sport, court_name, status, location) VALUES
('badminton_c1', 'Badminton', 'Court 1', 'active', 'Chennai, India'),
('badminton_c2', 'Badminton', 'Court 2', 'active', 'Chennai, India'),
('badminton_c3', 'Badminton', 'Court 3', 'active', 'Chennai, India'),
('basketball_c1', 'Basketball', 'Court 1', 'active', 'Chennai, India'),
('basketball_c2', 'Basketball', 'Court 2', 'active', 'Chennai, India'),
('volleyball_c1', 'Volleyball', 'Court 1', 'active', 'Chennai, India'),
('volleyball_c2', 'Volleyball', 'Court 2', 'active', 'Chennai, India'),
('tt_t1', 'Table Tennis', 'Table 1', 'active', 'Chennai, India'),
('tt_t2', 'Table Tennis', 'Table 2', 'active', 'Chennai, India'),
('carrom_b1', 'Carrom', 'Board 1', 'active', 'Chennai, India'),
('carrom_b2', 'Carrom', 'Board 2', 'active', 'Chennai, India'),
('carrom_b3', 'Carrom', 'Board 3', 'active', 'Chennai, India'),
('carrom_b4', 'Carrom', 'Board 4', 'active', 'Chennai, India'),
('carrom_b5', 'Carrom', 'Board 5', 'active', 'Chennai, India'),
('cricket_g1', 'Box Cricket', 'Ground 1', 'active', 'Chennai, India')
ON CONFLICT (facility_id) DO NOTHING;

-- Seed default simulated time
INSERT INTO simulated_time (key, hour, minute) VALUES ('current_time', 9, 0)
ON CONFLICT (key) DO NOTHING;

-- 8. HELPER FUNCTIONS & TRIGGERS FOR SERVERLESS LOGIC

-- Helper: Check if an employee is in a booking
CREATE OR REPLACE FUNCTION check_player_in_booking(creator_id text, additional_players text, check_emp_id text)
RETURNS boolean AS $$
DECLARE
    ap_json jsonb;
    item jsonb;
BEGIN
    IF creator_id = check_emp_id THEN
        RETURN true;
    END IF;
    
    IF additional_players IS NULL OR additional_players = '' THEN
        RETURN false;
    END IF;
    
    BEGIN
        ap_json := additional_players::jsonb;
    EXCEPTION WHEN others THEN
        RETURN false;
    END;
    
    FOR item IN SELECT jsonb_array_elements(ap_json) LOOP
        IF (item->>'employeeId') = check_emp_id THEN
            RETURN true;
        END IF;
    END LOOP;
    
    RETURN false;
END;
$$ LANGUAGE plpgsql;

-- Trigger Function: Validate Booking Rules before inserting
CREATE OR REPLACE FUNCTION validate_booking_rules_fn()
RETURNS trigger AS $$
DECLARE
    r_facility record;
    sim_hour integer;
    creator_role text;
    v_capacity integer;
    v_joined_count integer;
    v_capacities_json jsonb;
    v_use_sim text;
BEGIN
    -- 1. Check Facility status
    SELECT * INTO r_facility FROM facilities WHERE facility_id = NEW.facility_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Facility not found.';
    END IF;
    IF r_facility.status = 'maintenance' THEN
        RAISE EXCEPTION '% % is under maintenance and cannot be booked.', r_facility.sport, r_facility.court_name;
    END IF;

    -- Set sport and court_name automatically from facility
    NEW.sport := r_facility.sport;
    NEW.court_name := r_facility.court_name;

    -- 2. Check booking window (Asia/Kolkata wall clock; simulated_time only if use_simulated_time=true)
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
        creator_role := 'employee'; -- Fallback
    END IF;

    IF creator_role != 'admin' AND NEW.booking_source = 'online' THEN
        IF sim_hour < 10 OR sim_hour >= 20 THEN
            RAISE EXCEPTION 'Online booking is closed. Employee Booking Window is active from 10:00 AM to 8:00 PM.';
        END IF;
    END IF;

    -- Get capacity based on sport (check system_settings for dynamic capacities first)
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
                v_capacity := 4; -- Badminton, Carrom, Table Tennis, etc.
            END IF;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- Fallback if JSON parsing or table read fails
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

    -- 3. Check if slot already full (joined players >= capacity)
    SELECT COUNT(*) INTO v_joined_count 
    FROM bookings 
    WHERE facility_id = NEW.facility_id 
      AND slot_time = NEW.slot_time 
      AND status != 'cancelled'
      AND booking_id != NEW.booking_id;
      
    IF v_joined_count >= v_capacity THEN
        RAISE EXCEPTION 'This slot is already fully booked.';
    END IF;

    -- 4. Check overlap for the player (no other active booking in the same slot_time across all facilities)
    IF EXISTS (
        SELECT 1 FROM bookings
        WHERE employee_id = NEW.employee_id
          AND slot_time = NEW.slot_time
          AND status != 'cancelled'
          AND booking_id != NEW.booking_id
    ) THEN
        RAISE EXCEPTION 'You already have another booking at %.', NEW.slot_time;
    END IF;

    -- 5. Check daily limit for the player (no other active booking for the same sport today)
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

CREATE OR REPLACE TRIGGER validate_booking_rules_trigger
BEFORE INSERT ON bookings
FOR EACH ROW
EXECUTE FUNCTION validate_booking_rules_fn();

-- Trigger Function: Validate waitlist entries
CREATE OR REPLACE FUNCTION validate_waitlist_rules_fn()
RETURNS trigger AS $$
DECLARE
    r_facility record;
BEGIN
    SELECT * INTO r_facility FROM facilities WHERE facility_id = NEW.facility_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Facility not found.';
    END IF;
    IF r_facility.status = 'maintenance' THEN
        RAISE EXCEPTION '% % is under maintenance and cannot be waitlisted.', r_facility.sport, r_facility.court_name;
    END IF;

    NEW.sport := r_facility.sport;
    NEW.court_name := r_facility.court_name;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER validate_waitlist_rules_trigger
BEFORE INSERT ON waitlist
FOR EACH ROW
EXECUTE FUNCTION validate_waitlist_rules_fn();

-- Trigger Function: Process Waitlist Auto-promotion when a booking is cancelled
CREATE OR REPLACE FUNCTION process_waitlist_promotion_fn()
RETURNS trigger AS $$
DECLARE
    waitlist_rec record;
    new_booking_id text;
    promoted_user_email text;
    email_body text;
    brevo_key text;
    sender_email text;
BEGIN
    -- Find the earliest waitlist entry for the same facility and slot_time
    SELECT * INTO waitlist_rec 
    FROM waitlist 
    WHERE facility_id = OLD.facility_id AND slot_time = OLD.slot_time 
    ORDER BY created_at ASC 
    LIMIT 1;
    
    IF FOUND THEN
        -- Delete the waitlist entry
        DELETE FROM waitlist WHERE waitlist_id = waitlist_rec.waitlist_id;
        
        -- Generate booking ID
        new_booking_id := 'b_' || (extract(epoch from clock_timestamp()) * 1000)::bigint::text;
        
        -- Insert the booking
        INSERT INTO bookings (
            booking_id, employee_id, employee_name, facility_id, sport, court_name, slot_time, booking_source, status, created_at
        ) VALUES (
            new_booking_id,
            waitlist_rec.employee_id,
            waitlist_rec.employee_name,
            waitlist_rec.facility_id,
            waitlist_rec.sport,
            waitlist_rec.court_name,
            waitlist_rec.slot_time,
            'online',
            'confirmed',
            CURRENT_TIMESTAMP
        );
        
        -- Insert notification for the promoted employee
        INSERT INTO notifications (
            id, employee_id, title, message, type, read, created_at
        ) VALUES (
            'notif_' || (extract(epoch from clock_timestamp()) * 1000)::bigint::text || '_promo',
            waitlist_rec.employee_id,
            'Waitlist Promoted 🎉',
            'Your waitlist request for ' || waitlist_rec.sport || ' (' || waitlist_rec.court_name || ') at ' || waitlist_rec.slot_time || ' has been promoted to a Confirmed Booking!',
            'success',
            false,
            CURRENT_TIMESTAMP
        );
        
        -- Get email
        SELECT email INTO promoted_user_email FROM users WHERE employee_id = waitlist_rec.employee_id;
        IF promoted_user_email IS NULL THEN
            promoted_user_email := lower(waitlist_rec.employee_id) || '@tcs.com';
        END IF;
        
        -- Simulated email body
        email_body := 'Dear ' || waitlist_rec.employee_name || ',' || chr(10) || chr(10) ||
                      'Good news! Your waitlist request for ' || waitlist_rec.sport || ' (' || waitlist_rec.court_name || ') at ' || waitlist_rec.slot_time || ' has been promoted to a Confirmed Booking because a reservation was cancelled!' || chr(10) || chr(10) ||
                      'Booking Details:' || chr(10) ||
                      '- Booking ID: ' || new_booking_id || chr(10) ||
                      '- Sport Category: ' || waitlist_rec.sport || chr(10) ||
                      '- Court / Board: ' || waitlist_rec.court_name || chr(10) ||
                      '- Reserved Time Slot: ' || waitlist_rec.slot_time || chr(10) ||
                      '- Booking Channel: Waitlist Auto-Promotion' || chr(10) || chr(10) ||
                      'Please present your simulated QR Gate Pass at the court check-in checkpoint.' || chr(10) || chr(10) ||
                      'Enjoy your active session!' || chr(10) || chr(10) ||
                      'Best Regards,' || chr(10) ||
                      'TCS PlaySmart Admin Team';
                      
        -- Insert simulated email
        INSERT INTO simulated_emails (
            id, to_email, subject, body, sent_at
        ) VALUES (
            'email_' || (extract(epoch from clock_timestamp()) * 1000)::bigint::text || '_promo',
            promoted_user_email,
            'TCS PlaySmart - Waitlist Promoted to Confirmed Booking [' || new_booking_id || '] 🎉',
            email_body,
            CURRENT_TIMESTAMP
        );

        -- Send live email using Brevo API via pg_net (wrapped in exception handler to prevent missing schema errors)
        BEGIN
            SELECT value INTO brevo_key FROM system_settings WHERE key = 'brevo_api_key';
            SELECT value INTO sender_email FROM system_settings WHERE key = 'brevo_sender_email';
            IF sender_email IS NULL OR sender_email = '' THEN
                sender_email := 'raga29429@gmail.com';
            END IF;

            IF brevo_key IS NOT NULL AND brevo_key <> '' AND NOT (brevo_key LIKE 'placeholder%') THEN
                PERFORM net.http_post(
                    url := 'https://api.brevo.com/v3/smtp/email',
                    headers := jsonb_build_object(
                        'api-key', brevo_key,
                        'Content-Type', 'application/json',
                        'Accept', 'application/json'
                    ),
                    body := jsonb_build_object(
                        'sender', jsonb_build_object('name', 'TCS PlaySmart', 'email', sender_email),
                        'to', jsonb_build_array(jsonb_build_object('email', promoted_user_email)),
                        'subject', 'TCS PlaySmart - Waitlist Promoted to Confirmed Booking [' || new_booking_id || '] 🎉',
                        'htmlContent', replace(email_body, chr(10), '<br/>')
                    )
                );
            END IF;
        EXCEPTION WHEN OTHERS THEN
            NULL; -- Silently ignore pg_net errors if extension is not enabled
        END;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER process_waitlist_promotion_trigger
AFTER UPDATE OF status ON bookings
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'cancelled')
EXECUTE FUNCTION process_waitlist_promotion_fn();

-- Trigger Function: Handle booking side-effects (notifications and simulated emails)
CREATE OR REPLACE FUNCTION handle_booking_side_effects_fn()
RETURNS trigger AS $$
DECLARE
    creator_email text;
    email_body text;
    email_subj text;
    brevo_key text;
    sender_email text;
BEGIN
    -- TG_OP = 'INSERT' and status = 'confirmed'
    IF (TG_OP = 'INSERT' AND NEW.status = 'confirmed') THEN
        -- 1. Get creator email
        SELECT email INTO creator_email FROM users WHERE employee_id = NEW.employee_id;
        IF creator_email IS NULL THEN
            creator_email := lower(NEW.employee_id) || '@tcs.com';
        END IF;

        -- Notify Creator
        INSERT INTO notifications (id, employee_id, title, message, type, read, created_at)
        VALUES (
            'notif_' || (extract(epoch from clock_timestamp()) * 1000)::bigint::text || '_c',
            NEW.employee_id,
            'Booking Confirmed 🎉',
            'Your slot for ' || NEW.sport || ' (' || NEW.court_name || ') at ' || NEW.slot_time || ' has been successfully booked!',
            'success',
            false,
            CURRENT_TIMESTAMP
        );

        -- Send Email to Creator
        email_subj := 'TCS PlaySmart - Slot Booking Confirmed [' || NEW.booking_id || ']';
        email_body := 'Dear ' || NEW.employee_name || ',' || chr(10) || chr(10) ||
                      'Your sports booking reservation on PlaySmart has been successfully confirmed!' || chr(10) || chr(10) ||
                      'Booking Details:' || chr(10) ||
                      '- Booking ID: ' || NEW.booking_id || chr(10) ||
                      '- Sport Category: ' || NEW.sport || chr(10) ||
                      '- Court / Board: ' || NEW.court_name || chr(10) ||
                      '- Reserved Time Slot: ' || NEW.slot_time || chr(10) ||
                      '- Booking Channel: ' || initcap(NEW.booking_source) || ' Booking' || chr(10) ||
                      '- Booking Time: ' || to_char(NEW.created_at AT TIME ZONE 'Asia/Kolkata', 'HH12:MI AM') || chr(10) || chr(10) ||
                      'Please present your simulated QR Gate Pass at the court check-in checkpoint.' || chr(10) || chr(10) ||
                      'Enjoy your active session!' || chr(10) || chr(10) ||
                      'Best Regards,' || chr(10) ||
                      'TCS PlaySmart Admin Team';

        INSERT INTO simulated_emails (id, to_email, subject, body, sent_at)
        VALUES (
            'email_' || (extract(epoch from clock_timestamp()) * 1000)::bigint::text || '_c',
            creator_email,
            email_subj,
            email_body,
            CURRENT_TIMESTAMP
        );

        -- Send live email using Brevo API via pg_net (wrapped in exception handler to prevent missing schema errors)
        BEGIN
            SELECT value INTO brevo_key FROM system_settings WHERE key = 'brevo_api_key';
            SELECT value INTO sender_email FROM system_settings WHERE key = 'brevo_sender_email';
            IF sender_email IS NULL OR sender_email = '' THEN
                sender_email := 'raga29429@gmail.com';
            END IF;

            IF brevo_key IS NOT NULL AND brevo_key <> '' AND NOT (brevo_key LIKE 'placeholder%') THEN
                PERFORM net.http_post(
                    url := 'https://api.brevo.com/v3/smtp/email',
                    headers := jsonb_build_object(
                        'api-key', brevo_key,
                        'Content-Type', 'application/json',
                        'Accept', 'application/json'
                    ),
                    body := jsonb_build_object(
                        'sender', jsonb_build_object('name', 'TCS PlaySmart', 'email', sender_email),
                        'to', jsonb_build_array(jsonb_build_object('email', creator_email)),
                        'subject', email_subj,
                        'htmlContent', replace(email_body, chr(10), '<br/>')
                    )
                );
            END IF;
        EXCEPTION WHEN OTHERS THEN
            NULL; -- Silently ignore pg_net errors if extension is not enabled
        END;

    ELSIF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'cancelled') THEN
        -- 1. Get creator email
        SELECT email INTO creator_email FROM users WHERE employee_id = NEW.employee_id;
        IF creator_email IS NULL THEN
            creator_email := lower(NEW.employee_id) || '@tcs.com';
        END IF;

        -- Notify Creator
        INSERT INTO notifications (id, employee_id, title, message, type, read, created_at)
        VALUES (
            'notif_' || (extract(epoch from clock_timestamp()) * 1000)::bigint::text || '_cx',
            NEW.employee_id,
            'Booking Cancelled 🔴',
            'Your booking for ' || NEW.sport || ' (' || NEW.court_name || ') at ' || NEW.slot_time || ' was cancelled.',
            'warning',
            false,
            CURRENT_TIMESTAMP
        );

        -- Send Email to Creator
        email_subj := 'TCS PlaySmart - Slot Booking Cancelled [' || NEW.booking_id || '] 🔴';
        email_body := 'Dear ' || NEW.employee_name || ',' || chr(10) || chr(10) ||
                      'Your sports booking reservation on PlaySmart has been successfully cancelled.' || chr(10) || chr(10) ||
                      'Cancelled Booking Details:' || chr(10) ||
                      '- Booking ID: ' || NEW.booking_id || chr(10) ||
                      '- Sport Category: ' || NEW.sport || chr(10) ||
                      '- Court / Board: ' || NEW.court_name || chr(10) ||
                      '- Cancelled Time Slot: ' || NEW.slot_time || chr(10) || chr(10) ||
                      'If you did not request this cancellation, please contact the PlaySmart Administrator.' || chr(10) || chr(10) ||
                      'Best Regards,' || chr(10) ||
                      'TCS PlaySmart Admin Team';

        INSERT INTO simulated_emails (id, to_email, subject, body, sent_at)
        VALUES (
            'email_' || (extract(epoch from clock_timestamp()) * 1000)::bigint::text || '_cx',
            creator_email,
            email_subj,
            email_body,
            CURRENT_TIMESTAMP
        );

        -- Send live email using Brevo API via pg_net (wrapped in exception handler to prevent missing schema errors)
        BEGIN
            SELECT value INTO brevo_key FROM system_settings WHERE key = 'brevo_api_key';
            SELECT value INTO sender_email FROM system_settings WHERE key = 'brevo_sender_email';
            IF sender_email IS NULL OR sender_email = '' THEN
                sender_email := 'raga29429@gmail.com';
            END IF;

            IF brevo_key IS NOT NULL AND brevo_key <> '' AND NOT (brevo_key LIKE 'placeholder%') THEN
                PERFORM net.http_post(
                    url := 'https://api.brevo.com/v3/smtp/email',
                    headers := jsonb_build_object(
                        'api-key', brevo_key,
                        'Content-Type', 'application/json',
                        'Accept', 'application/json'
                    ),
                    body := jsonb_build_object(
                        'sender', jsonb_build_object('name', 'TCS PlaySmart', 'email', sender_email),
                        'to', jsonb_build_array(jsonb_build_object('email', creator_email)),
                        'subject', email_subj,
                        'htmlContent', replace(email_body, chr(10), '<br/>')
                    )
                );
            END IF;
        EXCEPTION WHEN OTHERS THEN
            NULL; -- Silently ignore pg_net errors if extension is not enabled
        END;

    ELSIF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'checked_in') THEN
        -- Notify Creator
        INSERT INTO notifications (id, employee_id, title, message, type, read, created_at)
        VALUES (
            'notif_' || (extract(epoch from clock_timestamp()) * 1000)::bigint::text || '_ci',
            NEW.employee_id,
            'Attendance Verified ✅',
            'Enjoy your game of ' || NEW.sport || '! Your entry has been verified at check gate.',
            'info',
            false,
            CURRENT_TIMESTAMP
        );
        
    ELSIF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'no_show') THEN
        -- Notify Creator
        INSERT INTO notifications (id, employee_id, title, message, type, read, created_at)
        VALUES (
            'notif_' || (extract(epoch from clock_timestamp()) * 1000)::bigint::text || '_ns',
            NEW.employee_id,
            'No Show Marked ⚠️',
            'You missed your booking slot for ' || NEW.sport || ' (' || NEW.court_name || ') at ' || NEW.slot_time || '.',
            'error',
            false,
            CURRENT_TIMESTAMP
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER handle_booking_side_effects_trigger
AFTER INSERT OR UPDATE ON bookings
FOR EACH ROW
EXECUTE FUNCTION handle_booking_side_effects_fn();

-- 9. DISABLE ROW LEVEL SECURITY (RLS) FOR DEVELOPER SANDBOX OPERATIONS
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE facilities DISABLE ROW LEVEL SECURITY;
ALTER TABLE bookings DISABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist DISABLE ROW LEVEL SECURITY;
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE simulated_time DISABLE ROW LEVEL SECURITY;
ALTER TABLE simulated_emails DISABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings DISABLE ROW LEVEL SECURITY;

-- 10. FEEDBACK TABLE SCHEMA
CREATE TABLE IF NOT EXISTS feedback (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES users(employee_id) ON DELETE CASCADE,
    employee_name TEXT NOT NULL,
    subject TEXT NOT NULL,
    content TEXT NOT NULL,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE feedback DISABLE ROW LEVEL SECURITY;

-- 11. BOOKING INVITES (organizer books; invitees accept within 5 minutes)
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

ALTER TABLE booking_invites DISABLE ROW LEVEL SECURITY;


