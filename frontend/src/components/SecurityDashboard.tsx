/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { db } from '../lib/database';
import { User, Booking, Facility, SlotTime, SportType } from '../types';
import { SLOT_TIMES } from '../data/initialData';
import { normalizeLocation, sameLocation } from '../data/tcsLocations';
import { Shield, Search, QrCode, UserCheck, XOctagon, Calendar, CheckSquare, RefreshCw, AlertTriangle, Play, HelpCircle, Camera, Check, CheckCircle2, AlertCircle, ArrowLeft, X, Printer, Sparkles, Download } from 'lucide-react';
import NotificationBell from './NotificationBell';
import QRCodeSVG from './QRCodeSVG';
import AIChatAssistant from './AIChatAssistant';
import Modal from './ui/Modal';
import { showAppToast } from './ui/AppToast';
import TicketInbox from './TicketInbox';
import {
  firstFutureSlot,
  formatCampusTime,
  getWallClockIST,
  isDemoSimulatedTimeEnabled,
  isSecurityDeskBookingOpen,
  isSlotPastOrStarted,
  normalizeSlotLabel
} from '../lib/timeWindows';

type PortalTheme = 'blue' | 'dark';
const THEMES: Record<PortalTheme, { navBg: string; primaryBtn: string; text: string }> = {
  blue: { navBg: 'bg-[#003366]', primaryBtn: 'bg-[#003366] hover:bg-blue-900', text: 'text-[#003366]' },
  dark: { navBg: 'bg-[#0f172a]', primaryBtn: 'bg-[#0f172a] hover:bg-slate-900', text: 'text-[#0f172a]' }
};
function readPortalTheme(): PortalTheme {
  return localStorage.getItem('playsmart_theme') === 'dark' ? 'dark' : 'blue';
}

interface SecurityDashboardProps {
  user: User;
  onLogout: () => void;
  onUpdateUser?: () => void;
}

