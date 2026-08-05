# TCS PlaySmart — Complete EC2 Deployment Guide

Single end-to-end guide to deploy this app on one AWS EC2 instance.

**Repo:** https://github.com/raga952003-cmyk/court.git  
**Stack:** React (Vite) frontend + FastAPI backend + Supabase (cloud database)  
**Example Public IP used in this guide:** `54.81.243.16` (replace with yours)

---

## Architecture

```
Browser  →  EC2 Nginx :80  →  /home/ubuntu/court/frontend/dist  (static UI)
                 └─ /api/* →  FastAPI (uvicorn) :8000

Browser  →  Supabase Cloud (main database for the UI)
Backend  →  Supabase Cloud (service role key)
```

Database is **not** installed on EC2. Supabase is the database.

---

## Prerequisites

- AWS account
- EC2 key pair (`.pem` file)
- Supabase project
- GitHub repo access: `https://github.com/raga952003-cmyk/court.git`
- From Supabase → **Project Settings → API**:
  - Project URL
  - `anon` `public` key (frontend)
  - `service_role` key (backend only — never put in frontend)

---

## Step 1 — Prepare Supabase (database)

1. Open Supabase SQL Editor.
2. Paste and run the full contents of `supabase_schema.sql` from the repo.
3. Confirm tables exist: `users`, `facilities`, `bookings`, `waitlist`, `notifications`, `simulated_emails`, `simulated_time`, `system_settings`.

Optional (real emails on book/cancel): set in `system_settings`:
- `brevo_api_key`
- `brevo_sender_email`

---

## Step 2 — Launch EC2

1. AWS Console → **EC2 → Launch instance**
2. Settings:
   - **Name:** `playsmart-server`
   - **AMI:** Ubuntu (22.04 or newer)
   - **Instance type:** `t2.medium` (or `t2.small` minimum)
   - **Key pair:** create/download `.pem`
   - **Storage:** 20–30 GB
3. **Security Group inbound rules:**

| Type        | Port | Source                         | Purpose        |
|-------------|------|--------------------------------|----------------|
| SSH         | 22   | My IP                          | SSH login      |
| HTTP        | 80   | 0.0.0.0/0                      | Website        |
| HTTPS       | 443  | 0.0.0.0/0                      | Optional       |
| Custom TCP  | 8000 | 0.0.0.0/0 (optional)           | Direct API     |

4. Launch → copy **Public IPv4** (example: `54.81.243.16`).

---

## Step 3 — SSH into the instance

From your PC (Git Bash / WSL / PowerShell with OpenSSH):

```bash
chmod 400 your-key.pem
ssh -i "your-key.pem" ubuntu@54.81.243.16
```

Replace IP and key file name with yours.

---

## Step 4 — Install system packages

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git nginx python3-pip

# Python venv support (version may match your Ubuntu Python, e.g. 3.14)
sudo apt install -y python3-venv
# If that fails, use the exact package from the error, e.g.:
# sudo apt install -y python3.14-venv

# Node.js 20 (REQUIRED — Tailwind/Vite need Node >= 20)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify
python3 --version
node -v    # must be v20.x.x
npm -v
```

---

## Step 5 — Clone the repository

```bash
cd ~
git clone https://github.com/raga952003-cmyk/court.git
cd ~/court
```

---

## Step 6 — Environment files

### 6.1 Backend — `~/court/backend/.env`

```bash
nano ~/court/backend/.env
```

```env
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_KEY=YOUR_SERVICE_ROLE_KEY

ENABLE_REAL_EMAILS=false
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM_EMAIL=
SMTP_FROM_NAME=TCS PlaySmart
```

Save: `Ctrl+O`, Enter, `Ctrl+X`.

### 6.2 Frontend — `~/court/frontend/.env` (must exist BEFORE build)

```bash
nano ~/court/frontend/.env
```

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_PUBLIC_KEY
VITE_GROQ_API_KEY=YOUR_GROQ_KEY
```

