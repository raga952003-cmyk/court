"""
Email Service Module for TCS PlaySmart
Sends real email via Brevo HTTPS API (preferred) or SMTP (Brevo/Gmail).
Corporate networks often block SMTP :587 — HTTPS API uses :443 and works more reliably.
"""

from __future__ import annotations

import os
import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from pathlib import Path
from typing import Optional

import httpx
from dotenv import load_dotenv

_backend_dir = Path(__file__).resolve().parent
load_dotenv(_backend_dir / ".env")
load_dotenv(_backend_dir.parent / ".env")

# Email Configuration from environment variables
SMTP_HOST = os.getenv("SMTP_HOST", "smtp-relay.brevo.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM_EMAIL = os.getenv("SMTP_FROM_EMAIL", SMTP_USER)
SMTP_FROM_NAME = os.getenv("SMTP_FROM_NAME", "TCS PlaySmart")
ENABLE_REAL_EMAILS = os.getenv("ENABLE_REAL_EMAILS", "false").lower() == "true"
# Brevo REST API key (Settings → SMTP & API → API keys). Prefer this over SMTP on locked networks.
BREVO_API_KEY = (
    os.getenv("BREVO_API_KEY", "").strip()
    or os.getenv("brevo_api_key", "").strip()
)
SMTP_TIMEOUT_SEC = float(os.getenv("SMTP_TIMEOUT_SEC", "20"))


def _from_address() -> str:
    return (SMTP_FROM_EMAIL or SMTP_USER or "").strip()


def _send_via_brevo_api(to_email: str, subject: str, body: str) -> dict:
    """Send transactional email through Brevo HTTPS API (port 443)."""
    api_key = BREVO_API_KEY
    if not api_key:
        return {"success": False, "error": "BREVO_API_KEY not configured"}

    sender = _from_address()
    if not sender:
        return {"success": False, "error": "SMTP_FROM_EMAIL (verified Brevo sender) is required"}

    payload = {
        "sender": {"name": SMTP_FROM_NAME or "TCS PlaySmart", "email": sender},
        "to": [{"email": to_email}],
        "subject": subject,
        "textContent": body,
    }

    try:
        with httpx.Client(timeout=30.0) as client:
            resp = client.post(
                "https://api.brevo.com/v3/smtp/email",
                headers={
                    "accept": "application/json",
                    "api-key": api_key,
                    "content-type": "application/json",
                },
                json=payload,
            )
        if resp.status_code >= 400:
            detail = resp.text
            try:
                detail = resp.json().get("message") or resp.text
            except Exception:
                pass
            return {
                "success": False,
                "error": f"Brevo API error ({resp.status_code}): {detail}",
            }
        return {
            "success": True,
            "message": f"Email sent via Brevo API to {to_email}",
            "provider": "brevo_api",
        }
    except Exception as e:
        return {"success": False, "error": f"Brevo API request failed: {e}"}


def _send_via_smtp(to_email: str, subject: str, body: str) -> dict:
    """Send via SMTP STARTTLS (587) or SSL (465)."""
    if not SMTP_USER or not SMTP_PASSWORD:
        return {
            "success": False,
            "error": "SMTP credentials not configured. Set SMTP_USER and SMTP_PASSWORD in .env",
        }

    sender = _from_address()
    message = MIMEMultipart()
    message["From"] = f"{SMTP_FROM_NAME} <{sender}>"
    message["To"] = to_email
    message["Subject"] = subject
    message.attach(MIMEText(body, "plain"))

    errors: list[str] = []

    # Try configured port first (usually 587 STARTTLS)
    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=SMTP_TIMEOUT_SEC) as server:
            server.ehlo()
            server.starttls(context=ssl.create_default_context())
            server.ehlo()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.send_message(message)
        return {
            "success": True,
            "message": f"Email sent via SMTP:{SMTP_PORT} to {to_email}",
            "provider": "smtp",
        }
    except smtplib.SMTPAuthenticationError:
        return {
            "success": False,
            "error": "SMTP authentication failed. Check SMTP_USER / SMTP_PASSWORD (Brevo SMTP key).",
        }
    except Exception as e:
        errors.append(f"SMTP {SMTP_PORT}: {e}")

    # Fallback: SSL on 465 (sometimes allowed when 587 is blocked)
    if SMTP_PORT != 465:
        try:
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(SMTP_HOST, 465, timeout=SMTP_TIMEOUT_SEC, context=context) as server:
                server.login(SMTP_USER, SMTP_PASSWORD)
                server.send_message(message)
            return {
                "success": True,
                "message": f"Email sent via SMTP_SSL:465 to {to_email}",
                "provider": "smtp_ssl",
            }
        except Exception as e:
            errors.append(f"SMTP_SSL 465: {e}")

    return {
        "success": False,
        "error": "SMTP blocked or unreachable. " + " | ".join(errors),
    }