export default function SecurityDashboard({ user, onLogout, onUpdateUser }: SecurityDashboardProps) {
  const [employees, setEmployees] = useState<User[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Assisted booking state
  const [bookingEmployeeId, setBookingEmployeeId] = useState('');
  const [bookingEmail, setBookingEmail] = useState('');
  const [inviteRows, setInviteRows] = useState<Array<{ employeeId: string; name: string }>>([
    { employeeId: '', name: '' }
  ]);
  const [bookingSport, setBookingSport] = useState<SportType>('Badminton');
  const [selectedAvailableSport, setSelectedAvailableSport] = useState<SportType>('Badminton');
  const [locationSports, setLocationSports] = useState<SportType[]>([
    'Badminton', 'Basketball', 'Volleyball', 'Table Tennis', 'Carrom', 'Box Cricket'
  ]);
  const [bookingFacilityId, setBookingFacilityId] = useState('');
  const [bookingSlot, setBookingSlot] = useState<SlotTime>('6-7 AM');
  const [bookingError, setBookingError] = useState('');
  const [bookingSuccessMessage, setBookingSuccessMessage] = useState('');
  const [slotTimes, setSlotTimes] = useState<SlotTime[]>(() => {
    const loc = normalizeLocation(user.businessUnit) || 'Chennai, India';
    const cached =
      localStorage.getItem(`playsmart_slot_times::${loc}`) ||
      (loc === 'Chennai, India' ? localStorage.getItem('playsmart_slot_times') : null);
    return cached ? JSON.parse(cached) : SLOT_TIMES;
  });
  const [sportCapacities, setSportCapacities] = useState<Record<string, number>>(() => {
    const loc = normalizeLocation(user.businessUnit) || 'Chennai, India';
    const cached =
      localStorage.getItem(`playsmart_sport_capacities::${loc}`) ||
      (loc === 'Chennai, India' ? localStorage.getItem('playsmart_sport_capacities') : null);
    return cached ? JSON.parse(cached) : {
      'Badminton': 4,
      'Carrom': 4,
      'Table Tennis': 4,
      'Basketball': 10,
      'Box Cricket': 22,
      'Volleyball': 12
    };
  });

  // Scanner simulator state
  const [scannerPassId, setScannerPassId] = useState('');
  const [scannerError, setScannerError] = useState('');
  const [scannerSuccess, setScannerSuccess] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scannedBooking, setScannedBooking] = useState<Booking | null>(null);
  const [generatedQrBooking, setGeneratedQrBooking] = useState<Booking | null>(null);
  const [simTime, setSimTime] = useState(() => getWallClockIST());
  const [scannerSearchQuery, setScannerSearchQuery] = useState('');

  // Profile settings modal states
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  const [profileName, setProfileName] = useState(user.name);
  const [profileEmail, setProfileEmail] = useState(user.email);
  const [profilePhone, setProfilePhone] = useState(user.phoneNumber || '');
  const [profileAvatar, setProfileAvatar] = useState(user.avatar || '');
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');

  // Theme state
  const [theme, setTheme] = useState<PortalTheme>(readPortalTheme);

  // Active filter for bookings list
  const [statusFilter, setStatusFilter] = useState<'all' | 'confirmed' | 'checked_in' | 'no_show'>('all');

  const refreshData = async () => {
    try {
      const userLocation = normalizeLocation(user.businessUnit) || 'Chennai, India';
      const [usersList, booksList, facsList, slots, capacities, sports] = await Promise.all([
        db.getUsers(),
        db.getBookings(),
        db.getFacilities(userLocation),
        db.getSlotTimes(userLocation),
        db.getSportCapacities(userLocation),
        db.getLocationSports(userLocation)
      ]);
      // Same-location employees and bookings only
      const facilityIds = new Set(facsList.map(f => f.facilityId));
      setEmployees(
        usersList.filter(u => u.role === 'employee' && sameLocation(u.businessUnit, userLocation))
      );
      setBookings(booksList.filter(b => facilityIds.has(b.facilityId)));
      setFacilities(facsList);
      setSlotTimes(slots);
      setSportCapacities(capacities);
      setLocationSports(sports);
      if (sports.length > 0) {
        if (!sports.some(s => s.toLowerCase() === bookingSport.toLowerCase())) setBookingSport(sports[0]);
        if (!sports.some(s => s.toLowerCase() === selectedAvailableSport.toLowerCase())) {
          setSelectedAvailableSport(sports[0]);
        }
      }
      if (isDemoSimulatedTimeEnabled()) {
        setSimTime(await db.getSimulatedTime());
      } else {
        setSimTime(getWallClockIST());
      }
    } catch (e) {
      console.error('Error refreshing gatekeeper data:', e);
      if (!isDemoSimulatedTimeEnabled()) setSimTime(getWallClockIST());
    }
  };

  // Live campus clock for booking freeze (independent of API refresh)
  useEffect(() => {
    const tick = () => {
      if (isDemoSimulatedTimeEnabled()) {
        db.getSimulatedTime().then(setSimTime).catch(() => setSimTime(getWallClockIST()));
      } else {
        setSimTime(getWallClockIST());
      }
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (slotTimes.length === 0) return;
    // Prefer first future slot; never leave a past slot selected for new bookings
    if (!slotTimes.includes(bookingSlot) || isSlotPastOrStarted(bookingSlot, simTime)) {
      const next = firstFutureSlot(slotTimes, simTime);
      if (next) setBookingSlot(next as SlotTime);
      else if (slotTimes[0]) setBookingSlot(slotTimes[0]);
    }
  }, [slotTimes, simTime, bookingSlot]);

  useEffect(() => {
    refreshData();
    const handleStorageUpdate = () => {
      refreshData();
      const storedTheme = localStorage.getItem('playsmart_theme') || 'blue';
      setTheme(storedTheme as any);
    };
    const handleTimeChange = async () => {
      refreshData();
    };
    const handleSlotsChange = () => refreshData();
    const handleCapacitiesChange = () => refreshData();
    const handleFacilitiesChange = () => refreshData();

    window.addEventListener('storage', handleStorageUpdate);
    window.addEventListener('simulated_time_change', handleTimeChange);
    window.addEventListener('slot_times_change', handleSlotsChange);
    window.addEventListener('sport_capacities_change', handleCapacitiesChange);
    window.addEventListener('facilities_change', handleFacilitiesChange);
    window.addEventListener('location_sports_change', handleFacilitiesChange);

    const interval = setInterval(() => {
      refreshData();
    }, 2500);

    return () => {
      window.removeEventListener('storage', handleStorageUpdate);
      window.removeEventListener('simulated_time_change', handleTimeChange);
      window.removeEventListener('slot_times_change', handleSlotsChange);
      window.removeEventListener('sport_capacities_change', handleCapacitiesChange);
      window.removeEventListener('facilities_change', handleFacilitiesChange);
      window.removeEventListener('location_sports_change', handleFacilitiesChange);
      clearInterval(interval);
    };
  }, []);

  // Update default facility option when sport changes
  useEffect(() => {
    const sportFacs = facilities.filter(
      f => f.sport.toLowerCase() === bookingSport.toLowerCase() && f.status === 'active'
    );
    if (sportFacs.length > 0) {
      setBookingFacilityId(sportFacs[0].facilityId);
    } else {
      setBookingFacilityId('');
    }
  }, [bookingSport, facilities]);

  const sameSport = (a?: string | null, b?: string | null) =>
    String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  const sameSlot = (a: string, b: string) => normalizeSlotLabel(a) === normalizeSlotLabel(b);

  /** Sports that have courts at this campus (availability + booking dropdowns). */
  const sportsWithCourts = locationSports.filter(s =>
    facilities.some(f => sameSport(f.sport, s))
  );
  const displaySports =
    sportsWithCourts.length > 0
      ? sportsWithCourts
      : Array.from(
          new Map(
            facilities.map(f => [String(f.sport).trim().toLowerCase(), f.sport] as const)
          ).values()
        );

  // Escape closes overlays (scanner / ticket / settings)
  useEffect(() => {
    if (!isScanning && !generatedQrBooking && !isSettingsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (isScanning) {
        setIsScanning(false);
        setScannedBooking(null);
      } else if (generatedQrBooking) {
        setGeneratedQrBooking(null);
      } else if (isSettingsOpen) {
        setIsSettingsOpen(false);
        setProfileError('');
        setProfileSuccess('');
        setPasswordError('');
        setPasswordSuccess('');
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isScanning, generatedQrBooking, isSettingsOpen]);

  // Handle Search for Employees list
  const filteredEmployees = employees.filter(emp => 
    emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.employeeId.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.department.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Filtered Bookings for Security Queue
  const filteredBookings = bookings.filter(b => {
    if (statusFilter === 'all') return true;
    return b.status === statusFilter;
  });

  const handleCreateAssistedBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setBookingError('');
    setBookingSuccessMessage('');

    if (!bookingEmployeeId) {
      setBookingError('Please enter or select an Employee ID.');
      return;
    }

    if (!bookingEmail) {
      setBookingError('Please enter the Employee Email ID.');
      return;
    }

    if (!bookingFacilityId) {
      setBookingError('No active courts available for this sport.');
      return;
    }

    if (!isSecurityDeskBookingOpen(simTime)) {
        setBookingError('Security desk booking is unavailable while campus facilities are closed (open 5:00 AM – 8:00 PM).');
      return;
    }

    if (isSlotPastOrStarted(bookingSlot, simTime)) {
      setBookingError(`Slot ${bookingSlot} has already started or ended. Choose a later slot.`);
      return;
    }

    const additionalPlayers = inviteRows
      .map(r => ({ employeeId: r.employeeId.trim().toUpperCase(), name: r.name.trim() }))
      .filter(r => r.employeeId);

    for (const p of additionalPlayers) {
      if (!p.name) {
        setBookingError(`Enter the registered name for Employee ID ${p.employeeId}.`);
        return;
      }
    }

    const result = await db.createBooking({
      employeeId: bookingEmployeeId.trim().toUpperCase(),
      email: bookingEmail.trim().toLowerCase(),
      facilityId: bookingFacilityId,
      slotTime: bookingSlot,
      bookingSource: 'security',
      additionalPlayers
    });

    if (result.success) {
      const inviteNote = result.invitesSent
        ? ` ${result.invitesSent} invite(s) sent — invitees have 5 minutes to Accept.`
        : '';
      const msg = `Successfully booked slot for Employee ${bookingEmployeeId.toUpperCase()}!${inviteNote}`;
      setBookingSuccessMessage(msg);
      setBookingEmployeeId('');
      setBookingEmail('');
      setInviteRows([{ employeeId: '', name: '' }]);
      refreshData();
    } else {
      setBookingError(result.error || 'Failed to complete booking.');
    }
  };

  // Look up pass by QR / PIN — do NOT mark attendance until officer confirms presence
  const openAttendanceConfirm = (booking: Booking) => {
    setScannedBooking(booking);
    setIsScanning(true);
    setScannerError('');
    setScannerSuccess('');
  };

  const handleScannerCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setScannerError('');
    setScannerSuccess('');

    const trimmedPassId = scannerPassId.trim();
    if (!trimmedPassId) {
      setScannerError('Please enter a Pass / Booking ID.');
      return;
    }

    // Accept raw booking id, or text copied from a phone camera QR scan
    const resolvedPassId =
      trimmedPassId.match(/\b(b_[a-zA-Z0-9]+)\b/i)?.[1] ||
      trimmedPassId.replace(/^PASS[_-]?ID[:\s]*/i, '').trim();
    const booking = bookings.find(
      b => b.bookingId === resolvedPassId || b.bookingId.toLowerCase() === resolvedPassId.toLowerCase()
    );
    if (!booking) {
      setScannerError(`No active reservation matches Pass ID "${resolvedPassId}".`);
      return;
    }

    if (booking.status === 'cancelled') {
      setScannerError('This reservation was already cancelled.');
      return;
    }

    if (booking.status === 'checked_in') {
      setScannerSuccess('Player has already checked in! Access permitted.');
      return;
    }

    // Show employee details — attendance only after "Confirm employee present"
    setScannerPassId('');
    openAttendanceConfirm(booking);
  };

  const handleConfirmValidation = async (bookingId: string) => {
    const res = await db.updateBookingStatus(bookingId, 'checked_in', user.employeeId);
    if (res.success) {
      setScannerSuccess(
        `Attendance confirmed. ${scannedBooking?.employeeName || 'Employee'} is present at the gate.`
      );
      setScannedBooking(null);
      setIsScanning(false);
      refreshData();
      showAppToast('Attendance logged — employee present.', 'success');
    } else {
      setScannerError(res.error || 'Failed to complete attendance validation.');
    }
  };

  const handleScanBooking = (booking: Booking) => {
    openAttendanceConfirm(booking);
  };

  const getCurrentSlotTime = (): SlotTime | 'none' => {
    const hr = simTime.hour;
    if (hr >= 6 && hr < 7) return '6-7 AM';
    if (hr >= 7 && hr < 8) return '7-8 AM';
    if (hr >= 8 && hr < 9) return '8-9 AM';
    if (hr >= 9 && hr < 10) return '9-10 AM';
    if (hr >= 10 && hr < 11) return '10-11 AM';
    if (hr >= 11 && hr < 12) return '11-12 PM';
    if (hr >= 12 && hr < 13) return '12-1 PM';
    if (hr >= 13 && hr < 14) return '1-2 PM';
    if (hr >= 14 && hr < 15) return '2-3 PM';
    if (hr >= 15 && hr < 16) return '3-4 PM';
    if (hr >= 16 && hr < 17) return '4-5 PM';
    if (hr >= 17 && hr < 18) return '5-6 PM';
    if (hr >= 18 && hr < 19) return '6-7 PM';
    if (hr >= 19 && hr < 20) return '7-8 PM';
    return 'none';
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 250 * 1024) {
        setProfileError('Profile picture must be under 250KB.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfileAvatar(reader.result as string);
        setProfileError('');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError('');
    setProfileSuccess('');

    if (!profileName.trim()) return setProfileError('Name is required.');
    const emailLower = profileEmail.trim().toLowerCase();
    if (!emailLower.endsWith('@tcs.com') && !emailLower.endsWith('@gmail.com')) {
      return setProfileError('Email must belong to tcs.com or gmail.com domains.');
    }

    const res = await db.updateUserProfile(
      user.employeeId,
      profileName.trim(),
      emailLower,
      profilePhone.trim(),
      profileAvatar
    );

    if (res.success) {
      setProfileSuccess('Profile details updated successfully!');
      onUpdateUser?.();
    } else {
      setProfileError(res.error || 'Failed to update profile.');
    }
  };

  const handleThemeChange = (newTheme: PortalTheme) => {
    setTheme(newTheme);
    localStorage.setItem('playsmart_theme', newTheme);
    window.dispatchEvent(new Event('storage'));
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (!currentPassword) return setPasswordError('Current password is required.');
    if (newPassword.length < 6) return setPasswordError('New password must be at least 6 characters long.');
    if (newPassword !== confirmPassword) return setPasswordError('New passwords do not match.');

    const res = await db.changePassword(user.employeeId, currentPassword, newPassword);
    if (res.success) {
      setPasswordSuccess('Password updated successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } else {
      setPasswordError(res.error || 'Failed to update password.');
    }
  };

  const handleStatusUpdate = async (bookingId: string, status: 'checked_in' | 'no_show' | 'cancelled') => {
    const res = await db.updateBookingStatus(bookingId, status, user.employeeId);
    if (res.success) {
      refreshData();
    } else {
      showAppToast(res.error || 'Status update failed.', 'error');
    }
  };

  const handleCancelBooking = async (bookingId: string) => {
    const res = await db.cancelBooking(bookingId);
    if (res.success) {
      refreshData();
    } else {
      showAppToast(res.error || 'Cancel failed.', 'error');
    }
  };

  const isSecurityBookingWindow = isSecurityDeskBookingOpen(simTime);
  const isFacilitiesOpen = simTime.hour >= 5 && simTime.hour < 20;

  const selectEmployee = (empId: string) => {
    setBookingEmployeeId(empId);
    const emp = employees.find(e => e.employeeId === empId);
    if (emp) {
      setBookingEmail(emp.email);
    }
    setBookingError('');
  };

  return (
    <div id="security_dashboard" className="min-h-screen tcs-campus-bg text-slate-800 flex flex-col justify-between">
      <div className="grow">
        {/* Top Header Navigation */}
        <nav className={`${THEMES[theme]?.navBg || 'bg-[#003366]'} text-white py-3 px-3 sm:px-6 lg:px-8 shadow-sm transition-all duration-300`}>
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <img src="/tcs_logo.png" className="h-7 sm:h-8 w-auto shrink-0 object-contain bg-white/95 rounded px-1.5 py-0.5" alt="TCS" />
              <div className="min-w-0">
                <span className="font-display font-extrabold text-sm sm:text-lg text-white block leading-tight truncate">
                  TCS Play-Smart
                </span>
                <span className="text-[10px] text-blue-200 font-semibold uppercase tracking-wider block truncate">
                  Security · {user.businessUnit || 'Campus'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-4 shrink-0">
              <div className="hidden md:flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${isFacilitiesOpen ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'}`} />
                <span className="text-xs text-blue-100 font-medium">
                  {isFacilitiesOpen
                    ? (isSecurityBookingWindow ? 'Desk booking open · Scanner online' : 'Desk booking frozen · Scanner online')
                    : 'Facilities closed'}
                </span>
              </div>

              <NotificationBell employeeId={user.employeeId} variant="onDark" />
              
              <button
                type="button"
                onClick={() => setIsSettingsOpen(true)}
                className="flex items-center gap-2 text-right cursor-pointer hover:opacity-85 transition-opacity bg-transparent border-0 p-0"
                title="View Profile & Settings"
                aria-label="Open profile and settings"
              >
                {user.avatar ? (
                  <img src={user.avatar} className="w-7 h-7 rounded-full object-cover border border-white/25 shadow-sm" alt="" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center font-bold text-xs text-white border border-white/25 shadow-sm">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="hidden sm:block">
                  <span className="text-xs font-semibold block text-slate-100 text-left">{user.name}</span>
                  <span className="text-[10px] text-blue-200/80 font-mono block text-left">Officer ID: {user.employeeId}</span>
                </div>
              </button>

              <button
                id="sec_logout_btn"
                onClick={onLogout}
                className="px-2.5 sm:px-3 py-1.5 text-xs font-bold text-rose-300 hover:text-white hover:bg-rose-600 rounded-lg border border-rose-500/20 transition-colors cursor-pointer"
              >
                <span className="sm:hidden">Out</span>
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </div>
          </div>
        </nav>

      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8">
        {/* Dynamic Warning Banners (Section 3.1 Banners) */}
        {isSecurityBookingWindow ? (
          <div className="bg-emerald-50 border border-emerald-150 text-emerald-800 p-4 rounded-2xl mb-8 flex items-start gap-3 shadow-sm animate-fade-in">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-xs uppercase tracking-wider">Security Desk Booking Active</p>
              <p className="text-xs text-emerald-700 mt-0.5 leading-relaxed">
                You can create walk-in reservations all day while facilities are open (5:00 AM – 8:00 PM).
                Employees may also self-book online from 10:00 AM – 8:00 PM.
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-2xl mb-8 flex items-start gap-3 shadow-sm animate-fade-in">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-xs uppercase tracking-wider">Campus Facilities Closed</p>
              <p className="text-xs text-rose-700 mt-0.5 leading-relaxed">
                {user.businessUnit || 'TCS Campus'} sports facilities are closed (8:00 PM to 5:00 AM).
                Bookings are locked overnight.
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* LEFT PANEL: Gate Pass Scanner and Assisted Booking Form */}
          <div className="lg:col-span-5 space-y-8">
            
            {/* 1. Gate Pass Scanner Simulator (Section 15) */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm relative overflow-hidden">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="bg-blue-100 text-blue-700 p-1.5 rounded-lg">
                    <QrCode className="w-5 h-5 animate-pulse" />
                  </div>
                  <h3 className="font-display font-bold text-slate-900 text-base">QR PlayPass Gate Scanner</h3>
                </div>
                {isFacilitiesOpen ? (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1 animate-pulse" aria-hidden />
                    Scanner online
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 mr-1" aria-hidden />
                    Facilities closed
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-500 mb-5 leading-relaxed">
                Scan employee digital playpass or key-in the reservation booking ID to verify court eligibility and stamp play attendance.
              </p>

              {scannerError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs p-3 rounded-xl mb-4">
                  {scannerError}
                </div>
              )}
              {scannerSuccess && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs p-3 rounded-xl mb-4">
                  {scannerSuccess}
                </div>
              )}

              <div className="space-y-3">
                <button
                  type="button"
                  id="trigger_qr_scanner_btn"
                  onClick={() => {
                    setIsScanning(true);
                    setScannerError('');
                    setScannerSuccess('');
                  }}
                  className="w-full py-3.5 bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-800 hover:to-indigo-800 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all duration-300 transform hover:scale-[1.01]"
                >
                  <Camera className="w-4 h-4 shrink-0 text-amber-300 animate-pulse" />
                  Trigger Scanner State (Scan QR)
                </button>

                <div className="relative flex items-center py-2">
                  <div className="grow border-t border-slate-200"></div>
                  <span className="shrink-0 mx-3 text-[10px] text-slate-400 font-bold uppercase tracking-widest">Or Key In Booking ID</span>
                  <div className="grow border-t border-slate-200"></div>
                </div>

                <form onSubmit={handleScannerCheckIn} className="flex gap-2">
                  <input
                    id="sec_scanner_input"
                    type="text"
                    required
                    placeholder="Enter Booking ID (e.g., b_1715...)"
                    value={scannerPassId}
                    onChange={(e) => setScannerPassId(e.target.value)}
                    className="block flex-1 px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 font-mono bg-slate-50"
                  />
                  <button
                    type="submit"
                    id="sec_scan_submit_btn"
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl cursor-pointer shadow-sm transition-all text-center"
                  >
                    Verify Pass
                  </button>
                </form>
              </div>

              {/* Quick simulator helper */}
              <div className="mt-4 bg-slate-50 border border-slate-200 p-3 rounded-xl text-[11px] text-slate-500 leading-relaxed">
                <span className="font-semibold block text-slate-700">Attendance at the gate</span>
                <p className="mt-0.5">
                  Scan the employee QR or enter their Pass ID, review their details, then tap <strong>Confirm employee present</strong>. Attendance is marked only after that confirmation.
                </p>
              </div>
            </div>

            {/* 2. Assisted Booking Creation Form or Available Slots Explorer (Section 14) */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
              {!isSecurityBookingWindow ? (
                /* Frozen View: ONLY SEE AVAILABLE SLOTS */
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="bg-rose-100 text-rose-800 p-1.5 rounded-lg">
                      <XOctagon className="w-5 h-5 text-rose-600" />
                    </div>
                    <div>
                      <h3 className="font-display font-bold text-slate-900 text-base">Desk Booking: FROZEN</h3>
                      <span className="text-[10px] bg-rose-50 text-rose-700 font-mono font-bold px-2 py-0.5 rounded-full border border-rose-100">
                        Locked (facilities closed 8:00 PM – 5:00 AM)
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-500 leading-relaxed">
                    Campus facilities are closed overnight. You can still browse availability below. Assisted booking reopens at 5:00 AM.
                  </p>

                  <div className="border-t border-slate-100 pt-4">
                    <label htmlFor="avail_sport_filter" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                      Filter Available Slots by Sport
                    </label>
                    <select
                      id="avail_sport_filter"
                      value={selectedAvailableSport}
                      onChange={(e) => setSelectedAvailableSport(e.target.value as SportType)}
                      className="block w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 mb-4 cursor-pointer"
                    >
                      {displaySports.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>

                    <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                      {facilities
                        .filter(f => sameSport(f.sport, selectedAvailableSport) && f.status === 'active')
                        .map(fac => {
                          const openSlots = slotTimes.filter(st => {
                            if (isSlotPastOrStarted(st, simTime)) return false;
                            return !bookings.some(
                              b =>
                                b.facilityId === fac.facilityId &&
                                sameSlot(b.slotTime, st) &&
                                b.status !== 'cancelled'
                            );
                          });

                          return (
                            <div key={fac.facilityId} className="bg-slate-50/50 hover:bg-white hover:shadow-md hover:scale-[1.02] hover:border-blue-100 transition-all duration-300 ease-out p-3 rounded-2xl border border-slate-100">
                              <span className="font-semibold text-xs text-slate-800 block mb-2 font-display">
                                📍 {fac.courtName}
                              </span>
                              {openSlots.length === 0 ? (
                                <span className="text-[11px] text-rose-500 font-medium block">
                                  ⚠️ Fully Booked Today
                                </span>
                              ) : (
                                <div className="grid grid-cols-2 gap-1.5">
                                  {openSlots.map(st => (
                                    <div
                                      key={st}
                                      className="bg-emerald-50 text-emerald-800 border border-emerald-100 rounded-lg py-1 px-2 text-[10px] font-mono text-center font-bold"
                                      title="Available"
                                    >
                                      🟢 {st}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </div>
              ) : (
                /* Active View: SECURITY BOOKING FORM */
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="bg-emerald-100 text-emerald-800 p-1.5 rounded-lg">
                      <Calendar className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div>
                      <h3 className="font-display font-bold text-slate-900 text-base">Desk Assisted Booking</h3>
                      <span className="text-[10px] bg-emerald-50 text-emerald-700 font-mono font-bold px-2 py-0.5 rounded-full border border-emerald-100">
                        Active all day (5:00 AM – 8:00 PM)
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-500 mb-4">
                    Security can book any open slot for employees all day while facilities are open. Employees may also self-book online from <strong>10:00 AM – 8:00 PM</strong>.
                  </p>

                  <form onSubmit={handleCreateAssistedBooking} className="space-y-4">
                    {bookingError && (
                      <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs p-3 rounded-xl">
                        {bookingError}
                      </div>
                    )}
                    {bookingSuccessMessage && (
                      <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs p-3 rounded-xl">
                        {bookingSuccessMessage}
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="sec_booking_emp_id" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                          Employee ID
                        </label>
                        <input
                          id="sec_booking_emp_id"
                          type="text"
                          required
                          placeholder="e.g. EMP101"
                          value={bookingEmployeeId}
                          onChange={(e) => setBookingEmployeeId(e.target.value)}
                          className="mt-1 block w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-950 font-mono"
                        />
                      </div>

                      <div>
                        <label htmlFor="sec_booking_email" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                          Email Address
                        </label>
                        <input
                          id="sec_booking_email"
                          type="email"
                          required
                          placeholder="e.g. name@tcs.com"
                          value={bookingEmail}
                          onChange={(e) => setBookingEmail(e.target.value)}
                          className="mt-1 block w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-950 font-mono"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="sec_booking_sport" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                          Sport
                        </label>
                        <select
                          id="sec_booking_sport"
                          value={bookingSport}
                          onChange={(e) => setBookingSport(e.target.value as SportType)}
                          className="mt-1 block w-full px-2 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                        >
                          {displaySports.map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label htmlFor="sec_booking_court" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                          Court / Board
                        </label>
                        <select
                          id="sec_booking_court"
                          value={bookingFacilityId}
                          onChange={(e) => setBookingFacilityId(e.target.value)}
                          className="mt-1 block w-full px-2 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                        >
                          {facilities
                            .filter(f => sameSport(f.sport, bookingSport) && f.status === 'active')
                            .map(f => (
                              <option key={f.facilityId} value={f.facilityId}>{f.courtName}</option>
                            ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label htmlFor="sec_booking_slot" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Slot Time
                      </label>
                      <select
                        id="sec_booking_slot"
                        value={bookingSlot}
                        onChange={(e) => setBookingSlot(e.target.value as SlotTime)}
                        className="mt-1 block w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 font-mono"
                      >
                        {slotTimes.map(st => (
                          <option key={st} value={st} disabled={isSlotPastOrStarted(st, simTime)}>
                            {st}{isSlotPastOrStarted(st, simTime) ? ' (past)' : ''}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-[10px] font-mono text-slate-500">
                        Campus clock: {formatCampusTime(simTime)}
                      </p>
                    </div>

                    <div className="border border-slate-200 rounded-xl p-3 space-y-2 bg-slate-50/80">
                      <p className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Invite additional registered players (optional)
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Unregistered Employee IDs cannot be invited. Invitees have 5 minutes to Accept.
                      </p>
                      {inviteRows.map((row, idx) => (
                        <div key={idx} className="grid grid-cols-2 gap-2">
                          <div>
                            <label htmlFor={`sec_invite_emp_${idx}`} className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                              Employee ID
                            </label>
                            <input
                              id={`sec_invite_emp_${idx}`}
                              value={row.employeeId}
                              onChange={(e) => {
                                const next = [...inviteRows];
                                next[idx] = { ...next[idx], employeeId: e.target.value };
                                setInviteRows(next);
                              }}
                              placeholder="e.g. EMP123"
                              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl font-mono bg-white"
                            />
                          </div>
                          <div>
                            <label htmlFor={`sec_invite_name_${idx}`} className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                              Registered name
                            </label>
                            <input
                              id={`sec_invite_name_${idx}`}
                              value={row.name}
                              onChange={(e) => {
                                const next = [...inviteRows];
                                next[idx] = { ...next[idx], name: e.target.value };
                                setInviteRows(next);
                              }}
                              placeholder="Exact registered name"
                              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white"
                            />
                          </div>
                        </div>
                      ))}
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => setInviteRows([...inviteRows, { employeeId: '', name: '' }])}
                          className="text-[11px] font-bold text-blue-700 hover:underline cursor-pointer"
                        >
                          + Add player
                        </button>
                        {inviteRows.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setInviteRows(inviteRows.slice(0, -1))}
                            className="text-[11px] font-bold text-rose-600 hover:underline cursor-pointer"
                          >
                            Remove last
                          </button>
                        )}
                      </div>
                    </div>

                    <button
                      type="submit"
                      id="sec_book_slot_submit"
                      className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-xl shadow-md transition-colors cursor-pointer"
                    >
                      Book Slot for Employee
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT PANEL: Search Employee & Realtime Bookings Grid Queue */}
          <div className="lg:col-span-7 space-y-8">
            
            {/* 3. Search Employee (Section 14) */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <div className="bg-slate-100 text-slate-700 p-1.5 rounded-lg">
                  <Search className="w-5 h-5" />
                </div>
                <h3 className="font-display font-bold text-slate-900 text-base">TCS Employee Directory</h3>
              </div>

              <div className="relative mb-4">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Search className="w-4 h-4" />
                </div>
                <input
                  id="sec_emp_search"
                  type="text"
                  placeholder="Search Employee ID, Name or Department..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="block w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                />
              </div>

              {searchQuery && (
                <div className="border border-slate-200 rounded-xl max-h-48 overflow-y-auto divide-y divide-slate-100">
                  {filteredEmployees.length === 0 ? (
                    <div className="p-3 text-center text-xs text-slate-400">No matching employees found.</div>
                  ) : (
                    filteredEmployees.map(emp => (
                      <div key={emp.id} className="p-3 text-xs flex justify-between items-center hover:bg-slate-50">
                        <div>
                          <p className="font-semibold text-slate-950">{emp.name}</p>
                          <p className="text-[10px] text-slate-500 font-mono">{emp.employeeId} | {emp.department} | {emp.businessUnit}</p>
                        </div>
                        <button
                          id={`select_emp_btn_${emp.employeeId}`}
                          onClick={() => selectEmployee(emp.employeeId)}
                          className="px-2.5 py-1 text-[10px] font-bold text-blue-600 bg-blue-50 rounded hover:bg-blue-100 cursor-pointer"
                        >
                          Select for Booking
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* 4. Today's Booking Queue (Section 14 & 15) */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
                <div>
                  <h3 className="font-display font-bold text-slate-900 text-base">Gate Checkpoint Queue</h3>
                  <p className="text-xs text-slate-500">Live reservation entries at courts checkpoints.</p>
                </div>
                <button
                  id="sec_refresh_queue_btn"
                  onClick={refreshData}
                  className="p-1.5 text-slate-400 hover:text-slate-800 rounded-lg hover:bg-slate-100 cursor-pointer"
                  title="Force Refresh Queue"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>

              {/* Status Tabs Filters */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                {(['all', 'confirmed', 'checked_in', 'no_show'] as const).map(f => (
                  <button
                    key={f}
                    id={`sec_filter_btn_${f}`}
                    onClick={() => setStatusFilter(f)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      statusFilter === f
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {f === 'all' ? 'All Bookings' : f.replace('_', ' ')}
                  </button>
                ))}
              </div>

              {/* Bookings queue list */}
              {filteredBookings.length === 0 ? (
                <div className="p-12 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <CheckSquare className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-slate-700">No Reservations Listed</p>
                  <p className="text-[10px] text-slate-400 mt-1">Bookings created will appear in this check-in flow queue.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredBookings.map(b => (
                    <div key={b.bookingId} className="border border-slate-200 p-4 rounded-2xl bg-white hover:border-slate-300 transition-all text-xs">
                      <div className="flex flex-wrap justify-between items-start gap-2 mb-2">
                        <div>
                          <p className="font-bold text-slate-950">
                            {b.employeeName}
                          </p>
                          <p className="text-[10px] font-mono text-slate-500">
                            Employee ID: {b.employeeId}
                          </p>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase ${
                          b.status === 'checked_in' ? 'bg-amber-100 text-amber-800' :
                          b.status === 'no_show' ? 'bg-rose-100 text-rose-800' :
                          b.status === 'cancelled' ? 'bg-slate-100 text-slate-500' :
                          'bg-blue-100 text-blue-800'
                        }`}>
                          {b.status.replace('_', ' ')}
                        </span>
                      </div>

                      <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-[11px] grid grid-cols-2 gap-2 my-3">
                        <p className="text-slate-500 font-semibold">Sport: <span className="text-slate-800 font-bold">{b.sport}</span></p>
                        <p className="text-slate-500 font-semibold">Location: <span className="text-slate-800 font-bold">{b.courtName}</span></p>
                        <p className="text-slate-500 font-semibold">Time: <span className="text-slate-800 font-bold font-mono">{b.slotTime}</span></p>
                        <p className="text-slate-500 font-semibold">Pass ID: <span className="text-slate-400 font-bold font-mono">{b.bookingId}</span></p>
                      </div>

                      {/* ACTIONS ROW (Section 14 Buttons) */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
                        {b.status === 'confirmed' && (
                          <>
                            <button
                              id={`sec_checkin_btn_${b.bookingId}`}
                              onClick={() => openAttendanceConfirm(b)}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg cursor-pointer flex items-center gap-1 text-[10px]"
                            >
                              <UserCheck className="w-3.5 h-3.5" /> Verify & Check In
                            </button>
                            <button
                              id={`sec_generate_qr_btn_${b.bookingId}`}
                              onClick={() => setGeneratedQrBooking(b)}
                              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-lg cursor-pointer flex items-center gap-1 text-[10px]"
                              title="Generate/View QR Code Pass"
                            >
                              <QrCode className="w-3.5 h-3.5 text-blue-800" /> View QR
                            </button>
                            <button
                              id={`sec_noshow_btn_${b.bookingId}`}
                              onClick={() => handleStatusUpdate(b.bookingId, 'no_show')}
                              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg cursor-pointer flex items-center gap-1 text-[10px]"
                            >
                              <AlertTriangle className="w-3.5 h-3.5" /> Mark No-Show
                            </button>
                            <button
                              id={`sec_cancel_btn_${b.bookingId}`}
                              onClick={() => handleCancelBooking(b.bookingId)}
                              className="px-3 py-1.5 bg-rose-50 border border-rose-100 text-rose-700 hover:bg-rose-100 font-bold rounded-lg cursor-pointer flex items-center gap-1 text-[10px] ml-auto"
                            >
                              <XOctagon className="w-3.5 h-3.5" /> Cancel Slot
                            </button>
                          </>
                        )}
                        {b.status === 'checked_in' && (
                          <div className="flex items-center gap-2 w-full justify-between">
                            <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
                              <Play className="w-3.5 h-3.5 fill-current" /> Game actively in progress
                            </span>
                            <button
                              id={`sec_generate_qr_btn_${b.bookingId}`}
                              onClick={() => setGeneratedQrBooking(b)}
                              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-lg cursor-pointer flex items-center gap-1 text-[10px] ml-auto"
                              title="View Playpass Ticket Receipt"
                            >
                              <QrCode className="w-3.5 h-3.5 text-emerald-700" /> View Ticket
                            </button>
                          </div>
                        )}
                        {b.status === 'no_show' && (
                          <span className="text-[10px] text-rose-600 font-semibold">
                            Player missed the slot booking time.
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>

        <div className="mt-8 bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
          <TicketInbox
            user={user}
            queue="security"
            title="Court concern tickets (Security queue)"
          />
        </div>
      </main>
    </div>

    {/* Footer Status Bar */}
    <footer className="h-10 bg-slate-100 border-t border-slate-200 px-6 flex items-center justify-between text-[11px] font-medium text-slate-500 shrink-0">
      <div className="flex gap-4">
        <span>Database: 12ms Response</span>
        <span className="text-slate-300">|</span>
        <span>Supabase Realtime: Connected</span>
        <span className="text-slate-300">|</span>
        <span>Last Sync: {new Date().toLocaleTimeString()}</span>
      </div>
      <div className="flex gap-2 items-center">
        <span className="w-2 h-2 bg-[#003366] rounded-full animate-pulse"></span>
        <span>TCS Play-Smart Security</span>
      </div>
    </footer>

    {/* 5. QR Scanner Viewport Modal (Scan State) */}
    {isScanning && (
      <div
        id="security_scanner_modal"
        role="dialog"
        aria-modal="true"
        aria-label="QR scanner"
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 z-50 animate-fade-in"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) {
            setIsScanning(false);
            setScannedBooking(null);
          }
        }}
      >
        <div className="bg-slate-900 text-white rounded-t-3xl sm:rounded-3xl max-w-2xl w-full border border-slate-800 shadow-2xl overflow-hidden flex flex-col md:flex-row max-h-[92dvh] md:h-[500px]">
          
          {/* Left side: Viewport Camera Simulation */}
          <div className="w-full md:w-1/2 bg-slate-950 p-6 flex flex-col justify-between relative border-r border-slate-800">
            <div className="flex justify-between items-center z-10">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-rose-400">● LIVE SCANNER VISOR</span>
              </div>
              <button
                onClick={() => {
                  setIsScanning(false);
                  setScannedBooking(null);
                }}
                className="p-1 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Viewport Box */}
            {!scannedBooking ? (
              <div className="my-auto relative w-48 h-48 mx-auto border-2 border-slate-700 rounded-2xl overflow-hidden flex flex-col items-center justify-center bg-slate-900 shadow-inner">
                {/* Neon laser line */}
                <div className="absolute left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 via-green-500 to-emerald-400 animate-laser shadow-[0_0_8px_rgba(16,185,129,0.8)] z-10"></div>
                
                {/* Camera guides */}
                <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-emerald-400"></div>
                <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-emerald-400"></div>
                <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-emerald-400"></div>
                <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-emerald-400"></div>
                
                {/* Pulsing QR code background */}
                <QrCode className="w-28 h-28 text-slate-800/40 animate-pulse" />
                
                <span className="absolute bottom-4 text-[9px] font-mono text-slate-500 uppercase tracking-widest animate-pulse">Awaiting pass...</span>
              </div>
            ) : (
              <div className="my-auto text-center p-4 bg-emerald-950/20 border border-emerald-800/40 rounded-2xl">
                <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto animate-bounce" />
                <p className="mt-2 text-xs font-bold text-emerald-300">QR Code Captured!</p>
                <p className="text-[10px] font-mono text-emerald-500 mt-1">{scannedBooking.bookingId}</p>
              </div>
            )}

            <div className="text-center z-10">
              <span className="text-[10.5px] text-slate-400 block max-w-[200px] mx-auto leading-normal">
                {!scannedBooking 
                  ? "Align an Employee's Digital Pass QR ticket within the scanner frame to analyze."
                  : "Pass scanned successfully. Complete validation checks on the right side."
                }
              </span>
            </div>
          </div>

          {/* Right side: Scanned Code Validator or Simulator Controls */}
          <div className="w-full md:w-1/2 bg-slate-900 p-6 flex flex-col justify-between overflow-y-auto">
            {!scannedBooking ? (
              /* Scanning state: Let them select an active booking to scan */
              <div className="flex-1 flex flex-col justify-between h-full">
                <div>
                  <h3 className="font-display font-bold text-base text-white tracking-tight">Scanner Controller</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5 leading-normal">
                    Click any active employee pass below to simulate presenting their QR ticket to the camera lens.
                  </p>

                  <div className="mt-4 relative">
                    <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Search employee or sport..."
                      value={scannerSearchQuery}
                      onChange={(e) => setScannerSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans"
                    />
                  </div>

                  {/* Scrollable list of confirmed bookings */}
                  <div className="mt-3 space-y-2 max-h-56 overflow-y-auto pr-1">
                    {bookings
                      .filter(b => b.status === 'confirmed')
                      .filter(b => 
                        b.employeeName.toLowerCase().includes(scannerSearchQuery.toLowerCase()) ||
                        b.employeeId.toLowerCase().includes(scannerSearchQuery.toLowerCase()) ||
                        b.sport.toLowerCase().includes(scannerSearchQuery.toLowerCase())
                      )
                      .length === 0 ? (
                        <p className="text-[10px] text-slate-500 text-center py-4">No active un-scanned bookings available.</p>
                      ) : (
                        bookings
                          .filter(b => b.status === 'confirmed')
                          .filter(b => 
                            b.employeeName.toLowerCase().includes(scannerSearchQuery.toLowerCase()) ||
                            b.employeeId.toLowerCase().includes(scannerSearchQuery.toLowerCase()) ||
                            b.sport.toLowerCase().includes(scannerSearchQuery.toLowerCase())
                          )
                          .map(b => (
                            <button
                              key={b.bookingId}
                              onClick={() => handleScanBooking(b)}
                              className="w-full p-2.5 bg-slate-950 hover:bg-slate-800 border border-slate-800/80 rounded-xl flex items-center justify-between text-left transition-all group cursor-pointer"
                            >
                              <div>
                                <p className="text-xs font-bold text-slate-200 group-hover:text-white">{b.employeeName}</p>
                                <p className="text-[9.5px] font-mono text-slate-400 mt-0.5">{b.sport} • {b.courtName}</p>
                              </div>
                              <div className="text-right">
                                <span className="text-[9px] font-bold font-mono text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded uppercase">
                                  {b.slotTime}
                                </span>
                                <span className="text-[9px] block text-blue-400 font-bold mt-1 group-hover:underline">Present QR →</span>
                              </div>
                            </button>
                          ))
                      )}
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-800/60 mt-4 flex gap-2">
                  <button
                    onClick={() => setIsScanning(false)}
                    className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-xs rounded-xl cursor-pointer transition-all"
                  >
                    Close Scanner
                  </button>
                </div>
              </div>
            ) : (() => {
              const currentSlot = getCurrentSlotTime();
              const facility = facilities.find(f => f.facilityId === scannedBooking.facilityId);
              const isMaintenance = facility?.status === 'maintenance';
              const isSlotMatch = scannedBooking.slotTime === currentSlot;
              
              return (
                <div className="flex-1 flex flex-col justify-between h-full">
                  <div>
                    <div className="flex items-center gap-1.5 mb-2.5">
                      <ArrowLeft
                        className="w-4 h-4 text-slate-400 hover:text-white cursor-pointer"
                        onClick={() => setScannedBooking(null)}
                      />
                      <h3 className="font-display font-bold text-base text-white tracking-tight">Code Validator</h3>
                    </div>

                    {/* Scanned Card Summary */}
                    <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-semibold">TCS Player Name:</span>
                        <span className="text-white font-bold">{scannedBooking.employeeName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-semibold">Employee ID:</span>
                        <span className="text-slate-300 font-bold font-mono">{scannedBooking.employeeId}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-semibold">Sport Activity:</span>
                        <span className="text-blue-400 font-bold">{scannedBooking.sport}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-semibold">Court Location:</span>
                        <span className="text-slate-300 font-bold">{scannedBooking.courtName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-semibold">Allocated Slot:</span>
                        <span className="text-amber-400 font-bold font-mono">{scannedBooking.slotTime}</span>
                      </div>
                    </div>

                    {/* Validation checklist */}
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-4 mb-2">Gate Credentials Checks</h4>
                    <div className="space-y-2">
                      {/* 1. Status Check */}
                      <div className="flex items-center justify-between p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-[11px]">
                        <div className="flex items-center gap-2">
                          {scannedBooking.status === 'confirmed' ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                          )}
                          <span className="font-medium text-slate-300">Reservation Ticket Status</span>
                        </div>
                        <span className={`text-[9px] font-bold font-mono px-1.5 py-0.5 rounded ${
                          scannedBooking.status === 'confirmed' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                        }`}>
                          {scannedBooking.status.toUpperCase()}
                        </span>
                      </div>

                      {/* 2. Slot Match Check */}
                      <div className="flex items-center justify-between p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-[11px]">
                        <div className="flex items-center gap-2">
                          {isSlotMatch ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                          )}
                          <span className="font-medium text-slate-300">Time-Slot Match Check</span>
                        </div>
                        <span className={`text-[9px] font-bold font-mono px-1.5 py-0.5 rounded ${
                          isSlotMatch ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                        }`}>
                          {isSlotMatch ? 'VALID' : 'TIME_MISMATCH'}
                        </span>
                      </div>

                      {/* 3. Maintenance Check */}
                      <div className="flex items-center justify-between p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-[11px]">
                        <div className="flex items-center gap-2">
                          {!isMaintenance ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                          )}
                          <span className="font-medium text-slate-300">Court Maintenance Guard</span>
                        </div>
                        <span className={`text-[9px] font-bold font-mono px-1.5 py-0.5 rounded ${
                          !isMaintenance ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                        }`}>
                          {!isMaintenance ? 'ACTIVE' : 'UNDER_REPAIR'}
                        </span>
                      </div>
                    </div>

                    {/* Display warning if slot mismatch or maintenance */}
                    {(!isSlotMatch || isMaintenance) && (
                      <div className="mt-3 bg-amber-500/10 border border-amber-500/20 text-amber-300 p-2.5 rounded-xl text-[10.5px] leading-relaxed">
                        <strong>⚠️ Warning Indicator:</strong>{' '}
                        {!isSlotMatch && `This pass is reserved for ${scannedBooking.slotTime}, but current simulated gate slot is ${currentSlot || 'Closed'}.`}
                        {isMaintenance && ` This facility/court is currently marked as under maintenance.`}
                        {' Overriding and checking in is permitted by officer authority.'}
                      </div>
                    )}
                  </div>

                  <div className="pt-4 border-t border-slate-800/60 mt-4 flex gap-2">
                    <button
                      onClick={() => setScannedBooking(null)}
                      className="w-1/3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl cursor-pointer transition-all"
                    >
                      Scan Back
                    </button>
                    <button
                      onClick={() => handleConfirmValidation(scannedBooking.bookingId)}
                      disabled={isMaintenance}
                      className={`flex-1 py-2.5 text-xs font-bold rounded-xl text-slate-950 transition-all cursor-pointer ${
                        isMaintenance 
                          ? 'bg-slate-600 cursor-not-allowed text-slate-400' 
                          : 'bg-emerald-400 hover:bg-emerald-500 shadow-md shadow-emerald-500/20'
                      }`}
                    >
                      Confirm employee present
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>

        </div>
      </div>
    )}

    {/* 6. QR Ticket Pass Generator Modal (QR Generation Utility) */}
    {generatedQrBooking && (
      <Modal
        isOpen
        onClose={() => setGeneratedQrBooking(null)}
        title="TCS PlayPass Generator"
        maxWidthClass="max-w-sm"
      >
          <div className="text-center text-slate-800">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 border border-blue-100 rounded-full text-[10px] font-bold text-[#003366] uppercase tracking-wider mb-2">
              <Sparkles className="w-3 h-3 text-blue-600 animate-pulse" /> Walk-In Pass Generated
            </div>

            <h4 className="font-display font-extrabold text-slate-900 text-lg">{generatedQrBooking.sport} Access Pass</h4>
            <p className="text-[10px] text-slate-400 font-mono mt-0.5">{generatedQrBooking.courtName} | {generatedQrBooking.slotTime}</p>

            {/* Simulated QR block */}
            <div className="my-5 flex flex-col items-center gap-2">
              <QRCodeSVG value={generatedQrBooking.bookingId} size={140} />
              <div className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mt-1">
                PASS_ID: {generatedQrBooking.bookingId}
              </div>
            </div>

            {/* Booking Details Grid */}
            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 text-left space-y-1.5 text-[11px] mb-5">
              <div className="flex justify-between">
                <span className="text-slate-400 font-semibold">TCS Player Name:</span>
                <span className="text-slate-800 font-bold">{generatedQrBooking.employeeName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-semibold">Employee ID:</span>
                <span className="text-slate-800 font-bold font-mono">{generatedQrBooking.employeeId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-semibold">Verification Channel:</span>
                <span className="text-slate-800 capitalize font-bold">{generatedQrBooking.bookingSource} Desk</span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  showAppToast('Playpass ticket sent to printing queue.', 'success');
                }}
                className="flex-1 py-2.5 border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" /> Print Pass
              </button>
              <button
                onClick={() => setGeneratedQrBooking(null)}
                className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Close Pass
              </button>
            </div>
          </div>
      </Modal>
    )}

    {/* Profile & Settings Modal Dialog */}
    {isSettingsOpen && (
      <div
        id="security_settings_modal"
        role="dialog"
        aria-modal="true"
        aria-label="Profile and settings"
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in text-slate-800"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) {
            setIsSettingsOpen(false);
            setProfileError('');
            setProfileSuccess('');
            setPasswordError('');
            setPasswordSuccess('');
          }
        }}
      >
        <div className="bg-white rounded-3xl max-w-4xl w-full border border-slate-200 shadow-2xl overflow-hidden animate-scale-in flex flex-col md:flex-row max-h-[90vh] overflow-y-auto">
          
          {/* Left Panel: Profile Details */}
          <div className="flex-1 p-8 border-b md:border-b-0 md:border-r border-slate-200">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="font-display font-bold text-slate-900 text-lg">My Profile</h3>
                <p className="text-xs text-slate-500 mt-0.5">Manage your officer details and credentials.</p>
              </div>
              <button
                onClick={() => {
                  setIsSettingsOpen(false);
                  setProfileError('');
                  setProfileSuccess('');
                }}
                className="text-slate-400 hover:text-slate-650 font-bold md:hidden"
              >
                ✕
              </button>
            </div>

            {profileError && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold rounded-xl">
                {profileError}
              </div>
            )}

            {profileSuccess && (
              <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold rounded-xl">
                {profileSuccess}
              </div>
            )}

            <form onSubmit={handleProfileUpdate} className="space-y-4">
              {/* Profile Picture Upload */}
              <div className="flex items-center gap-4 pb-4 border-b border-slate-100">
                <div className="relative">
                  {profileAvatar ? (
                    <img src={profileAvatar} className="w-16 h-16 rounded-full object-cover border border-slate-200 shadow" alt="Profile" />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-blue-100 text-[#003366] flex items-center justify-center font-bold text-xl border border-slate-200 shadow">
                      {profileName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <label className="absolute bottom-0 right-0 w-6 h-6 rounded-full bg-slate-800 text-white flex items-center justify-center cursor-pointer shadow hover:bg-slate-700 transition-colors">
                    <Download className="w-3.5 h-3.5 rotate-180" />
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarChange}
                      className="hidden"
                    />
                  </label>
                </div>
                <div>
                  <h4 className="font-bold text-slate-850 text-xs">Profile Picture</h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">PNG or JPG. Max 250KB.</p>
                  {profileAvatar && (
                    <button
                      type="button"
                      onClick={() => setProfileAvatar('')}
                      className="text-[10px] font-bold text-rose-600 hover:text-rose-700 cursor-pointer block mt-1"
                    >
                      Remove Picture
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 uppercase tracking-wider mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    className="block w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-950 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 uppercase tracking-wider mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={profileEmail}
                    onChange={(e) => setProfileEmail(e.target.value)}
                    className="block w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-950 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 uppercase tracking-wider mb-1">
                    Mobile Number
                  </label>
                  <input
                    type="text"
                    value={profilePhone}
                    onChange={(e) => setProfilePhone(e.target.value)}
                    className="block w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-950 font-medium"
                    placeholder="Optional"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Security ID (Read-only)
                  </label>
                  <input
                    type="text"
                    disabled
                    value={user.employeeId}
                    className="block w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs text-slate-400 font-mono font-bold"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <button
                  type="submit"
                  className={`px-5 py-2 ${THEMES[theme]?.primaryBtn || 'bg-[#003366] hover:bg-blue-900'} text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-sm uppercase tracking-wider`}
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>

          {/* Right Panel: Password & Theme Preferences */}
          <div className="w-full md:w-[320px] bg-slate-50/60 p-8 flex flex-col justify-between">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-display font-bold text-slate-900 text-base">Security & Preferences</h3>
              <button
                onClick={() => {
                  setIsSettingsOpen(false);
                  setPasswordError('');
                  setPasswordSuccess('');
                }}
                className="text-slate-400 hover:text-slate-600 font-bold hidden md:block"
              >
                ✕
              </button>
            </div>

            <div className="space-y-6 grow">
              {/* Password Change Sub-section */}
              <div>
                <h4 className="font-bold text-slate-800 text-xs mb-2">Change Password</h4>
                {passwordError && (
                  <div className="mb-2.5 p-2 bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-semibold rounded-lg">
                    {passwordError}
                  </div>
                )}
                {passwordSuccess && (
                  <div className="mb-2.5 p-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-semibold rounded-lg">
                    {passwordSuccess}
                  </div>
                )}

                <form onSubmit={handlePasswordChange} className="space-y-2">
                  <input
                    type="password"
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="block w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-[11px] focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-950"
                    placeholder="Current Password"
                  />
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="block w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-[11px] focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-950"
                    placeholder="New Password (6+ chars)"
                  />
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="block w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-[11px] focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-950"
                    placeholder="Confirm New Password"
                  />
                  <button
                    type="submit"
                    className={`w-full py-2 ${THEMES[theme]?.primaryBtn || 'bg-[#003366] hover:bg-blue-900'} text-white text-[10px] font-bold rounded-lg transition-colors cursor-pointer shadow-sm uppercase tracking-wider`}
                  >
                    Update Password
                  </button>
                </form>
              </div>

              {/* Theme Preferences Sub-section */}
              <div className="border-t border-slate-200 pt-4">
                <h4 className="font-bold text-slate-800 text-xs mb-2">Gatekeeper Header Theme</h4>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleThemeChange('blue')}
                    className={`p-2 rounded-xl border text-center flex flex-col items-center gap-1 cursor-pointer transition-all ${
                      theme === 'blue' ? 'border-[#003366] bg-blue-50 text-[#003366] font-bold' : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    <div className="w-4 h-4 rounded-full bg-[#003366] border border-white/20 shadow-sm"></div>
                    <span className="text-[9px]">TCS Blue</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleThemeChange('dark')}
                    className={`p-2 rounded-xl border text-center flex flex-col items-center gap-1 cursor-pointer transition-all ${
                      theme === 'dark' ? 'border-slate-850 bg-slate-100 text-slate-950 font-bold' : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    <div className="w-4 h-4 rounded-full bg-[#0f172a] border border-white/20 shadow-sm"></div>
                    <span className="text-[9px]">Midnight</span>
                  </button>
                </div>
              </div>
            </div>

          </div>

        </div>
      </div>
    )}
    <AIChatAssistant user={user} />
  </div>
);
}