Vite bakes `VITE_*` values into the build. If you change them later, run `npm run build` again.

---

## Step 7 — Deploy backend (FastAPI + systemd)

```bash
cd ~/court/backend
rm -rf venv
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# Quick test
uvicorn main:app --host 0.0.0.0 --port 8000
# You should see: Uvicorn running on http://0.0.0.0:8000
# Press Ctrl+C to stop
deactivate
```

Create systemd service (keeps backend running after logout):

```bash
sudo tee /etc/systemd/system/playsmart-backend.service > /dev/null << 'EOF'
[Unit]
Description=TCS PlaySmart Backend
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/court/backend
Environment="PATH=/home/ubuntu/court/backend/venv/bin"
ExecStart=/home/ubuntu/court/backend/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable playsmart-backend
sudo systemctl restart playsmart-backend
sleep 2
sudo systemctl status playsmart-backend --no-pager
curl http://localhost:8000/
```

Expected curl response:

```json
{"status":"online","message":"TCS PlaySmart API Server running successfully."}
```

If curl fails, wait 2 seconds and retry, or check logs:

```bash
sudo journalctl -u playsmart-backend -n 50 --no-pager
```

---

## Step 8 — Build frontend (production)

```bash
cd ~/court/frontend
rm -rf node_modules package-lock.json dist
npm install
npm install react-is
npm run build
ls dist
```

Expected: `assets  index.html  tcs_logo.png`

### If build fails with Tailwind “Cannot find native binding”

Cause: Node is still 18. Upgrade to Node 20 (Step 4), then clean reinstall and rebuild.

```bash
node -v   # must be v20+
cd ~/court/frontend
rm -rf node_modules package-lock.json dist
npm install
npm run build
```

---

## Step 9 — Host with Nginx

```bash
sudo apt install -y nginx

# IMPORTANT: allow nginx to read files under /home/ubuntu
sudo chmod 755 /home/ubuntu
sudo chmod -R 755 /home/ubuntu/court/frontend/dist

# Replace 54.81.243.16 with YOUR public IP
sudo tee /etc/nginx/sites-available/playsmart > /dev/null << 'EOF'
server {
    listen 80;
    server_name 54.81.243.16 _;

    root /home/ubuntu/court/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location ~ ^/(docs|redoc|openapi.json)$ {
        proxy_pass http://127.0.0.1:8000$request_uri;
        proxy_set_header Host $host;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/playsmart /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
sudo systemctl enable nginx
sudo systemctl restart playsmart-backend

curl -I http://localhost/
curl http://localhost:8000/
```

Expected:
- `curl -I http://localhost/` → `HTTP/1.1 200`
- `curl http://localhost:8000/` → JSON `"status":"online"`

If Nginx returns **500**, almost always permissions:

```bash
sudo chmod 755 /home/ubuntu
sudo chmod -R 755 /home/ubuntu/court/frontend/dist
sudo tail -20 /var/log/nginx/error.log
sudo systemctl restart nginx
```

---

## Step 10 — Open the application

| Service     | URL                                      |
|-------------|------------------------------------------|
| Frontend    | http://54.81.243.16                      |
| Backend API | http://54.81.243.16:8000                 |
| API Docs    | http://54.81.243.16:8000/docs            |

First visit → **First Time Admin Setup** → register with `@tcs.com` or `@gmail.com` email.

### Corporate / office network note

Some office proxies block public EC2 IPs. If it works on **mobile hotspot** but not office Wi‑Fi, ask IT to allow `YOUR_PUBLIC_IP` on ports 80/443, or use hotspot/home network.

---

## Useful commands

```bash
# Status
sudo systemctl status playsmart-backend
sudo systemctl status nginx

# Restart
sudo systemctl restart playsmart-backend
sudo systemctl restart nginx

# Logs
sudo journalctl -u playsmart-backend -f
sudo tail -f /var/log/nginx/error.log
```

---

## Update app after code changes

