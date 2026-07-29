/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ShieldCheck, Trophy, Sparkles, MapPin, Phone, Mail, ChevronRight, Activity, Calendar, Zap } from 'lucide-react';
import { db } from '../lib/database';

interface LandingPageProps {
  onNavigate: (page: 'login' | 'register') => void;
  onOpenAdminSetup?: () => void;
}

export default function LandingPage({ onNavigate, onOpenAdminSetup }: LandingPageProps) {
  const [facilities, setFacilities] = React.useState<any[]>([]);
  const [hasAdmin, setHasAdmin] = React.useState<boolean>(true);

  React.useEffect(() => {
    db.getFacilities().then(res => setFacilities(res)).catch(console.error);
    db.hasAdmin().then(res => setHasAdmin(res)).catch(() => setHasAdmin(true));
  }, []);
  
  // Count counts per sport type
  const sportSummary = facilities.reduce((acc, current) => {
    acc[current.sport] = (acc[current.sport] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const sportIcons: Record<string, string> = {
    'Badminton': '🏸',
    'Basketball': '🏀',
    'Volleyball': '🏐',
    'Table Tennis': '🏓',
    'Carrom': '🎯',
    'Box Cricket': '🏏',
  };

  return (
    <div id="landing_page" className="min-h-screen flex flex-col bg-[#F8FAFC] text-slate-800 font-sans">
      {/* Navigation */}
      <header className="bg-[#003366] text-white sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/tcs_logo.png" className="h-8 object-contain" alt="TCS Logo" />
            <span className="text-xl font-bold tracking-tight font-display">PlaySmart</span>
            <span className="ml-2 px-2 py-0.5 bg-white/10 rounded text-[10px] font-semibold uppercase tracking-wider border border-white/20">Campus Hub</span>
          </div>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-blue-100">
            <a href="#about" className="hover:text-white transition-colors">About</a>
            <a href="#facilities" className="hover:text-white transition-colors">Facilities</a>
            <a href="#contact" className="hover:text-white transition-colors">Contact</a>
          </nav>

          <div className="flex items-center gap-3">
            <button
              id="landing_login_btn"
              onClick={() => onNavigate('login')}
              className="px-4 py-2 text-sm font-semibold text-white hover:text-blue-100 hover:bg-white/10 rounded-lg transition-all cursor-pointer"
            >
              Login
            </button>
            <button
              id="landing_register_btn"
              onClick={() => onNavigate('register')}
              className="px-4 py-2 text-sm font-semibold text-[#003366] bg-white hover:bg-blue-50 rounded-lg shadow-sm transition-all cursor-pointer"
            >
              Register
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-gradient-to-b from-blue-50 via-white to-slate-50 py-16 md:py-24 border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-1.5 bg-blue-100/60 text-blue-800 px-3 py-1 rounded-full text-xs font-semibold mb-6 border border-blue-200/50">
            <Sparkles className="w-3.5 h-3.5" />
            <span>TCS Chennai Campus Sports Portal</span>
          </div>
          <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-extrabold text-slate-900 tracking-tight leading-none mb-6">
            PlaySmart
          </h1>
          <p className="font-display text-xl sm:text-2xl font-semibold text-blue-700 mb-8 max-w-2xl mx-auto">
            Book Your Game. Stay Active.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              id="hero_get_started_btn"
              onClick={() => onNavigate('register')}
              className="w-full sm:w-auto px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              Get Started <ChevronRight className="w-5 h-5" />
            </button>
            <button
              id="hero_explore_btn"
              onClick={() => onNavigate('login')}
              className="w-full sm:w-auto px-8 py-4 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              Access Dashboard
            </button>
          </div>
        </div>
      </section>

      {/* Key Stats Banner */}
      <section className="bg-blue-900 text-white py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 sm:grid-cols-3 gap-8 text-center">
          <div>
            <p className="text-4xl font-extrabold text-sky-400 font-display">30,000+</p>
            <p className="text-slate-300 text-xs uppercase tracking-wider font-semibold mt-1">Campus Employees</p>
          </div>
          <div>
            <p className="text-4xl font-extrabold text-sky-400 font-display">15 Courts</p>
            <p className="text-slate-300 text-xs uppercase tracking-wider font-semibold mt-1">Ready for Action</p>
          </div>
          <div>
            <p className="text-4xl font-extrabold text-sky-400 font-display">Realtime</p>
            <p className="text-slate-300 text-xs uppercase tracking-wider font-semibold mt-1">Slot Synchronization</p>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="py-16 bg-white border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <h2 className="font-display text-3xl font-bold text-slate-900 tracking-tight">Smart Facility Scheduling</h2>
            <p className="text-slate-500 mt-2">Solving daily high-concurrency reservation loads through streamlined operation windows.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
              <div className="bg-blue-100 text-blue-700 w-10 h-10 rounded-xl flex items-center justify-center mb-4">
                <Calendar className="w-5 h-5" />
              </div>
              <h3 className="font-display font-semibold text-lg text-slate-900">Reduced Server Peak Load</h3>
              <p className="text-slate-500 text-sm mt-2">
                By segmenting bookings with the 5:00 AM – 10:00 AM Security Booking Window, we balance query distributions, ensuring 100% app responsiveness.
              </p>
            </div>

            <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
              <div className="bg-blue-100 text-blue-700 w-10 h-10 rounded-xl flex items-center justify-center mb-4">
                <Activity className="w-5 h-5" />
              </div>
              <h3 className="font-display font-semibold text-lg text-slate-900">Live Grid Availability</h3>
              <p className="text-slate-500 text-sm mt-2">
                Instantly check status tags (🟢 Available, 🔴 Booked, 🟡 Playing, ⚪ Maintenance) for any sport court in the hourly slot matrix.
              </p>
            </div>

            <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
              <div className="bg-blue-100 text-blue-700 w-10 h-10 rounded-xl flex items-center justify-center mb-4">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="font-display font-semibold text-lg text-slate-900">Security Guard Desk Checks</h3>
              <p className="text-slate-500 text-sm mt-2">
                Fast entry using digital QR code validations at physical security check gates to reduce check-in times and mark attendance or no-shows.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Facilities Section */}
      <section id="facilities" className="py-16 bg-slate-50 border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <h2 className="font-display text-3xl font-bold text-slate-900 tracking-tight">Sports Facilities Inventory</h2>
            <p className="text-slate-500 mt-2">State-of-the-art courts and gear setup available daily on the TCS campus.</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
            {Object.entries(sportSummary).map(([sport, count]) => (
              <div key={sport} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center text-center">
                <span className="text-4xl mb-3" role="img" aria-label={sport}>{sportIcons[sport] || '🏆'}</span>
                <h4 className="font-display font-bold text-slate-900 text-sm">{sport}</h4>
                <p className="text-xs text-slate-400 mt-1 font-mono">{(count as number)} {(count as number) > 1 ? 'Units' : 'Unit'}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-blue-600 rounded-3xl p-8 md:p-12 text-white text-center max-w-4xl mx-auto">
            <h2 className="font-display text-2xl md:text-3xl font-bold tracking-tight mb-4">Need Help or Have Concerns?</h2>
            <p className="text-blue-100 text-sm mb-8 max-w-xl mx-auto">
              Reach out to the TCS Chennai Sports Committee or physical campus helpdesk at Siruseri Tech Park.
            </p>
            <div className="flex flex-col md:flex-row items-center justify-center gap-6 md:gap-10 text-sm">
              <div className="flex items-center gap-3">
                <MapPin className="w-5 h-5 text-sky-300 shrink-0" />
                <span>Siruseri Campus, TCS Chennai, Tamil Nadu, India</span>
              </div>
              <div className="flex items-center gap-3">
                <Phone className="w-5 h-5 text-sky-300 shrink-0" />
                <span>+91 44 6616 8888 (Ext. 200)</span>
              </div>
              <div className="flex items-center gap-3">
                <Mail className="w-5 h-5 text-sky-300 shrink-0" />
                <span>playsmart.support@tcs.com</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-8 border-t border-slate-800 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-xs">
          <p>© 2026 TCS Chennai Campus. PlaySmart Sports Scheduling Platform. All rights reserved.</p>
          <p className="mt-2 text-slate-600">Built using React, Tailwind CSS, and local storage state sync mirroring Supabase Postgres.</p>
        </div>
      </footer>
    </div>
  );
}
