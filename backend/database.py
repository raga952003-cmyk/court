import os
import datetime
import json
from typing import List, Dict, Any, Optional
from pathlib import Path
from dotenv import load_dotenv

# Load env from backend/.env then project-root .env (docker-compose / local)
_backend_dir = Path(__file__).resolve().parent
load_dotenv(_backend_dir / ".env")
load_dotenv(_backend_dir.parent / ".env")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# Determine if we should use Supabase or fallback to SQLite
USE_SUPABASE = bool(SUPABASE_URL and SUPABASE_KEY)

# Import email service for real email sending
try:
    from email_service import send_email
    EMAIL_SERVICE_AVAILABLE = True
except ImportError:
    EMAIL_SERVICE_AVAILABLE = False
    print("Warning: email_service not available. Emails will only be stored in database.")

# ----------------- SQLALCHEMY FALLBACK DB MODEL SETUP -----------------
from sqlalchemy import create_engine, Column, String, Integer, Boolean, DateTime, CheckConstraint, Index
from sqlalchemy.orm import declarative_base, sessionmaker

Base = declarative_base()

class DBUser(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True)
    employee_id = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False)
    phone_number = Column(String)
    department = Column(String, nullable=False)
    business_unit = Column(String, nullable=False)
    role = Column(String, nullable=False)  # employee, security, admin
    password = Column(String, default="password")
    created_at = Column(String, default=lambda: datetime.datetime.now(datetime.timezone.utc).isoformat())

class DBSystemSetting(Base):
    __tablename__ = "system_settings"
    key = Column(String, primary_key=True)
    value = Column(String, nullable=False)

class DBFacility(Base):
    __tablename__ = "facilities"
    facility_id = Column(String, primary_key=True)
    sport = Column(String, nullable=False)
    court_name = Column(String, nullable=False)
    status = Column(String, default="active")  # active, maintenance

class DBBooking(Base):
    __tablename__ = "bookings"
    booking_id = Column(String, primary_key=True)
    employee_id = Column(String, nullable=False, index=True)
    employee_name = Column(String, nullable=False)
    facility_id = Column(String, nullable=False)
    sport = Column(String, nullable=False)
    court_name = Column(String, nullable=False)
    slot_time = Column(String, nullable=False)
    booking_source = Column(String, nullable=False)  # online, security
    status = Column(String, default="confirmed")  # confirmed, checked_in, no_show, cancelled
    created_at = Column(String, default=lambda: datetime.datetime.now(datetime.timezone.utc).isoformat())
    additional_players = Column(String, nullable=True)  # Store as JSON string

class DBWaitlist(Base):
    __tablename__ = "waitlist"
    waitlist_id = Column(String, primary_key=True)
    employee_id = Column(String, nullable=False)
    employee_name = Column(String, nullable=False)
    facility_id = Column(String, nullable=False)
    sport = Column(String, nullable=False)
    court_name = Column(String, nullable=False)
    slot_time = Column(String, nullable=False)
    created_at = Column(String, default=lambda: datetime.datetime.now(datetime.timezone.utc).isoformat())

class DBNotification(Base):
    __tablename__ = "notifications"
    id = Column(String, primary_key=True)
    employee_id = Column(String, nullable=False, index=True)
    title = Column(String, nullable=False)
    message = Column(String, nullable=False)
    type = Column(String, default="info")  # info, success, warning, error
    read = Column(Boolean, default=False)
    created_at = Column(String, default=lambda: datetime.datetime.now(datetime.timezone.utc).isoformat())

class DBSimulatedEmail(Base):
    __tablename__ = "simulated_emails"
    id = Column(String, primary_key=True)
    to_email = Column(String, nullable=False)
    subject = Column(String, nullable=False)
    body = Column(String, nullable=False)
    sent_at = Column(String, default=lambda: datetime.datetime.now(datetime.timezone.utc).isoformat())

class DBSimulatedTime(Base):
    __tablename__ = "simulated_time"
    key = Column(String, primary_key=True, default="current_time")
    hour = Column(Integer, default=9)
    minute = Column(Integer, default=0)


