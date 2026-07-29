# TCS PlaySmart - Smart Sports Facility Management System

A comprehensive sports facility booking and management system for TCS Chennai campus. Built with React (Frontend) and FastAPI (Backend), with Supabase PostgreSQL database.

## 🚀 Features

- **Employee Portal**: Book sports facilities, view availability, manage bookings
- **Security Portal**: Check-in verification, walk-in booking assistance
- **Admin Dashboard**: Facility management, maintenance control, analytics
- **Real-time Notifications**: In-app alerts and email notifications
- **Waitlist System**: Automatic promotion when slots become available
- **Simulated Time Control**: Test time-based business rules
- **QR Code Gate Pass**: Digital check-in system

## 📋 Prerequisites

- **Node.js** 18+ (for frontend)
- **Python** 3.11+ (for backend)
- **Docker & Docker Compose** (optional, for containerized setup)
- **Supabase Account** (for cloud database) or use SQLite fallback

## 🛠️ Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/raga29429-blip/sports.git
cd sports
```

### 2. Setup Supabase Database

**Option A: Use Supabase (Recommended for Production)**

1. Get your **SERVICE ROLE KEY** from [Supabase Dashboard](https://supabase.com/dashboard/project/kmcecytuzizhiokvwnlq/settings/api)
   - ⚠️ **Important**: Use `service_role` key (starts with `eyJ...`), NOT the publishable key
   
2. Create `.env` file in the root directory:
```env
SUPABASE_URL=https://kmcecytuzizhiokvwnlq.supabase.co
SUPABASE_KEY=your_service_role_key_here
```

3. Run the database schema:
   - Go to Supabase Dashboard → SQL Editor
   - Copy and run the contents of `supabase_schema.sql`

**Option B: Use SQLite Fallback (Development)**

Simply leave the `.env` file empty or don't create it. The app will automatically use SQLite.

📖 **Detailed Supabase Setup**: See [SUPABASE_SETUP.md](SUPABASE_SETUP.md)

### 3. Install Dependencies

**Backend:**
```bash
cd backend
pip install -r requirements.txt
```

**Frontend:**
```bash
cd frontend
npm install
```

### 4. Test Supabase Connection (Optional)

```bash
python test_supabase_connection.py
```

### 5. Run the Application

**Option A: Using Docker Compose (Recommended)**

```bash
docker-compose up --build
```

- Backend API: http://localhost:8000
- Frontend: http://localhost:3000

**Option B: Run Manually**

Terminal 1 (Backend):
```bash
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Terminal 2 (Frontend):
```bash
cd frontend
npm run dev
```

## 🏗️ Project Structure

```
sports/
├── backend/
│   ├── main.py              # FastAPI application & routes
│   ├── database.py          # Database manager (Supabase/SQLite)
│   ├── requirements.txt     # Python dependencies
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/      # React components
│   │   ├── lib/database.ts  # API client
│   │   ├── types.ts         # TypeScript types
│   │   └── App.tsx          # Main app component
│   ├── package.json
│   └── Dockerfile
├── supabase_schema.sql      # Database schema
├── docker-compose.yml       # Container orchestration
├── .env.example             # Environment template
└── README.md
```

## 🔐 Security Notes

⚠️ **CRITICAL**: Your backend is currently using a publishable key. Update to service role key:

1. Go to [Supabase API Settings](https://supabase.com/dashboard/project/kmcecytuzizhiokvwnlq/settings/api)
2. Copy the **service_role** key (NOT anon/publishable)
3. Update `.env` with the service role key

**Current Issues to Fix:**
- [ ] Replace publishable key with service role key in backend
- [ ] Add password hashing (currently plain text)
- [ ] Update CORS settings (currently allows all origins)
- [ ] Use environment variables for API URLs

## 🧪 Testing

### Backend API Endpoints

```bash
# Health check
curl http://localhost:8000/

# Get facilities
curl http://localhost:8000/api/facilities

# Get simulated time
curl http://localhost:8000/api/time
```

### Admin Setup

1. Open http://localhost:3000
2. Click "First Time Admin Setup"
3. Register with role "admin"
4. Login with your admin credentials

## 📊 Database Schema

The application uses the following tables:
- `users` - User accounts (employees, security, admins)
- `facilities` - Sports facilities and courts
- `bookings` - Slot reservations
- `waitlist` - Waiting queue for full slots
- `notifications` - In-app notifications
- `simulated_emails` - Email outbox for testing
- `simulated_time` - Time simulation for testing

## 🐳 Docker Deployment

```bash
# Build and start
docker-compose up --build -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Clean up volumes
docker-compose down -v
```

## 🔧 Development

### Backend Development

```bash
cd backend
uvicorn main:app --reload --port 8000
```

API docs available at: http://localhost:8000/docs

### Frontend Development

```bash
cd frontend
npm run dev
```

TypeScript type checking:
```bash
npm run lint
```

## 📝 Environment Variables

See `.env.example` for the template. Required variables:

- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_KEY` - Service role key (backend) or anon key (frontend)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📄 License

This project is part of TCS internal development.

## 🆘 Troubleshooting

### Backend won't start
- Check if Python dependencies are installed: `pip install -r backend/requirements.txt`
- Verify `.env` file has correct Supabase credentials
- Test connection: `python test_supabase_connection.py`

### Frontend won't connect to backend
- Ensure backend is running on port 8000
- Check CORS settings in `backend/main.py`
- Verify API_BASE_URL in `frontend/src/lib/database.ts`

### Database connection issues
- Verify you're using SERVICE ROLE key, not publishable key
- Check Supabase project is active
- Run database schema if tables don't exist

See [SUPABASE_SETUP.md](SUPABASE_SETUP.md) for detailed troubleshooting.

## 📞 Support

For issues and questions:
- Check [SUPABASE_SETUP.md](SUPABASE_SETUP.md) for setup help
- Review error logs: `docker-compose logs`
- Test connection: `python test_supabase_connection.py`
