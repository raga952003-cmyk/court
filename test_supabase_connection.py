#!/usr/bin/env python3
"""
Test Supabase Connection Script
Tests if your Supabase credentials are working correctly
"""

import os
import sys
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

print("=" * 60)
print("TCS PlaySmart - Supabase Connection Test")
print("=" * 60)

# Check if credentials are set
if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ ERROR: SUPABASE_URL or SUPABASE_KEY not found in .env")
    print("\nPlease update your .env file with:")
    print("  SUPABASE_URL=https://kmcecytuzizhiokvwnlq.supabase.co")
    print("  SUPABASE_KEY=<your_service_role_key>")
    sys.exit(1)

print(f"\n✓ Environment variables loaded")
print(f"  SUPABASE_URL: {SUPABASE_URL}")
print(f"  SUPABASE_KEY: {SUPABASE_KEY[:20]}... (truncated)")

# Check key type
if SUPABASE_KEY.startswith("sb_publishable_"):
    print("\n⚠️  WARNING: You're using a PUBLISHABLE KEY!")
    print("  This key is meant for frontend/client-side use only.")
    print("  For backend operations, use the SERVICE ROLE KEY.")
    print("\n  Get it from: Supabase Dashboard → Settings → API → service_role key")
    print("\n  Continuing anyway (limited functionality expected)...")
elif SUPABASE_KEY.startswith("eyJ"):
    print("\n✓ Using SERVICE ROLE KEY (correct for backend)")
else:
    print("\n❓ Unknown key type")

# Try to connect
print("\n" + "-" * 60)
print("Testing Supabase Connection...")
print("-" * 60)

try:
    from supabase import create_client, Client
    
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    print("✓ Supabase client created successfully")
    
    # Test basic query
    print("\nTesting database query (facilities table)...")
    result = supabase.table("facilities").select("*").limit(1).execute()
    
    if result.data:
        print(f"✓ Query successful! Found {len(result.data)} facility record(s)")
        print(f"  Sample: {result.data[0]}")
    else:
        print("⚠️  Query successful but no data found")
        print("  This might mean the database tables are not set up yet.")
        print("  Run the SQL schema from supabase_schema.sql in your Supabase SQL Editor")
    
    print("\n" + "=" * 60)
    print("✅ CONNECTION TEST PASSED!")
    print("=" * 60)
    print("\nYour Supabase setup is working correctly.")
    print("You can now start the backend with: uvicorn backend.main:app --reload")
    
except ImportError:
    print("❌ ERROR: 'supabase' package not installed")
    print("\nInstall it with:")
    print("  pip install supabase")
    sys.exit(1)
    
except Exception as e:
    print(f"❌ ERROR: Connection failed")
    print(f"  {type(e).__name__}: {e}")
    print("\nPossible issues:")
    print("  1. Invalid SUPABASE_KEY (should be service_role key)")
    print("  2. SUPABASE_URL is incorrect")
    print("  3. Internet connection issues")
    print("  4. Database tables not created yet")
    print("\nCheck SUPABASE_SETUP.md for detailed instructions")
    sys.exit(1)