# Initialize local engine & sessions
engine = create_engine("sqlite:///playsmart_sandbox.db", connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_sqlite_db():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        # Run migration check for additional_players column
        from sqlalchemy import text
        try:
            db.execute(text("SELECT additional_players FROM bookings LIMIT 1"))
        except Exception:
            try:
                db.execute(text("ALTER TABLE bookings ADD COLUMN additional_players TEXT"))
                db.commit()
            except Exception as e:
                print(f"Migration error: {e}")

        # Seed default facilities if empty
        if db.query(DBFacility).count() == 0:
            facilities = [
                DBFacility(facility_id="badminton_c1", sport="Badminton", court_name="Court 1", status="active"),
                DBFacility(facility_id="badminton_c2", sport="Badminton", court_name="Court 2", status="active"),
                DBFacility(facility_id="badminton_c3", sport="Badminton", court_name="Court 3", status="active"),
                DBFacility(facility_id="basketball_c1", sport="Basketball", court_name="Court 1", status="active"),
                DBFacility(facility_id="basketball_c2", sport="Basketball", court_name="Court 2", status="active"),
                DBFacility(facility_id="volleyball_c1", sport="Volleyball", court_name="Court 1", status="active"),
                DBFacility(facility_id="volleyball_c2", sport="Volleyball", court_name="Court 2", status="active"),
                DBFacility(facility_id="tt_t1", sport="Table Tennis", court_name="Table 1", status="active"),
                DBFacility(facility_id="tt_t2", sport="Table Tennis", court_name="Table 2", status="active"),
                DBFacility(facility_id="carrom_b1", sport="Carrom", court_name="Board 1", status="active"),
                DBFacility(facility_id="carrom_b2", sport="Carrom", court_name="Board 2", status="active"),
                DBFacility(facility_id="carrom_b3", sport="Carrom", court_name="Board 3", status="active"),
                DBFacility(facility_id="carrom_b4", sport="Carrom", court_name="Board 4", status="active"),
                DBFacility(facility_id="carrom_b5", sport="Carrom", court_name="Board 5", status="active"),
                DBFacility(facility_id="cricket_g1", sport="Box Cricket", court_name="Ground 1", status="active"),
            ]
            db.bulk_save_objects(facilities)
            db.commit()
            
        # Seed default simulated time if empty
        if db.query(DBSimulatedTime).filter_by(key="current_time").first() is None:
            time_conf = DBSimulatedTime(key="current_time", hour=9, minute=0)
            db.add(time_conf)
            db.commit()
    finally:
        db.close()


# ----------------- SUPABASE CLIENT SETUP -----------------
supabase_client = None
if USE_SUPABASE:
    try:
        from supabase import create_client, Client
        supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
    except Exception as e:
        print(f"Error initializing Supabase client: {e}. Falling back to SQLite.")
        USE_SUPABASE = False

if not USE_SUPABASE:
    init_sqlite_db()


# ----------------- DATABASE INTERFACE IMPLEMENTATION -----------------

class DatabaseManager:
    # --- SIMULATED TIME ---
    def get_simulated_time(self) -> Dict[str, int]:
        if USE_SUPABASE:
            res = supabase_client.table("simulated_time").select("hour, minute").eq("key", "current_time").execute()
            if res.data and len(res.data) > 0:
                return {"hour": res.data[0]["hour"], "minute": res.data[0]["minute"]}
            return {"hour": 9, "minute": 0}
        else:
            db = SessionLocal()
            try:
                t = db.query(DBSimulatedTime).filter_by(key="current_time").first()
                if t:
                    return {"hour": t.hour, "minute": t.minute}
                return {"hour": 9, "minute": 0}
            finally:
                db.close()

    def set_simulated_time(self, hour: int, minute: int) -> Dict[str, int]:
        if USE_SUPABASE:
            supabase_client.table("simulated_time").upsert({"key": "current_time", "hour": hour, "minute": minute}).execute()
            return {"hour": hour, "minute": minute}
        else:
            db = SessionLocal()
            try:
                t = db.query(DBSimulatedTime).filter_by(key="current_time").first()
                if t:
                    t.hour = hour
                    t.minute = minute
                else:
                    t = DBSimulatedTime(key="current_time", hour=hour, minute=minute)
                    db.add(t)
                db.commit()
                return {"hour": t.hour, "minute": t.minute}
            finally:
                db.close()

    # --- USERS ---
    def get_users(self) -> List[Dict[str, Any]]:
        if USE_SUPABASE:
            res = supabase_client.table("users").select("*").execute()
            return res.data or []
        else:
            db = SessionLocal()
            try:
                users = db.query(DBUser).all()
                return [
                    {
                        "id": u.id, "employeeId": u.employee_id, "name": u.name, "email": u.email,
                        "phoneNumber": u.phone_number, "department": u.department, 
                        "businessUnit": u.business_unit, "role": u.role, "createdAt": u.created_at
                    }
                    for u in users
                ]
            finally:
                db.close()

    def has_admin(self) -> bool:
        if USE_SUPABASE:
            res = supabase_client.table("users").select("id").eq("role", "admin").limit(1).execute()
            return bool(res.data and len(res.data) > 0)
        else:
            db = SessionLocal()
            try:
                return db.query(DBUser).filter_by(role="admin").first() is not None
            finally:
                db.close()

    def get_user_by_employee_id(self, employee_id: str) -> Optional[Dict[str, Any]]:
        if USE_SUPABASE:
            res = supabase_client.table("users").select("*").eq("employee_id", employee_id.upper()).execute()
            if res.data and len(res.data) > 0:
                u = res.data[0]
                return {
                    "id": u["id"], "employeeId": u["employee_id"], "name": u["name"], "email": u["email"],
                    "phoneNumber": u.get("phone_number"), "department": u["department"], 
                    "businessUnit": u["business_unit"], "role": u["role"], "password": u.get("password")
                }
            return None
        else:
            db = SessionLocal()
            try:
                u = db.query(DBUser).filter(DBUser.employee_id == employee_id.upper()).first()
                if u:
                    return {
                        "id": u.id, "employeeId": u.employee_id, "name": u.name, "email": u.email,
                        "phoneNumber": u.phone_number, "department": u.department, 
                        "businessUnit": u.business_unit, "role": u.role, "password": u.password
                    }
                return None
            finally:
                db.close()

    def register_user(self, user_data: Dict[str, Any]) -> Dict[str, Any]:
        emp_id = user_data["employeeId"].strip().upper()
        email = user_data["email"].strip().lower()
        
        # Check uniqueness
        if USE_SUPABASE:
            # check id
            res_id = supabase_client.table("users").select("id").eq("employee_id", emp_id).execute()
            if res_id.data and len(res_id.data) > 0:
                return {"success": False, "error": f"Employee ID {emp_id} is already registered."}
            res_email = supabase_client.table("users").select("id").eq("email", email).execute()
            if res_email.data and len(res_email.data) > 0:
                return {"success": False, "error": f"Email {email} is already registered."}

            new_user = {
                "id": f"u_{int(datetime.datetime.now().timestamp() * 1000)}",
                "employee_id": emp_id,
                "name": user_data["name"].strip(),
                "email": email,
                "phone_number": user_data.get("phoneNumber", ""),
                "department": user_data["department"],
                "business_unit": user_data["businessUnit"],
                "role": user_data["role"],
                "password": user_data.get("password", "password"),
                "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
            }
            supabase_client.table("users").insert(new_user).execute()
            return {"success": True, "user": new_user}
        else:
            db = SessionLocal()
            try:
                if db.query(DBUser).filter_by(employee_id=emp_id).first():
                    return {"success": False, "error": f"Employee ID {emp_id} is already registered."}
                if db.query(DBUser).filter_by(email=email).first():
                    return {"success": False, "error": f"Email {email} is already registered."}

                u = DBUser(
                    id=f"u_{int(datetime.datetime.now().timestamp() * 1000)}",
                    employee_id=emp_id,
                    name=user_data["name"].strip(),
                    email=email,
                    phone_number=user_data.get("phoneNumber", ""),
                    department=user_data["department"],
                    business_unit=user_data["businessUnit"],
                    role=user_data["role"],
                    password=user_data.get("password", "password")
                )
                db.add(u)
                db.commit()
                return {
                    "success": True, 
                    "user": {
                        "id": u.id, "employeeId": u.employee_id, "name": u.name, "email": u.email,
                        "phoneNumber": u.phone_number, "department": u.department, 
                        "businessUnit": u.business_unit, "role": u.role, "createdAt": u.created_at
                    }
                }
            finally:
                db.close()

    def update_user_role(self, user_id: str, role: str) -> bool:
        if USE_SUPABASE:
            supabase_client.table("users").update({"role": role}).eq("id", user_id).execute()
            return True
        else:
            db = SessionLocal()
            try:
                u = db.query(DBUser).filter_by(id=user_id).first()
                if u:
                    u.role = role
                    db.commit()
                    return True
                return False
            finally:
                db.close()

    # --- FACILITIES ---
    def get_facilities(self) -> List[Dict[str, Any]]:
        if USE_SUPABASE:
            res = supabase_client.table("facilities").select("*").execute()
            # Sort to keep ordering stable
            data = res.data or []
            return sorted(data, key=lambda x: x["facility_id"])
        else:
            db = SessionLocal()
            try:
                facs = db.query(DBFacility).all()
                return [
                    {"facilityId": f.facility_id, "sport": f.sport, "courtName": f.court_name, "status": f.status}
                    for f in facs
                ]
            finally:
                db.close()

    def toggle_facility_maintenance(self, facility_id: str) -> List[Dict[str, Any]]:
        if USE_SUPABASE:
            res = supabase_client.table("facilities").select("status").eq("facility_id", facility_id).execute()
            if not res.data:
                return self.get_facilities()
            current_status = res.data[0]["status"]
            next_status = "maintenance" if current_status == "active" else "active"
            supabase_client.table("facilities").update({"status": next_status}).eq("facility_id", facility_id).execute()
            
            if next_status == "maintenance":
                # Invalidate active bookings
                self._cancel_facility_bookings(facility_id)
            return self.get_facilities()
        else:
            db = SessionLocal()
            try:
                f = db.query(DBFacility).filter_by(facility_id=facility_id).first()
                if f:
                    f.status = "maintenance" if f.status == "active" else "active"
                    db.commit()
                    if f.status == "maintenance":
                        self._cancel_facility_bookings(facility_id)
                return [
                    {"facilityId": x.facility_id, "sport": x.sport, "courtName": x.court_name, "status": x.status}
                    for x in db.query(DBFacility).all()
                ]
            finally:
                db.close()

    def add_facility(self, sport: str, court_name: str) -> Dict[str, Any]:
        facility_id = f"{sport.lower().replace(' ', '_')}_{int(datetime.datetime.now().timestamp())}"
        if USE_SUPABASE:
            res = supabase_client.table("facilities").insert({
                "facility_id": facility_id,
                "sport": sport,
                "court_name": court_name,
                "status": "active"
            }).execute()
            if res.data and len(res.data) > 0:
                f = res.data[0]
                return {"facilityId": f["facility_id"], "sport": f["sport"], "courtName": f["court_name"], "status": f["status"]}
            return {}
        else:
            db = SessionLocal()
            try:
                f = DBFacility(facility_id=facility_id, sport=sport, court_name=court_name, status="active")
                db.add(f)
                db.commit()
                return {"facilityId": f.facility_id, "sport": f.sport, "courtName": f.court_name, "status": f.status}
            finally:
                db.close()

    def delete_facility(self, facility_id: str) -> bool:
        # First cancel and notify any active bookings on this court
        self._cancel_facility_bookings(facility_id)
        
        if USE_SUPABASE:
            # Delete associated waitlist and bookings just in case cascade is not fully configured on all environments
            supabase_client.table("waitlist").delete().eq("facility_id", facility_id).execute()
            supabase_client.table("bookings").delete().eq("facility_id", facility_id).execute()
            res = supabase_client.table("facilities").delete().eq("facility_id", facility_id).execute()
            return True
        else:
            db = SessionLocal()
            try:
                # Delete bookings and waitlist
                db.query(DBBooking).filter_by(facility_id=facility_id).delete()
                db.query(DBWaitlist).filter_by(facility_id=facility_id).delete()
                # Delete facility
                db.query(DBFacility).filter_by(facility_id=facility_id).delete()
                db.commit()
                return True
            except Exception as e:
                print(f"Error deleting facility from SQLite: {e}")
                db.rollback()
                return False
            finally:
                db.close()

    def get_slot_times(self) -> List[str]:
        default_slots = [
            "6-7 AM", "7-8 AM", "8-9 AM", "9-10 AM", "10-11 AM",
            "11-12 PM", "12-1 PM", "1-2 PM", "2-3 PM", "3-4 PM",
            "4-5 PM", "5-6 PM", "6-7 PM", "7-8 PM"
        ]
        if USE_SUPABASE:
            try:
                res = supabase_client.table("system_settings").select("value").eq("key", "slot_times").execute()
                if res.data and len(res.data) > 0:
                    return json.loads(res.data[0]["value"])
            except Exception as e:
                print(f"Error getting slot times from Supabase: {e}")
            return default_slots
        else:
            db = SessionLocal()
            try:
                s = db.query(DBSystemSetting).filter_by(key="slot_times").first()
                if s:
                    try:
                        return json.loads(s.value)
                    except Exception:
                        pass
                return default_slots
            finally:
                db.close()

    def save_slot_times(self, slots: List[str]) -> bool:
        value_str = json.dumps(slots)
        if USE_SUPABASE:
            try:
                supabase_client.table("system_settings").upsert({
                    "key": "slot_times",
                    "value": value_str
                }).execute()
                return True
            except Exception as e:
                print(f"Error saving slot times to Supabase: {e}")
                return False
        else:
            db = SessionLocal()
            try:
                s = db.query(DBSystemSetting).filter_by(key="slot_times").first()
                if s:
                    s.value = value_str
                else:
                    s = DBSystemSetting(key="slot_times", value=value_str)
                    db.add(s)
                db.commit()
                return True
            except Exception as e:
                print(f"Error saving slot times: {e}")
                db.rollback()
                return False
            finally:
                db.close()

    def get_sport_capacities(self) -> Dict[str, int]:
        default_capacities = {
            "Badminton": 4,
            "Carrom": 4,
            "Table Tennis": 4,
            "Basketball": 10,
            "Box Cricket": 22,
            "Volleyball": 12
        }
        if USE_SUPABASE:
            try:
                res = supabase_client.table("system_settings").select("value").eq("key", "sport_capacities").execute()
                if res.data and len(res.data) > 0:
                    return json.loads(res.data[0]["value"])
            except Exception as e:
                print(f"Error getting capacities from Supabase: {e}")
            return default_capacities
        else:
            db = SessionLocal()
            try:
                s = db.query(DBSystemSetting).filter_by(key="sport_capacities").first()
                if s:
                    try:
                        return json.loads(s.value)
                    except Exception:
                        pass
                return default_capacities
            finally:
                db.close()

    def save_sport_capacities(self, capacities: Dict[str, int]) -> bool:
        value_str = json.dumps(capacities)
        if USE_SUPABASE:
            try:
                supabase_client.table("system_settings").upsert({
                    "key": "sport_capacities",
                    "value": value_str
                }).execute()
                return True
            except Exception as e:
                print(f"Error saving capacities to Supabase: {e}")
                return False
        else:
            db = SessionLocal()
            try:
                s = db.query(DBSystemSetting).filter_by(key="sport_capacities").first()
                if s:
                    s.value = value_str
                else:
                    s = DBSystemSetting(key="sport_capacities", value=value_str)
                    db.add(s)
                db.commit()
                return True
            except Exception as e:
                print(f"Error saving capacities to SQLite: {e}")
                db.rollback()
                return False
            finally:
                db.close()

    def _cancel_facility_bookings(self, facility_id: str):
        # Fetch facility info
        if USE_SUPABASE:
            fac_res = supabase_client.table("facilities").select("*").eq("facility_id", facility_id).execute()
            if not fac_res.data: return
            fac = fac_res.data[0]
            
            # Find all confirmed bookings
            b_res = supabase_client.table("bookings").select("*").eq("facility_id", facility_id).eq("status", "confirmed").execute()
            bookings = b_res.data or []
            
            for b in bookings:
                supabase_client.table("bookings").update({"status": "cancelled"}).eq("booking_id", b["booking_id"]).execute()
                
                # Build players list
                all_players = [{"employeeId": b["employee_id"], "name": b["employee_name"]}]
                if b.get("additional_players"):
                    try:
                        ap_list = json.loads(b["additional_players"])
                        for ap in ap_list:
                            all_players.append(ap)
                    except Exception:
                        pass
                
                for p_user in all_players:
                    p_emp = p_user["employeeId"]
                    p_name = p_user["name"]
                    
                    self.add_notification({
                        "employeeId": p_emp,
                        "title": "Facility Maintenance: Slot Cancelled ⚠️",
                        "message": f"Your booking for {b['sport']} ({b['court_name']}) at {b['slot_time']} was cancelled because the facility was put under maintenance.",
                        "type": "error"
                    })
                    
                    email_subject = f"TCS PlaySmart - Booking Cancelled due to Facility Maintenance [{b['booking_id']}] ⚠️"
                    email_body = f"Dear {p_name},\n\nYour sports booking reservation on PlaySmart has been cancelled because the facility has been put under emergency maintenance.\n\nCancelled Booking Details:\n- Booking ID: {b['booking_id']}\n- Sport Category: {b['sport']}\n- Court / Board: {b['court_name']}\n- Cancelled Time Slot: {b['slot_time']}\n"
                    
                    if b["sport"] == "Badminton":
                        players_list_str = "\n".join([f"  - Player {i+1}: {pl['name']} ({pl['employeeId']})" for i, pl in enumerate(all_players)])
                        email_body += f"\nPlayers in this Match:\n{players_list_str}\n"
                        
                    email_body += f"\nWe apologize for the inconvenience. Please select another court or time slot.\n\nBest Regards,\nTCS PlaySmart Admin Team"
                    
                    user_res = supabase_client.table("users").select("email").eq("employee_id", p_emp).execute()
                    email_to = user_res.data[0]["email"] if user_res.data else f"{p_emp.lower()}@tcs.com"
                    self.send_simulated_email(email_to, email_subject, email_body)
        else:
            db = SessionLocal()
            try:
                fac = db.query(DBFacility).filter_by(facility_id=facility_id).first()
                if not fac: return
                
                bookings = db.query(DBBooking).filter_by(facility_id=facility_id, status="confirmed").all()
                for b in bookings:
                    b.status = "cancelled"
                    db.commit()
                    
                    all_players = [{"employeeId": b.employee_id, "name": b.employee_name}]
                    if b.additional_players:
                        try:
                            ap_list = json.loads(b.additional_players)
                            for ap in ap_list:
                                all_players.append(ap)
                        except Exception:
                            pass
                            
                    for p_user in all_players:
                        p_emp = p_user["employeeId"]
                        p_name = p_user["name"]
                        
                        self.add_notification({
                            "employeeId": p_emp,
                            "title": "Facility Maintenance: Slot Cancelled ⚠️",
                            "message": f"Your booking for {b.sport} ({b.court_name}) at {b.slot_time} was cancelled because the facility was put under maintenance.",
                            "type": "error"
                        })
                        
                        email_subject = f"TCS PlaySmart - Booking Cancelled due to Facility Maintenance [{b.booking_id}] ⚠️"
                        email_body = f"Dear {p_name},\n\nYour sports booking reservation on PlaySmart has been cancelled because the facility has been put under emergency maintenance.\n\nCancelled Booking Details:\n- Booking ID: {b.booking_id}\n- Sport Category: {b.sport}\n- Court / Board: {b.court_name}\n- Cancelled Time Slot: {b.slot_time}\n"
                        
                        if b.sport == "Badminton":
                            players_list_str = "\n".join([f"  - Player {i+1}: {pl['name']} ({pl['employeeId']})" for i, pl in enumerate(all_players)])
                            email_body += f"\nPlayers in this Match:\n{players_list_str}\n"
                            
                        email_body += f"\nWe apologize for the inconvenience. Please select another court or time slot.\n\nBest Regards,\nTCS PlaySmart Admin Team"
                        
                        u = db.query(DBUser).filter_by(employee_id=p_emp).first()
                        email_to = u.email if u else f"{p_emp.lower()}@tcs.com"
                        self.send_simulated_email(email_to, email_subject, email_body)
            finally:
                db.close()

    # --- BOOKINGS ---
    def get_bookings(self) -> List[Dict[str, Any]]:
        if USE_SUPABASE:
            res = supabase_client.table("bookings").select("*").execute()
            # Convert keys to camelCase for the frontend
            bookings = res.data or []
            return [
                {
                    "bookingId": b["booking_id"], "employeeId": b["employee_id"], "employeeName": b["employee_name"],
                    "facilityId": b["facility_id"], "sport": b["sport"], "courtName": b["court_name"],
                    "slotTime": b["slot_time"], "bookingSource": b["booking_source"], "status": b["status"],
                    "createdAt": b["created_at"],
                    "additionalPlayers": json.loads(b["additional_players"]) if b.get("additional_players") else []
                }
                for b in bookings
            ]
        else:
            db = SessionLocal()
            try:
                books = db.query(DBBooking).all()
                return [
                    {
                        "bookingId": b.booking_id, "employeeId": b.employee_id, "employeeName": b.employee_name,
                        "facilityId": b.facility_id, "sport": b.sport, "courtName": b.court_name,
                        "slotTime": b.slot_time, "bookingSource": b.booking_source, "status": b.status,
                        "createdAt": b.created_at,
                    "additionalPlayers": json.loads(b.additional_players) if b.additional_players else []
                    }
                    for b in books
                ]
            finally:
                db.close()

    def create_booking(self, booking_data: Dict[str, Any]) -> Dict[str, Any]:
        emp_id = booking_data["employeeId"].strip().upper()
        email = booking_data.get("email", "").strip().lower()
        facility_id = booking_data["facilityId"]
        slot_time = booking_data["slotTime"]
        source = booking_data["bookingSource"]

        # 1. Validate Facility status
        facilities = self.get_facilities()
        facility = next((f for f in facilities if f["facilityId"] == facility_id), None)
        if not facility:
            return {"success": False, "error": "Facility not found."}
        if facility["status"] == "maintenance":
            return {"success": False, "error": f"{facility['sport']} {facility['courtName']} is under maintenance and cannot be booked."}

        # 2. Validate primary employee (must already be registered — no auto-register)
        employee = self.get_user_by_employee_id(emp_id)
        if not employee:
            return {"success": False, "error": f"Employee ID {emp_id} is not registered. Register before booking."}
        elif email and employee["email"].lower() != email:
            return {"success": False, "error": f"The provided Email ID does not match the registered Email for Employee ID {emp_id}."}

        # 3. Optional invitees — registered users only (aligned with frontend invite flow)
        all_players = [employee]
        additional_players_list = []
        additional = booking_data.get("additionalPlayers") or []
        seen_ids = {emp_id}
        for idx, p in enumerate(additional):
            p_emp_id = (p.get("employeeId") or "").strip().upper()
            p_name = (p.get("name") or "").strip()
            if not p_emp_id:
                continue
            if p_emp_id in seen_ids:
                return {"success": False, "error": f"Duplicate invite for Employee ID {p_emp_id}."}
            seen_ids.add(p_emp_id)
            p_user = self.get_user_by_employee_id(p_emp_id)
            if not p_user:
                return {"success": False, "error": f"Employee ID {p_emp_id} is not registered. They must register before they can be invited."}
            if p_name and p_name.lower() != p_user["name"].strip().lower():
                return {"success": False, "error": f"Name for {p_emp_id} does not match registered name ({p_user['name']})."}
            all_players.append(p_user)
            additional_players_list.append({
                "employeeId": p_user["employeeId"],
                "name": p_user["name"],
                "email": p_user["email"]
            })

        # 4. Check booking rules & window bypass for Admins
        sim_time = self.get_simulated_time()
        current_hour = sim_time["hour"]
        is_admin_override = employee["role"] == "admin"
        
        if not is_admin_override:
            if source == "online":
                if current_hour < 10 or current_hour >= 20:
                    return {
                        "success": False,
                        "error": "Online booking is closed. Employee Booking Window is active from 10:00 AM to 8:00 PM."
                    }

        # 5. Check double booking / overlapping
        bookings = self.get_bookings()
        
        # Check if slot is already occupied / full based on dynamic sport capacities
        capacities = self.get_sport_capacities()
        sport_name = facility["sport"]
        max_capacity = capacities.get(sport_name, 4)
        
        joined_count = len([b for b in bookings if b["facilityId"] == facility_id and b["slotTime"] == slot_time and b["status"] != "cancelled"])
        pending_invites = 0
        if USE_SUPABASE:
            try:
                inv_res = supabase_client.table("booking_invites").select("invite_id").eq("facility_id", facility_id).eq("slot_time", slot_time).eq("status", "pending").execute()
                pending_invites = len(inv_res.data or [])
            except Exception:
                pending_invites = 0
        seats_needed = 1 + len(additional_players_list)
        if joined_count + pending_invites + seats_needed > max_capacity:
            return {"success": False, "error": f"Not enough seats. Capacity {max_capacity}, occupied/reserved {joined_count + pending_invites}, requested {seats_needed}."}

        # Overlapping and daily limit check helper
        def player_in_booking(b, check_emp_id):
            if b["employeeId"] == check_emp_id:
                return True
            add_p = b.get("additionalPlayers") or []
            return any(ap["employeeId"] == check_emp_id for ap in add_p)

        for p_user in all_players:
            p_emp = p_user["employeeId"]
            p_name = p_user["name"]
            
            # Check overlap in any sport
            overlap = next((b for b in bookings if player_in_booking(b, p_emp) and b["slotTime"] == slot_time and b["status"] != "cancelled"), None)
            if overlap:
                err_prefix = "You" if p_emp == emp_id else f"Player {p_name} ({p_emp})"
                verb = "already have" if p_emp == emp_id else "already has"
                return {"success": False, "error": f"{err_prefix} {verb} another booking at {slot_time}."}
                
            # Same sport daily limit check
            sport_overlap = next((b for b in bookings if player_in_booking(b, p_emp) and b["sport"] == facility["sport"] and b["status"] != "cancelled"), None)
            if sport_overlap:
                err_prefix = "You" if p_emp == emp_id else f"Player {p_name} ({p_emp})"
                verb = "already have" if p_emp == emp_id else "already has"
                return {"success": False, "error": f"{err_prefix} {verb} an active booking for {facility['sport']} today. Employees are limited to one active booking per sport per day."}

        # 6. Insert Booking
        booking_id = f"b_{int(datetime.datetime.now().timestamp() * 1000)}"
        serialized_players = json.dumps(additional_players_list) if additional_players_list else None
        
        new_booking = {
            "booking_id": booking_id,
            "employee_id": emp_id,
            "employee_name": employee["name"],
            "facility_id": facility_id,
            "sport": facility["sport"],
            "court_name": facility["courtName"],
            "slot_time": slot_time,
            "booking_source": source,
            "status": "confirmed",
            "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "additional_players": serialized_players
        }

        if USE_SUPABASE:
            supabase_client.table("bookings").insert(new_booking).execute()
        else:
            db = SessionLocal()
            try:
                b = DBBooking(
                    booking_id=booking_id,
                    employee_id=emp_id,
                    employee_name=employee["name"],
                    facility_id=facility_id,
                    sport=facility["sport"],
                    court_name=facility["courtName"],
                    slot_time=slot_time,
                    booking_source=source,
                    status="confirmed",
                    additional_players=serialized_players
                )
                db.add(b)
                db.commit()
            finally:
                db.close()

        # 7. Notify organizer (confirmed) + create 5-min invites for additional registered players
        self.add_notification({
            "employeeId": emp_id,
            "title": "Booking Confirmed",
            "message": f"Your slot for {facility['sport']} ({facility['courtName']}) at {slot_time} has been successfully booked!",
            "type": "success"
        })
        self.send_simulated_email(
            employee["email"],
            f"TCS PlaySmart - Slot Booking Confirmed [{booking_id}]",
            f"Dear {employee['name']},\n\nYour booking is confirmed.\n\n"
            f"- Booking ID: {booking_id}\n- Sport: {facility['sport']}\n"
            f"- Court: {facility['courtName']}\n- Slot: {slot_time}\n\n"
            f"Best Regards,\nTCS PlaySmart Admin Team"
        )

        expires_at = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=5)).isoformat()
        invites_sent = 0
        if USE_SUPABASE and additional_players_list:
            for i, p_user in enumerate(additional_players_list):
                invite_id = f"inv_{int(datetime.datetime.now().timestamp() * 1000)}_{i}"
                try:
                    supabase_client.table("booking_invites").insert({
                        "invite_id": invite_id,
                        "booking_id": booking_id,
                        "organizer_employee_id": emp_id,
                        "invitee_employee_id": p_user["employeeId"],
                        "invitee_name": p_user["name"],
                        "facility_id": facility_id,
                        "sport": facility["sport"],
                        "court_name": facility["courtName"],
                        "slot_time": slot_time,
                        "status": "pending",
                        "expires_at": expires_at
                    }).execute()
                except Exception as e:
                    return {"success": False, "error": f"Booking created but invite failed: {e}"}

                invite_msg = (
                    f"{employee['name']} ({emp_id}) invited you to {facility['sport']} "
                    f"({facility['courtName']}) at {slot_time}. Accept within 5 minutes or it expires."
                )
                self.add_notification({
                    "employeeId": p_user["employeeId"],
                    "title": "Match Invite — Accept within 5 minutes",
                    "message": invite_msg,
                    "type": "warning"
                })
                self.send_simulated_email(
                    p_user["email"],
                    f"TCS PlaySmart - Match Invite [{facility['sport']} {slot_time}]",
                    f"Dear {p_user['name']},\n\n{invite_msg}\n\nBest Regards,\nTCS PlaySmart Admin Team"
                )
                invites_sent += 1

        return {
            "success": True,
            "invitesSent": invites_sent,
            "booking": {
                "bookingId": booking_id,
                "employeeId": emp_id,
                "employeeName": employee["name"],
                "facilityId": facility_id,
                "sport": facility["sport"],
                "courtName": facility["courtName"],
                "slotTime": slot_time,
                "bookingSource": source,
                "status": "confirmed",
                "additionalPlayers": additional_players_list
            }
        }

    def cancel_booking(self, booking_id: str) -> Dict[str, Any]:
        # Fetch booking details
        booking = None
        if USE_SUPABASE:
            res = supabase_client.table("bookings").select("*").eq("booking_id", booking_id).execute()
            if res.data:
                b = res.data[0]
                booking = {
                    "booking_id": b["booking_id"],
                    "employee_id": b["employee_id"],
                    "employee_name": b["employee_name"],
                    "facility_id": b["facility_id"],
                    "sport": b["sport"],
                    "court_name": b["court_name"],
                    "slot_time": b["slot_time"],
                    "status": b["status"],
                    "additional_players": json.loads(b["additional_players"]) if b.get("additional_players") else []
                }
        else:
            db = SessionLocal()
            try:
                b = db.query(DBBooking).filter_by(booking_id=booking_id).first()
                if b:
                    booking = {
                        "booking_id": b.booking_id,
                        "employee_id": b.employee_id,
                        "employee_name": b.employee_name,
                        "facility_id": b.facility_id,
                        "sport": b.sport,
                        "court_name": b.court_name,
                        "slot_time": b.slot_time,
                        "status": b.status,
                        "additional_players": json.loads(b.additional_players) if b.additional_players else []
                    }
            finally:
                db.close()

        if not booking:
            return {"success": False, "error": "Booking not found."}

        if booking["status"] == "cancelled":
            return {"success": False, "error": "Booking is already cancelled."}

        # Update status
        if USE_SUPABASE:
            supabase_client.table("bookings").update({"status": "cancelled"}).eq("booking_id", booking_id).execute()
        else:
            db = SessionLocal()
            try:
                b = db.query(DBBooking).filter_by(booking_id=booking_id).first()
                b.status = "cancelled"
                db.commit()
            finally:
                db.close()

        # Build list of all players to notify
        all_players = [{
            "employeeId": booking["employee_id"],
            "name": booking["employee_name"]
        }]
        for ap in booking.get("additional_players") or []:
            all_players.append({
                "employeeId": ap["employeeId"],
                "name": ap["name"]
            })

        # Add cancel notification and send cancellation email to all players
        for p_user in all_players:
            p_emp = p_user["employeeId"]
            p_name = p_user["name"]
            
            self.add_notification({
                "employeeId": p_emp,
                "title": "Booking Cancelled 🔴",
                "message": f"Your booking for {booking['sport']} ({booking['court_name']}) at {booking['slot_time']} was cancelled.",
                "type": "warning"
            })

            u = self.get_user_by_employee_id(p_emp)
            email_to = u["email"] if u else f"{p_emp.lower()}@tcs.com"
            email_subject = f"TCS PlaySmart - Slot Booking Cancelled [{booking_id}] 🔴"
            email_body = f"Dear {p_name},\n\nYour sports booking reservation on PlaySmart has been successfully cancelled.\n\nCancelled Booking Details:\n- Booking ID: {booking_id}\n- Sport Category: {booking['sport']}\n- Court / Board: {booking['court_name']}\n- Cancelled Time Slot: {booking['slot_time']}\n"
            
            if booking["sport"] == "Badminton":
                players_list_str = "\n".join([f"  - Player {i+1}: {pl['name']} ({pl['employeeId']})" for i, pl in enumerate(all_players)])
                email_body += f"\nPlayers in this Match:\n{players_list_str}\n"

            email_body += f"\nIf you did not request this cancellation, please contact the PlaySmart Administrator.\n\nBest Regards,\nTCS PlaySmart Admin Team"
            self.send_simulated_email(email_to, email_subject, email_body)

        # Trigger auto promotion
        self.process_waitlist_promotion(booking["facility_id"], booking["slot_time"])

        return {"success": True}

    def update_booking_status(self, booking_id: str, status: str, verified_by: str) -> Dict[str, Any]:
        # Fetch booking details
        booking = None
        if USE_SUPABASE:
            res = supabase_client.table("bookings").select("*").eq("booking_id", booking_id).execute()
            if res.data:
                b = res.data[0]
                booking = {
                    "booking_id": b["booking_id"],
                    "employee_id": b["employee_id"],
                    "employee_name": b["employee_name"],
                    "facility_id": b["facility_id"],
                    "sport": b["sport"],
                    "court_name": b["court_name"],
                    "slot_time": b["slot_time"],
                    "status": b["status"],
                    "additional_players": json.loads(b["additional_players"]) if b.get("additional_players") else []
                }
        else:
            db = SessionLocal()
            try:
                b = db.query(DBBooking).filter_by(booking_id=booking_id).first()
                if b:
                    booking = {
                        "booking_id": b.booking_id,
                        "employee_id": b.employee_id,
                        "employee_name": b.employee_name,
                        "facility_id": b.facility_id,
                        "sport": b.sport,
                        "court_name": b.court_name,
                        "slot_time": b.slot_time,
                        "status": b.status,
                        "additional_players": json.loads(b.additional_players) if b.additional_players else []
                    }
            finally:
                db.close()

        if not booking:
            return {"success": False, "error": "Booking not found."}

        previous_status = booking["status"]
        if USE_SUPABASE:
            supabase_client.table("bookings").update({"status": status}).eq("booking_id", booking_id).execute()
        else:
            db = SessionLocal()
            try:
                b = db.query(DBBooking).filter_by(booking_id=booking_id).first()
                b.status = status
                db.commit()
            finally:
                db.close()

        # Build list of all players to notify
        all_players = [{
            "employeeId": booking["employee_id"],
            "name": booking["employee_name"]
        }]
        for ap in booking.get("additional_players") or []:
            all_players.append({
                "employeeId": ap["employeeId"],
                "name": ap["name"]
            })

        # Handle check-in and no-show alerts for all players
        if status == "checked_in":
            for p_user in all_players:
                self.add_notification({
                    "employeeId": p_user["employeeId"],
                    "title": "Attendance Verified ✅",
                    "message": f"Enjoy your game of {booking['sport']}! Your entry has been verified at check gate by Security {verified_by}.",
                    "type": "success"
                })
        elif status == "no_show":
            for p_user in all_players:
                self.add_notification({
                    "employeeId": p_user["employeeId"],
                    "title": "Marked as No-Show ⚠️",
                    "message": f"You were marked as a no-show for {booking['sport']} ({booking['court_name']}) at {booking['slot_time']}.",
                    "type": "error"
                })
        elif status == "cancelled" and previous_status != "cancelled":
            for p_user in all_players:
                self.add_notification({
                    "employeeId": p_user["employeeId"],
                    "title": "Booking Cancelled 🔴",
                    "message": f"Your booking for {booking['sport']} ({booking['court_name']}) at {booking['slot_time']} was cancelled.",
                    "type": "warning"
                })
            self.process_waitlist_promotion(booking["facility_id"], booking["slot_time"])

        return {"success": True}

    # --- WAITLIST ---
    def get_waitlist(self) -> List[Dict[str, Any]]:
        if USE_SUPABASE:
            res = supabase_client.table("waitlist").select("*").execute()
            data = res.data or []
            return [
                {
                    "waitlistId": w["waitlist_id"], "employeeId": w["employee_id"], "employeeName": w["employee_name"],
                    "facilityId": w["facility_id"], "sport": w["sport"], "courtName": w["court_name"],
                    "slotTime": w["slot_time"], "createdAt": w["created_at"]
                }
                for w in data
            ]
        else:
            db = SessionLocal()
            try:
                wlist = db.query(DBWaitlist).all()
                return [
                    {
                        "waitlistId": w.waitlist_id, "employeeId": w.employee_id, "employeeName": w.employee_name,
                        "facilityId": w.facility_id, "sport": w.sport, "courtName": w.court_name,
                        "slotTime": w.slot_time, "createdAt": w.created_at
                    }
                    for w in wlist
                ]
            finally:
                db.close()

    def join_waitlist(self, employee_id: str, facility_id: str, slot_time: str) -> Dict[str, Any]:
        employee = self.get_user_by_employee_id(employee_id)
        if not employee:
            return {"success": False, "error": "Employee ID not found."}

        facilities = self.get_facilities()
        facility = next((f for f in facilities if f["facilityId"] == facility_id), None)
        if not facility:
            return {"success": False, "error": "Facility not found."}

        # Check if already waitlisted for this facility and slot
        waitlist = self.get_waitlist()
        already = next((w for w in waitlist if w["employeeId"] == employee_id.upper() and w["facilityId"] == facility_id and w["slotTime"] == slot_time), None)
        if already:
            return {"success": False, "error": "You are already on the waitlist for this slot."}

        # Check if they have a confirmed booking at that exact slot
        bookings = self.get_bookings()
        has_slot = next((b for b in bookings if b["employeeId"] == employee_id.upper() and b["slotTime"] == slot_time and b["status"] != "cancelled"), None)
        if has_slot:
            return {"success": False, "error": "You already have a confirmed booking at this time slot."}

        waitlist_id = f"w_{int(datetime.datetime.now().timestamp() * 1000)}"
        new_entry = {
            "waitlist_id": waitlist_id,
            "employee_id": employee_id.upper(),
            "employee_name": employee["name"],
            "facility_id": facility_id,
            "sport": facility["sport"],
            "court_name": facility["courtName"],
            "slot_time": slot_time,
            "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
        }

        if USE_SUPABASE:
            supabase_client.table("waitlist").insert(new_entry).execute()
        else:
            db = SessionLocal()
            try:
                w = DBWaitlist(
                    waitlist_id=waitlist_id,
                    employee_id=employee_id.upper(),
                    employee_name=employee["name"],
                    facility_id=facility_id,
                    sport=facility["sport"],
                    court_name=facility["courtName"],
                    slot_time=slot_time
                )
                db.add(w)
                db.commit()
            finally:
                db.close()

        self.add_notification({
            "employeeId": employee_id.upper(),
            "title": "Joined Waitlist ⏳",
            "message": f"You have successfully joined the waitlist for {facility['sport']} ({facility['courtName']}) at {slot_time}.",
            "type": "info"
        })

        return {
            "success": True, 
            "entry": {
                "waitlistId": waitlist_id, "employeeId": employee_id.upper(), "employeeName": employee["name"],
                "facilityId": facility_id, "sport": facility["sport"], "courtName": facility["courtName"],
                "slotTime": slot_time
            }
        }

    def leave_waitlist(self, waitlist_id: str) -> Dict[str, Any]:
        # Fetch waitlist item
        waitlist_item = None
        if USE_SUPABASE:
            res = supabase_client.table("waitlist").select("*").eq("waitlist_id", waitlist_id).execute()
            if res.data: waitlist_item = res.data[0]
        else:
            db = SessionLocal()
            try:
                w = db.query(DBWaitlist).filter_by(waitlist_id=waitlist_id).first()
                if w:
                    waitlist_item = {
                        "waitlist_id": w.waitlist_id, "employee_id": w.employee_id, "sport": w.sport,
                        "court_name": w.court_name, "slot_time": w.slot_time
                    }
            finally:
                db.close()

        if not waitlist_item:
            return {"success": False, "error": "Waitlist entry not found."}

        # Delete
        if USE_SUPABASE:
            supabase_client.table("waitlist").delete().eq("waitlist_id", waitlist_id).execute()
        else:
            db = SessionLocal()
            try:
                w = db.query(DBWaitlist).filter_by(waitlist_id=waitlist_id).first()
                db.delete(w)
                db.commit()
            finally:
                db.close()

        self.add_notification({
            "employeeId": waitlist_item["employee_id"],
            "title": "Left Waitlist 🔴",
            "message": f"You have left the waitlist for {waitlist_item['sport']} ({waitlist_item['court_name']}) at {waitlist_item['slot_time']}.",
            "type": "warning"
        })

        return {"success": True}

    def process_waitlist_promotion(self, facility_id: str, slot_time: str):
        # Fetch first waitlist entry for this slot
        entry = None
        if USE_SUPABASE:
            res = supabase_client.table("waitlist").select("*").eq("facility_id", facility_id).eq("slot_time", slot_time).order("created_at").limit(1).execute()
            if res.data and len(res.data) > 0: entry = res.data[0]
        else:
            db = SessionLocal()
            try:
                w = db.query(DBWaitlist).filter_by(facility_id=facility_id, slot_time=slot_time).order_by(DBWaitlist.created_at).first()
                if w:
                    entry = {
                        "waitlist_id": w.waitlist_id, "employee_id": w.employee_id, "employee_name": w.employee_name,
                        "facility_id": w.facility_id, "sport": w.sport, "court_name": w.court_name, "slot_time": w.slot_time
                    }
            finally:
                db.close()

        if not entry: return

        # Remove from waitlist
        if USE_SUPABASE:
            supabase_client.table("waitlist").delete().eq("waitlist_id", entry["waitlist_id"]).execute()
        else:
            db = SessionLocal()
            try:
                w = db.query(DBWaitlist).filter_by(waitlist_id=entry["waitlist_id"]).first()
                db.delete(w)
                db.commit()
            finally:
                db.close()

        # Create Booking
        booking_id = f"b_{int(datetime.datetime.now().timestamp() * 1000)}"
        new_booking = {
            "booking_id": booking_id,
            "employee_id": entry["employee_id"],
            "employee_name": entry["employee_name"],
            "facility_id": entry["facility_id"],
            "sport": entry["sport"],
            "court_name": entry["court_name"],
            "slot_time": entry["slot_time"],
            "booking_source": "online",
            "status": "confirmed",
            "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
        }

        if USE_SUPABASE:
            supabase_client.table("bookings").insert(new_booking).execute()
        else:
            db = SessionLocal()
            try:
                b = DBBooking(
                    booking_id=booking_id,
                    employee_id=entry["employee_id"],
                    employee_name=entry["employee_name"],
                    facility_id=entry["facility_id"],
                    sport=entry["sport"],
                    court_name=entry["court_name"],
                    slot_time=entry["slot_time"],
                    booking_source="online",
                    status="confirmed"
                )
                db.add(b)
                db.commit()
            finally:
                db.close()

        # Notify
        self.add_notification({
            "employeeId": entry["employee_id"],
            "title": "Waitlist Promoted 🎉",
            "message": f"Your waitlist request for {entry['sport']} ({entry['court_name']}) at {entry['slot_time']} has been promoted to a Confirmed Booking!",
            "type": "success"
        })

        # Send SMTP Promo Email
        u = self.get_user_by_employee_id(entry["employee_id"])
        email_to = u["email"] if u else f"{entry['employee_id'].lower()}@tcs.com"
        email_subject = f"TCS PlaySmart - Waitlist Promoted to Confirmed Booking [{booking_id}] 🎉"
        email_body = f"Dear {entry['employee_name']},\n\nGood news! Your waitlist request for {entry['sport']} ({entry['court_name']}) at {entry['slot_time']} has been promoted to a Confirmed Booking because a reservation was cancelled!\n\nBooking Details:\n- Booking ID: {booking_id}\n- Sport Category: {entry['sport']}\n- Court / Board: {entry['court_name']}\n- Reserved Time Slot: {entry['slot_time']}\n- Booking Channel: Waitlist Auto-Promotion\n\nPlease present your simulated QR Gate Pass at the court check-in checkpoint.\n\nEnjoy your active session!\n\nBest Regards,\nTCS PlaySmart Admin Team"
        self.send_simulated_email(email_to, email_subject, email_body)

    # --- NOTIFICATIONS ---
    def get_notifications(self, employee_id: str) -> List[Dict[str, Any]]:
        if USE_SUPABASE:
            res = supabase_client.table("notifications").select("*").eq("employee_id", employee_id.upper()).order("created_at", desc=True).execute()
            data = res.data or []
            return [
                {
                    "id": n["id"], "employeeId": n["employee_id"], "title": n["title"],
                    "message": n["message"], "type": n["type"], "read": n["read"],
                    "createdAt": n["created_at"]
                }
                for n in data
            ]
        else:
            db = SessionLocal()
            try:
                notifs = db.query(DBNotification).filter_by(employee_id=employee_id.upper()).order_by(DBNotification.created_at.desc()).all()
                return [
                    {
                        "id": n.id, "employeeId": n.employee_id, "title": n.title,
                        "message": n.message, "type": n.type, "read": n.read,
                        "createdAt": n.created_at
                    }
                    for n in notifs
                ]
            finally:
                db.close()

    def add_notification(self, notif_data: Dict[str, Any]):
        notif_id = f"notif_{int(datetime.datetime.now().timestamp() * 1000)}"
        new_notif = {
            "id": notif_id,
            "employee_id": notif_data["employeeId"].upper(),
            "title": notif_data["title"],
            "message": notif_data["message"],
            "type": notif_data.get("type", "info"),
            "read": False,
            "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
        }

        if USE_SUPABASE:
            supabase_client.table("notifications").insert(new_notif).execute()
        else:
            db = SessionLocal()
            try:
                n = DBNotification(
                    id=notif_id,
                    employee_id=notif_data["employeeId"].upper(),
                    title=notif_data["title"],
                    message=notif_data["message"],
                    type=notif_data.get("type", "info")
                )
                db.add(n)
                db.commit()
            finally:
                db.close()

    def mark_notification_read(self, id: str) -> bool:
        if USE_SUPABASE:
            supabase_client.table("notifications").update({"read": True}).eq("id", id).execute()
            return True
        else:
            db = SessionLocal()
            try:
                n = db.query(DBNotification).filter_by(id=id).first()
                if n:
                    n.read = True
                    db.commit()
                    return True
                return False
            finally:
                db.close()

    # --- SIMULATED EMAILS ---
    def get_simulated_emails(self) -> List[Dict[str, Any]]:
        if USE_SUPABASE:
            res = supabase_client.table("simulated_emails").select("*").execute()
            emails = res.data or []
            return [
                {
                    "id": e["id"], "to": e["to_email"], "subject": e["subject"],
                    "body": e["body"], "sentAt": e["sent_at"]
                }
                for e in emails
            ]
        else:
            db = SessionLocal()
            try:
                emails = db.query(DBSimulatedEmail).all()
                return [
                    {
                        "id": e.id, "to": e.to_email, "subject": e.subject,
                        "body": e.body, "sentAt": e.sent_at
                    }
                    for e in emails
                ]
            finally:
                db.close()

    def send_simulated_email(self, to: str, subject: str, body: str):
        """
        Store email in database AND optionally send real email via SMTP
        """
        email_id = f"email_{int(datetime.datetime.now().timestamp() * 1000)}"
        new_email = {
            "id": email_id,
            "to_email": to,
            "subject": subject,
            "body": body,
            "sent_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
        }

        # Store in database (simulated outbox)
        if USE_SUPABASE:
            supabase_client.table("simulated_emails").insert(new_email).execute()
        else:
            db = SessionLocal()
            try:
                e = DBSimulatedEmail(
                    id=email_id,
                    to_email=to,
                    subject=subject,
                    body=body
                )
                db.add(e)
                db.commit()
            finally:
                db.close()
        
        # Send real email via SMTP (if configured)
        if EMAIL_SERVICE_AVAILABLE:
            try:
                result = send_email(to, subject, body)
                if result.get("success"):
                    print(f"[SUCCESS] Real email sent to {to}")
                else:
                    print(f"[ERROR] Failed to send real email: {result.get('error')}")
            except Exception as e:
                print(f"[ERROR] Email service error: {e}")

    def clear_simulated_emails(self) -> bool:
        if USE_SUPABASE:
            supabase_client.table("simulated_emails").delete().neq("id", "dummy").execute()
            return True
        else:
            db = SessionLocal()
            try:
                db.query(DBSimulatedEmail).delete()
                db.commit()
                return True
            finally:
                db.close()

    def forgot_password(self, employee_id: str) -> Dict[str, Any]:
        emp_id = employee_id.strip().upper()
        
        # 1. Fetch user by employee_id
        if USE_SUPABASE:
            res = supabase_client.table("users").select("*").eq("employee_id", emp_id).execute()
            if not res.data or len(res.data) == 0:
                return {"success": False, "error": f"No registered account matches Employee ID {emp_id}."}
            user = res.data[0]
        else:
            db = SessionLocal()
            try:
                u = db.query(DBUser).filter_by(employee_id=emp_id).first()
                if not u:
                    return {"success": False, "error": f"No registered account matches Employee ID {emp_id}."}
                user = {
                    "id": u.id, "employee_id": u.employee_id, "name": u.name, "email": u.email,
                    "phone_number": u.phone_number, "department": u.department, 
                    "business_unit": u.business_unit, "role": u.role, "password": u.password
                }
            finally:
                db.close()
                
        # 2. Reset password to default 'password'
        temp_pwd = "password"
        
        # 3. Update database
        if USE_SUPABASE:
            supabase_client.table("users").update({"password": temp_pwd}).eq("employee_id", emp_id).execute()
        else:
            db = SessionLocal()
            try:
                u = db.query(DBUser).filter_by(employee_id=emp_id).first()
                if u:
                    u.password = temp_pwd
                    db.commit()
            finally:
                db.close()
                
        # 4. Trigger simulated email
        email_to = user["email"]
        email_subject = "TCS PlaySmart - Password Recovery request 🔑"
        email_body = f"Dear {user['name']},\n\nWe received a request to recover your password for the TCS PlaySmart sports reservation system.\n\nYour password has been reset to the default developer bypass password:\n- Temporary Password: password\n\nPlease log in and update your profile password as soon as possible.\n\nBest Regards,\nTCS PlaySmart Admin Team"
        self.send_simulated_email(email_to, email_subject, email_body)
        
        # Dispatch local event so header outbox registers it immediately
        return {"success": True, "message": f"Password reset email sent to {email_to}."}

# Singleton DB Manager instance
db_mgr = DatabaseManager()
