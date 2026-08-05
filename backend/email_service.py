"""
Email Service Module for TCS PlaySmart
Handles real email sending via SMTP (Gmail, Outlook, etc.)
"""

import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional
from pathlib import Path
from dotenv import load_dotenv

_backend_dir = Path(__file__).resolve().parent
load_dotenv(_backend_dir / ".env")
load_dotenv(_backend_dir.parent / ".env")

# Email Configuration from environment variables
# Supports Gmail, Brevo (Sendinblue), Outlook, etc.
SMTP_HOST = os.getenv("SMTP_HOST", "smtp-relay.brevo.com")  # Default to Brevo
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")  # Your Brevo login email or Gmail
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")  # Your Brevo SMTP key or Gmail app password
SMTP_FROM_EMAIL = os.getenv("SMTP_FROM_EMAIL", SMTP_USER)
SMTP_FROM_NAME = os.getenv("SMTP_FROM_NAME", "TCS PlaySmart")
ENABLE_REAL_EMAILS = os.getenv("ENABLE_REAL_EMAILS", "false").lower() == "true"


def send_email(to_email: str, subject: str, body: str) -> dict:
    """
    Send an email via SMTP
    
    Args:
        to_email: Recipient email address
        subject: Email subject
        body: Email body (plain text)
    
    Returns:
        dict with 'success' and optional 'error' keys
    """
    
    # If real emails are disabled, just return success (emails go to simulated outbox)
    if not ENABLE_REAL_EMAILS:
        return {
            "success": True, 
            "message": "Email stored in simulated outbox (real emails disabled)"
        }
    
    # Check if SMTP is configured
    if not SMTP_USER or not SMTP_PASSWORD:
        return {
            "success": False,
            "error": "SMTP credentials not configured. Set SMTP_USER and SMTP_PASSWORD in .env"
        }
    
    try:
        # Create message
        message = MIMEMultipart()
        message["From"] = f"{SMTP_FROM_NAME} <{SMTP_FROM_EMAIL}>"
        message["To"] = to_email
        message["Subject"] = subject
        
        # Add body
        message.attach(MIMEText(body, "plain"))
        
        # Connect to SMTP server
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()  # Enable TLS encryption
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.send_message(message)
        
        return {
            "success": True,
            "message": f"Email sent successfully to {to_email}"
        }
        
    except smtplib.SMTPAuthenticationError:
        return {
            "success": False,
            "error": "SMTP authentication failed. Check your email and app password."
        }
    except smtplib.SMTPException as e:
        return {
            "success": False,
            "error": f"SMTP error: {str(e)}"
        }
    except Exception as e:
        return {
            "success": False,
            "error": f"Failed to send email: {str(e)}"
        }


def send_booking_confirmation_email(
    to_email: str,
    employee_name: str,
    booking_id: str,
    sport: str,
    court_name: str,
    slot_time: str,
    booking_source: str,
    simulated_time: str
) -> dict:
    """
    Send a booking confirmation email
    """
    subject = f"TCS PlaySmart - Slot Booking Confirmed [{booking_id}] 🏸"
    
    body = f"""Dear {employee_name},

Your sports booking request on PlaySmart has been successfully confirmed!

Booking Details:
- Booking ID: {booking_id}
- Sport Category: {sport}
- Court / Board: {court_name}
- Reserved Time Slot: {slot_time}
- Booking Channel: {booking_source.capitalize()} Booking
- Simulated Timestamp: {simulated_time}

Please present your simulated QR Gate Pass at the court check-in checkpoint.

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
    reason: str = "Facility maintenance"
) -> dict:
    """
    Send a booking cancellation email
    """
    subject = f"TCS PlaySmart - Booking Cancelled [{booking_id}] ⚠️"
    
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
    slot_time: str
) -> dict:
    """
    Send a waitlist promotion email
    """
    subject = f"TCS PlaySmart - Waitlist Promoted to Confirmed Booking [{booking_id}] 🎉"
    
    body = f"""Dear {employee_name},

Good news! Your waitlist request has been promoted to a Confirmed Booking because a reservation was cancelled!

Booking Details:
- Booking ID: {booking_id}
- Sport Category: {sport}
- Court / Board: {court_name}
- Reserved Time Slot: {slot_time}
- Booking Channel: Waitlist Auto-Promotion

Please present your simulated QR Gate Pass at the court check-in checkpoint.

Enjoy your active session!

Best Regards,
TCS PlaySmart Admin Team

---
This is an automated message from TCS PlaySmart facility booking system.
"""
    
    return send_email(to_email, subject, body)


# Test function
def test_email_configuration() -> dict:
    """
    Test email configuration by sending a test email
    """
    if not ENABLE_REAL_EMAILS:
        return {
            "success": False,
            "error": "Real emails are disabled. Set ENABLE_REAL_EMAILS=true in .env"
        }
    
    if not SMTP_USER:
        return {
            "success": False,
            "error": "SMTP_USER not configured in .env"
        }
    
    test_subject = "TCS PlaySmart - Email Configuration Test"
    test_body = """This is a test email from TCS PlaySmart.

If you receive this email, your SMTP configuration is working correctly!

Configuration:
- SMTP Host: """ + SMTP_HOST + """
- SMTP Port: """ + str(SMTP_PORT) + """
- From Email: """ + SMTP_FROM_EMAIL + """

Best Regards,
TCS PlaySmart System"""
    
    return send_email(SMTP_USER, test_subject, test_body)
