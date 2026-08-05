from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
import datetime
import os

import httpx

from database import db_mgr
from email_service import send_email

app = FastAPI(title="TCS PlaySmart API Server", version="1.0.0")

_cors = os.getenv("CORS_ORIGINS", "*")
_origins = ["*"] if _cors.strip() == "*" else [o.strip() for o in _cors.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------- PYDANTIC REQUEST SCHEMAS -----------------

class TimeConfigSchema(BaseModel):
    hour: int = Field(..., ge=0, le=23)
    minute: int = Field(..., ge=0, le=59)

class FacilityCreateSchema(BaseModel):
    sport: str
    courtName: str

class SlotsUpdateSchema(BaseModel):
    slots: List[str]

class CapacitiesUpdateSchema(BaseModel):
    capacities: Dict[str, int]

class UserRegisterSchema(BaseModel):
    employeeId: str
    name: str
    email: str
    phoneNumber: Optional[str] = ""
    department: str
    businessUnit: str
    role: str
    password: Optional[str] = "password"

class UserLoginSchema(BaseModel):
    employeeId: str
    password: str

class EmailSendSchema(BaseModel):
    to: str
    subject: str
    body: str

class AiChatSchema(BaseModel):
    messages: List[Dict[str, Any]]
    temperature: Optional[float] = 0.1
    tools: Optional[List[Dict[str, Any]]] = None
    model: Optional[str] = "llama-3.3-70b-versatile"

class ForgotPasswordSchema(BaseModel):
    employeeId: str

class RoleUpdateSchema(BaseModel):
    userId: str
    role: str

class PlayerInfoSchema(BaseModel):
    employeeId: str
    name: str
    email: str

class BookingCreateSchema(BaseModel):
    employeeId: str
    email: Optional[str] = None
    facilityId: str
    slotTime: str
    bookingSource: str  # online, security
    additionalPlayers: Optional[List[PlayerInfoSchema]] = None

class CancelBookingSchema(BaseModel):
    bookingId: str

class UpdateBookingStatusSchema(BaseModel):
    bookingId: str
    status: str  # checked_in, no_show, cancelled
    verifiedBy: Optional[str] = "SEC202"

class JoinWaitlistSchema(BaseModel):
    employeeId: str
    facilityId: str
    slotTime: str

class LeaveWaitlistSchema(BaseModel):
    waitlistId: str

class MarkNotificationReadSchema(BaseModel):
    id: str


# ----------------- REST ENDPOINTS -----------------

# --- SYSTEM HEALTH / ROOT ---
@app.get("/")
def read_root():
    return {"status": "online", "message": "TCS PlaySmart API Server running successfully."}

# --- CURRENT TIME (Real System Time) ---
@app.get("/api/time")
def get_time():
    """Returns the current real system time"""
    now = datetime.datetime.now()
    return {"hour": now.hour, "minute": now.minute}

# --- USERS ---
@app.get("/api/users")
def get_users():
    return db_mgr.get_users()

@app.get("/api/users/has-admin")
def has_admin():
    return {"hasAdmin": db_mgr.has_admin()}

@app.post("/api/users/register")
def register_user(user: UserRegisterSchema):
    result = db_mgr.register_user(user.model_dump())
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    return result

@app.post("/api/users/login")
def login_user(login: UserLoginSchema):
    user = db_mgr.get_user_by_employee_id(login.employeeId)
    if not user:
        raise HTTPException(status_code=404, detail="Invalid Employee ID. No account found.")
    
    if login.password:
        user_password = user.get("password") or "password"
        if login.password != user_password:
            raise HTTPException(status_code=401, detail="Incorrect password.")
            
    return {"success": True, "user": user}

@app.post("/api/users/forgot-password")
def forgot_password(req: ForgotPasswordSchema):
    result = db_mgr.forgot_password(req.employeeId)
    if not result["success"]:
        raise HTTPException(status_code=404, detail=result["error"])
    return result

@app.post("/api/users/role")
def update_role(update: RoleUpdateSchema):
    success = db_mgr.update_user_role(update.userId, update.role)
    if not success:
        raise HTTPException(status_code=404, detail="User not found.")
    return {"success": True}

# --- FACILITIES ---
@app.get("/api/facilities")
def get_facilities():
    return db_mgr.get_facilities()

@app.post("/api/facilities/maintenance/{facility_id}")
def toggle_maintenance(facility_id: str):
    return db_mgr.toggle_facility_maintenance(facility_id)

@app.post("/api/facilities")
def add_facility(fac: FacilityCreateSchema):
    result = db_mgr.add_facility(fac.sport, fac.courtName)
    if not result:
        raise HTTPException(status_code=400, detail="Failed to create facility.")
    return result

@app.delete("/api/facilities/{facility_id}")
def delete_facility(facility_id: str):
    success = db_mgr.delete_facility(facility_id)
    if not success:
        raise HTTPException(status_code=400, detail="Failed to delete facility.")
    return {"success": True}

# --- SLOT TIMINGS ---
@app.get("/api/settings/slots")
def get_settings_slots():
    return db_mgr.get_slot_times()

@app.post("/api/settings/slots")
def save_settings_slots(req: SlotsUpdateSchema):
    success = db_mgr.save_slot_times(req.slots)
    if not success:
        raise HTTPException(status_code=400, detail="Failed to save slot timings.")
    return {"success": True}

# --- SPORT CAPACITIES ---
@app.get("/api/settings/capacities")
def get_settings_capacities():
    return db_mgr.get_sport_capacities()

@app.post("/api/settings/capacities")
def save_settings_capacities(req: CapacitiesUpdateSchema):
    success = db_mgr.save_sport_capacities(req.capacities)
    if not success:
        raise HTTPException(status_code=400, detail="Failed to save sport capacities.")
    return {"success": True}

# --- BOOKINGS ---
@app.get("/api/bookings")
def get_bookings():
    return db_mgr.get_bookings()

@app.post("/api/bookings")
def create_booking(booking: BookingCreateSchema):
    result = db_mgr.create_booking(booking.model_dump())
    if not result["success"]:
        print(f"[DEBUG API] /api/bookings error: {result['error']}")
        raise HTTPException(status_code=400, detail=result["error"])
    return result

@app.post("/api/bookings/cancel")
def cancel_booking(cancel: CancelBookingSchema):
    result = db_mgr.cancel_booking(cancel.bookingId)
    if not result["success"]:
        print(f"[DEBUG API] /api/bookings/cancel error: {result['error']}")
        raise HTTPException(status_code=400, detail=result["error"])
    return result

@app.post("/api/bookings/status")
def update_booking_status(status_update: UpdateBookingStatusSchema):
    result = db_mgr.update_booking_status(
        status_update.bookingId, 
        status_update.status, 
        status_update.verifiedBy
    )
    if not result["success"]:
        print(f"[DEBUG API] /api/bookings/status error: {result['error']}")
        raise HTTPException(status_code=400, detail=result["error"])
    return result

# --- WAITLIST ---
@app.get("/api/waitlist")
def get_waitlist():
    return db_mgr.get_waitlist()

@app.post("/api/waitlist/join")
def join_waitlist(waitlist_req: JoinWaitlistSchema):
    result = db_mgr.join_waitlist(
        waitlist_req.employeeId, 
        waitlist_req.facilityId, 
        waitlist_req.slotTime
    )
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    return result

@app.post("/api/waitlist/leave")
def leave_waitlist(waitlist_req: LeaveWaitlistSchema):
    result = db_mgr.leave_waitlist(waitlist_req.waitlistId)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    return result

# --- NOTIFICATIONS ---
@app.get("/api/notifications/{employee_id}")
def get_notifications(employee_id: str):
    return db_mgr.get_notifications(employee_id)

@app.post("/api/notifications/read")
def mark_notification_read(req: MarkNotificationReadSchema):
    success = db_mgr.mark_notification_read(req.id)
    if not success:
        raise HTTPException(status_code=404, detail="Notification not found.")
    return {"success": True}

# --- SIMULATED SMTP OUTBOX ---
@app.get("/api/emails")
def get_emails():
    return db_mgr.get_simulated_emails()

@app.post("/api/emails/clear")
def clear_emails():
    db_mgr.clear_simulated_emails()
    return {"success": True}

@app.post("/api/emails/send")
def send_real_email(req: EmailSendSchema):
    """Send via SMTP when ENABLE_REAL_EMAILS=true; otherwise reports simulated mode."""
    result = send_email(req.to, req.subject, req.body)
    if not result.get("success"):
        # Still OK for callers that only need best-effort delivery
        return {"success": False, "error": result.get("error"), "simulated": True}
    return {"success": True, "message": result.get("message")}

@app.post("/api/ai/chat")
async def ai_chat_proxy(req: AiChatSchema):
    """Proxy Groq so the API key stays on the server (never in Vite bundle)."""
    groq_key = os.getenv("GROQ_API_KEY") or os.getenv("VITE_GROQ_API_KEY")
    if not groq_key:
        raise HTTPException(status_code=503, detail="GROQ_API_KEY is not configured on the server.")

    payload: Dict[str, Any] = {
        "model": req.model or "llama-3.3-70b-versatile",
        "messages": req.messages,
        "temperature": req.temperature if req.temperature is not None else 0.1,
    }
    if req.tools:
        payload["tools"] = req.tools

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {groq_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )

    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return resp.json()

# --- SIMULATED TIME ---
@app.get("/api/simulated-time")
def get_simulated_time():
    return db_mgr.get_simulated_time()

@app.post("/api/simulated-time")
def set_simulated_time(time: TimeConfigSchema):
    return db_mgr.set_simulated_time(time.hour, time.minute)