```bash
cd ~/court
git pull

# Backend
cd ~/court/backend
source venv/bin/activate
pip install -r requirements.txt
deactivate
sudo systemctl restart playsmart-backend

# Frontend (re-apply .env if needed, then rebuild)
cd ~/court/frontend
# ensure .env still has VITE_* keys
npm install
npm run build
sudo chmod -R 755 /home/ubuntu/court/frontend/dist
sudo systemctl reload nginx
```

---

## Troubleshooting checklist

| Problem | Fix |
|---------|-----|
| `ensurepip is not available` | `sudo apt install -y python3-venv` or `python3.XX-venv` |
| Backend curl fails immediately after start | `sleep 2` then curl again; check `journalctl -u playsmart-backend` |
| Tailwind native binding / build fail | Upgrade to **Node 20**, delete `node_modules` + lockfile, reinstall, rebuild |
| Nginx `500` on localhost | `chmod 755 /home/ubuntu` and `chmod -R 755 .../dist` |
| Site works on phone, not office | Corporate proxy blocking — use hotspot or ask IT |
| Blank page / no data | Check `frontend/.env` keys, rebuild, confirm Supabase schema applied |
| Emails only in Outbox, not inbox | Configure Brevo keys in Supabase `system_settings` |

---

## Booking invites + hardening (run once on Supabase)

In Supabase SQL Editor, run in order:

1. [`supabase_booking_invites.sql`](supabase_booking_invites.sql) — invite table  
2. [`supabase_hardening.sql`](supabase_hardening.sql) — capacity includes pending invites, `expire_stale_booking_invites()`, atomic `accept_booking_invite` RPC  
3. [`supabase_support_tickets.sql`](supabase_support_tickets.sql) — concern tickets + `it` user role  
4. [`supabase_users_avatar.sql`](supabase_users_avatar.sql) — optional avatar column  
5. [`supabase_facility_locations.sql`](supabase_facility_locations.sql) — location-scoped courts (admin add/remove per site)  
6. [`supabase_location_capacities.sql`](supabase_location_capacities.sql) — per-court player capacity column  
7. [`supabase_anon_grants.sql`](supabase_anon_grants.sql) — GRANT + disable RLS (fixes browser **401 Unauthorized** on REST)

Optional cron (Database → Extensions → enable `pg_cron`):

```sql
SELECT cron.schedule('expire-booking-invites', '* * * * *', $$SELECT expire_stale_booking_invites();$$);
```

### Backend `.env` extras (on EC2)

```env
GROQ_API_KEY=your_groq_key
ENABLE_REAL_EMAILS=true   # optional real SMTP for invites/password reset
CORS_ORIGINS=http://YOUR_PUBLIC_IP
```

Restart after editing:

```bash
sudo systemctl restart playsmart-backend
```

### Frontend `.env` (build time)

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_public_key
VITE_SHOW_SIMULATED_TIME=false
VITE_API_BASE_URL=
```

Do **not** put the service_role key in any `VITE_*` variable.

### Security group / HTTPS notes

- Prefer **only port 80/443** public; keep **8000 closed** and use Nginx `/api` proxy.
- For HTTPS later: attach a domain + Certbot (`sudo apt install certbot python3-certbot-nginx`).

---

## Final checklist

- [ ] Supabase schema applied
- [ ] EC2 running, Security Group: 22 (My IP), 80 (0.0.0.0/0)
- [ ] Repo cloned to `~/court`
- [ ] `backend/.env` has service role key
- [ ] `frontend/.env` has anon key **before** build
- [ ] Node **v20+** installed
- [ ] `playsmart-backend` active and `curl localhost:8000` OK
- [ ] `npm run build` created `frontend/dist`
- [ ] Nginx configured, permissions fixed, `curl -I localhost` → 200
- [ ] Browser opens `http://YOUR_PUBLIC_IP`

---

**Estimated time:** 30–45 minutes  
**Path used on server:** `/home/ubuntu/court`