def send_email(to_email: str, subject: str, body: str) -> dict:
    """
    Send an email.
    Order: Brevo HTTPS API (if BREVO_API_KEY) → SMTP 587 → SMTP_SSL 465.
    """
    if not ENABLE_REAL_EMAILS:
        return {
            "success": True,
            "message": "Email stored in simulated outbox (real emails disabled)",
        }

    to_email = (to_email or "").strip()
    if not to_email:
        return {"success": False, "error": "Recipient email is empty"}

    # Prefer HTTPS API — works on networks that block SMTP ports
    if BREVO_API_KEY:
        api_result = _send_via_brevo_api(to_email, subject, body)
        if api_result.get("success"):
            return api_result
        # Fall through to SMTP if API fails
        api_error = api_result.get("error")
    else:
        api_error = None

    smtp_result = _send_via_smtp(to_email, subject, body)
    if smtp_result.get("success"):
        return smtp_result

    parts = [p for p in [api_error, smtp_result.get("error")] if p]
    return {
        "success": False,
        "error": " | ".join(parts)
        or "Failed to send email. Add BREVO_API_KEY or fix SMTP access.",
    }


def send_booking_confirmation_email(
    to_email: str,
    employee_name: str,
    booking_id: str,
    sport: str,
    court_name: str,
    slot_time: str,
    booking_source: str,
    simulated_time: str,
) -> dict:
    subject = f"TCS PlaySmart - Slot Booking Confirmed [{booking_id}]"
    body = f"""Dear {employee_name},

Your sports booking request on PlaySmart has been successfully confirmed!

Booking Details:
- Booking ID: {booking_id}
- Sport Category: {sport}
- Court / Board: {court_name}
- Reserved Time Slot: {slot_time}
- Booking Channel: {booking_source.capitalize()} Booking
- Timestamp: {simulated_time}

Please present your QR Gate Pass at the court check-in checkpoint.

Enjoy your active session!

Best Regards,
TCS PlaySmart Admin Team

---
This is an automated message from TCS PlaySmart facility booking system.
"""
    return send_email(to_email, subject, body)


def send_booking_cancellation_email(
    to_email: str,
    employee_name: str,
    booking_id: str,
    sport: str,
    court_name: str,
    slot_time: str,
    reason: str = "Facility maintenance",
) -> dict:
    subject = f"TCS PlaySmart - Booking Cancelled [{booking_id}]"
    body = f"""Dear {employee_name},

Your sports booking reservation on PlaySmart has been cancelled due to {reason}.

Cancelled Booking Details:
- Booking ID: {booking_id}
- Sport Category: {sport}
- Court / Board: {court_name}
- Cancelled Time Slot: {slot_time}

We apologize for the inconvenience. Please select another court or time slot.

Best Regards,
TCS PlaySmart Admin Team

---
This is an automated message from TCS PlaySmart facility booking system.
"""
    return send_email(to_email, subject, body)


def send_waitlist_promotion_email(
    to_email: str,
    employee_name: str,
    booking_id: str,
    sport: str,
    court_name: str,
    slot_time: str,
) -> dict:
    subject = f"TCS PlaySmart - Waitlist Promoted to Confirmed Booking [{booking_id}]"
    body = f"""Dear {employee_name},

Good news! Your waitlist request has been promoted to a Confirmed Booking because a reservation was cancelled!

Booking Details:
- Booking ID: {booking_id}
- Sport Category: {sport}
- Court / Board: {court_name}
- Reserved Time Slot: {slot_time}
- Booking Channel: Waitlist Auto-Promotion

Please present your QR Gate Pass at the court check-in checkpoint.

Enjoy your active session!

Best Regards,
TCS PlaySmart Admin Team

---
This is an automated message from TCS PlaySmart facility booking system.
"""
    return send_email(to_email, subject, body)


def test_email_configuration(to_email: Optional[str] = None) -> dict:
    """Test email configuration by sending a test email."""
    if not ENABLE_REAL_EMAILS:
        return {
            "success": False,
            "error": "Real emails are disabled. Set ENABLE_REAL_EMAILS=true in .env",
        }

    target = (to_email or SMTP_FROM_EMAIL or SMTP_USER or "").strip()
    if not target:
        return {"success": False, "error": "No recipient. Set SMTP_FROM_EMAIL or pass to_email."}

    test_subject = "TCS PlaySmart - Email Configuration Test"
    test_body = f"""This is a test email from TCS PlaySmart.

If you receive this email, outbound email is working.

Config:
- Brevo API key set: {bool(BREVO_API_KEY)}
- SMTP Host: {SMTP_HOST}
- SMTP Port: {SMTP_PORT}
- From Email: {SMTP_FROM_EMAIL}

Best Regards,
TCS PlaySmart System"""

    return send_email(target, test_subject, test_body)
