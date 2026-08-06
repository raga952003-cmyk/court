/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { db } from '../lib/database';
import { User, Booking, Facility, SlotTime, SportType, WaitlistEntry, BookingInvite } from '../types';
import { DEFAULT_SPORTS, SLOT_TIMES } from '../data/initialData';
import { normalizeLocation } from '../data/tcsLocations';
import { Calendar, RefreshCw, XCircle, Clock, CheckCircle, Activity, Info, AlertTriangle, QrCode, Download, UserPlus } from 'lucide-react';
import NotificationBell from './NotificationBell';
import QRCodeSVG from './QRCodeSVG';
import AIChatAssistant from './AIChatAssistant';
import Modal from './ui/Modal';
import { showAppToast } from './ui/AppToast';
import RaiseConcernForm from './RaiseConcernForm';
import TicketInbox from './TicketInbox';
import {
  formatCampusTime,
  getWallClockIST,
  isDemoSimulatedTimeEnabled,
  isEmployeeOnlineBookingOpen,
  isFacilitiesOpen,
  isSlotPastOrStarted,
  normalizeSlotLabel,
  slotTimeFromHour
} from '../lib/timeWindows';

type PortalTheme = 'blue' | 'dark';
const THEMES: Record<PortalTheme, { navBg: string; primaryBtn: string; text: string }> = {
  blue: { navBg: 'bg-[#003366]', primaryBtn: 'bg-[#003366] hover:bg-blue-900', text: 'text-[#003366]' },
  dark: { navBg: 'bg-[#0f172a]', primaryBtn: 'bg-[#0f172a] hover:bg-slate-900', text: 'text-[#0f172a]' }
};
function readPortalTheme(): PortalTheme {
  return localStorage.getItem('playsmart_theme') === 'dark' ? 'dark' : 'blue';
}

interface EmployeeDashboardProps {
  user: User;
  onLogout: () => void;
  onUpdateUser?: () => void;
}

export default function EmployeeDashboard({ user, onLogout, onUpdateUser }: EmployeeDashboardProps) {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [myInvites, setMyInvites] = useState<BookingInvite[]>([]);
  const [pendingInvites, setPendingInvites] = useState<BookingInvite[]>([]);
  const [nowTs, setNowTs] = useState(Date.now());
  const [selectedSport, setSelectedSport] = useState<SportType>('Badminton');
  const [locationSports, setLocationSports] = useState<SportType[]>([...DEFAULT_SPORTS]);
  /** Live campus clock for freeze/availability — not stuck on async refresh */
  const [simTime, setSimTime] = useState(() => getWallClockIST());
  const [activeTab, setActiveTab] = useState<'availability' | 'my_bookings' | 'profile' | 'concerns'>('availability');

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

  // Password change states
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  // Profile update states
  const [profileName, setProfileName] = useState(user.name);
  const [profileEmail, setProfileEmail] = useState(user.email);
  const [profilePhone, setProfilePhone] = useState(user.phoneNumber || '');
  const [profileAvatar, setProfileAvatar] = useState(user.avatar || '');
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');

  // Theme state
  const [theme, setTheme] = useState<PortalTheme>(readPortalTheme);
  
  // Modals
  const [bookingModal, setBookingModal] = useState<{ facility: Facility; slot: SlotTime } | null>(null);
  const [inviteRows, setInviteRows] = useState<Array<{ employeeId: string; name: string }>>([
    { employeeId: '', name: '' }
  ]);
  const [qrModal, setQrModal] = useState<Booking | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [inviteActionMsg, setInviteActionMsg] = useState('');
  const [pendingConfirm, setPendingConfirm] = useState<{
    title: string;
    message: string;
    confirmLabel?: string;
    danger?: boolean;
    onConfirm: () => void | Promise<void>;
  } | null>(null);

  useEffect(() => {
    if (!bookingModal) return;
    setInviteRows([{ employeeId: '', name: '' }]);
    setErrorMsg('');
    // Reset invite form only when opening a different court/slot — not on every re-render
  }, [bookingModal?.facility.facilityId, bookingModal?.slot]);

  // Keep campus clock ticking independently so past-slot freeze never depends on a failed API refresh
  useEffect(() => {
    const tick = () => {
      setNowTs(Date.now());
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

  const refreshData = async () => {
    try {
      const userLocation = normalizeLocation(user.businessUnit) || 'Chennai, India';
      const [facs, books, wlist, slots, capacities, invites, allPending, sports] = await Promise.all([
        db.getFacilities(userLocation),
        db.getBookings(),
        db.getWaitlist(),
        db.getSlotTimes(userLocation),
        db.getSportCapacities(userLocation),
        db.getInvitesForEmployee(user.employeeId),
        db.getAllPendingInvites(),
        db.getLocationSports(userLocation)
      ]);
      setFacilities(facs);
      setBookings(books);
      setWaitlist(wlist);
      setSlotTimes(slots);
      setSportCapacities(capacities);
      setLocationSports(sports);
      if (sports.length > 0 && !sports.some(s => s.toLowerCase() === selectedSport.toLowerCase())) {
        setSelectedSport(sports[0]);
      }
      setMyInvites(invites);
      setPendingInvites(allPending);
      // Clock is owned by the tick effect; still sync once on successful refresh in demo mode
      if (isDemoSimulatedTimeEnabled()) {
        const time = await db.getSimulatedTime();
        setSimTime(time);
      } else {
        setSimTime(getWallClockIST());
      }
    } catch (e) {
      console.error('Error refreshing dashboard data:', e);
      // Never leave freeze clock stuck if data refresh fails
      if (!isDemoSimulatedTimeEnabled()) setSimTime(getWallClockIST());
    }
  };

  useEffect(() => {
    refreshData();

    let lastFacilityToastAt = 0;
    const toastFacilitiesUpdated = () => {
      const now = Date.now();
      if (now - lastFacilityToastAt < 4000) return;
      lastFacilityToastAt = now;
      showAppToast('Courts and facilities updated for your campus.', 'info');
    };

    const handleStorageUpdate = (e?: Event) => {
      refreshData();
      setTheme(readPortalTheme());
      const key = (e as StorageEvent | undefined)?.key;
      if (key === 'playsmart_facilities_rev') {
        toastFacilitiesUpdated();
      }
    };
    const handleTimeChange = () => refreshData();
    const handleSlotsChange = () => refreshData();
    const handleCapacitiesChange = () => refreshData();
    const handleFacilitiesChange = () => {
      refreshData();
      toastFacilitiesUpdated();
    };
    const handleSportsChange = () => refreshData();

    window.addEventListener('storage', handleStorageUpdate);
    window.addEventListener('simulated_time_change', handleTimeChange);
    window.addEventListener('slot_times_change', handleSlotsChange);
    window.addEventListener('sport_capacities_change', handleCapacitiesChange);
    window.addEventListener('facilities_change', handleFacilitiesChange);
    window.addEventListener('location_sports_change', handleSportsChange);

    const interval = setInterval(() => {
      // Don't refresh while the booking modal is open — avoids input focus/state jank
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      refreshData();
    }, 2500);

    return () => {
      window.removeEventListener('storage', handleStorageUpdate);
      window.removeEventListener('simulated_time_change', handleTimeChange);
      window.removeEventListener('slot_times_change', handleSlotsChange);
      window.removeEventListener('sport_capacities_change', handleCapacitiesChange);
      window.removeEventListener('facilities_change', handleFacilitiesChange);
      window.removeEventListener('location_sports_change', handleSportsChange);
      clearInterval(interval);
    };
  }, []);

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

  const currentSlot = slotTimeFromHour(simTime.hour);

  const SPORT_CAPACITIES = sportCapacities;

  const sameSport = (a?: string | null, b?: string | null) =>
    String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

  /** Only sports that have courts at this campus — matches admin facility config. */
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

  useEffect(() => {
    if (displaySports.length === 0) return;
    if (!displaySports.some(s => sameSport(s, selectedSport))) {
      setSelectedSport(displaySports[0]);
    }
  }, [displaySports.join('|'), selectedSport]);

  const getCourtCapacity = (facility: Facility) =>
    facility.playerCapacity && facility.playerCapacity > 0
      ? facility.playerCapacity
      : SPORT_CAPACITIES[facility.sport] ||
        SPORT_CAPACITIES[
          Object.keys(SPORT_CAPACITIES).find(k => sameSport(k, facility.sport)) || ''
        ] ||
        4;

  const sameSlot = (a: string, b: string) => normalizeSlotLabel(a) === normalizeSlotLabel(b);

  const getOccupiedCount = (facilityId: string, slot: SlotTime) => {
    const confirmed = bookings.filter(
      b => b.facilityId === facilityId && sameSlot(b.slotTime, slot) && b.status !== 'cancelled'
    ).length;
    const reserved = pendingInvites.filter(
      i => i.facilityId === facilityId && sameSlot(i.slotTime, slot) && i.status === 'pending'
    ).length;
    return confirmed + reserved;
  };

  // Compute status for a given facility & slot (includes pending invite seat reservations + current time)
  const getSlotStatus = (
    facilityId: string,
    slot: SlotTime
  ): 'available' | 'booked' | 'playing' | 'maintenance' | 'past' | 'locked' => {
    const facility = facilities.find(f => f.facilityId === facilityId);
    if (!facility || facility.status === 'maintenance') return 'maintenance';
    // Time freeze: started/ended slots + outside operating hours
    if (!isFacilitiesOpen(simTime) || isSlotPastOrStarted(slot, simTime)) return 'past';

    const slotBookings = bookings.filter(
      b => b.facilityId === facilityId && sameSlot(b.slotTime, slot) && b.status !== 'cancelled'
    );
    const capacity = getCourtCapacity(facility);
    const occupied = getOccupiedCount(facilityId, slot);

    if (occupied >= capacity) {
      const isAnyCheckedIn = slotBookings.some(b => b.status === 'checked_in');
      if (isAnyCheckedIn) return 'playing';
      return 'booked';
    }

    // Free seat but employee online window is closed (security can still assist 5 AM–8 PM)
    if (!isEmployeeOnlineBookingOpen(simTime)) return 'locked';

    return 'available';
  };

  const getInviteRemainingMs = (expiresAt: string) =>
    Math.max(0, new Date(expiresAt).getTime() - nowTs);

  const formatInviteCountdown = (expiresAt: string) => {
    const remaining = getInviteRemainingMs(expiresAt);
    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleAcceptInvite = async (inviteId: string) => {
    setInviteActionMsg('');
    const res = await db.acceptInvite(inviteId, user.employeeId);
    if (res.success) {
      setInviteActionMsg('Invite accepted. Your seat is confirmed.');
      refreshData();
    } else {
      setInviteActionMsg(res.error || 'Failed to accept invite.');
      refreshData();
    }
  };

  const handleRejectInvite = async (inviteId: string) => {
    setInviteActionMsg('');
    const res = await db.rejectInvite(inviteId, user.employeeId);
    if (res.success) {
      setInviteActionMsg('Invite rejected. Seat released.');
      refreshData();
    } else {
      setInviteActionMsg(res.error || 'Failed to reject invite.');
      refreshData();
    }
  };

  // Helper to get booking details for a cell
  const getSlotBooking = (facilityId: string, slot: SlotTime): Booking | undefined => {
    return bookings.find(b => b.facilityId === facilityId && sameSlot(b.slotTime, slot) && b.status !== 'cancelled' && b.employeeId === user.employeeId);
  };

  // Live card counts for the current hour — occupancy only (do not treat past/locked as booked)
  const getSportStats = (sport: SportType) => {
    const sportFacs = facilities.filter(f => sameSport(f.sport, sport));
    const totalCourts = sportFacs.length;

    let available = 0;
    let booked = 0;
    let playing = 0;
    let maintenance = 0;

    sportFacs.forEach(f => {
      if (f.status === 'maintenance') {
        maintenance++;
        return;
      }

      // Outside facility hours — leave counts at 0 (do not fake every court as booked)
      if (currentSlot === 'none') return;

      const slotBookings = bookings.filter(
        b => b.facilityId === f.facilityId && sameSlot(b.slotTime, currentSlot) && b.status !== 'cancelled'
      );
      const capacity = getCourtCapacity(f);
      const occupied = getOccupiedCount(f.facilityId, currentSlot);

      if (occupied >= capacity) {
        if (slotBookings.some(b => b.status === 'checked_in')) playing++;
        else booked++;
      } else {
        available++;
      }
    });

    return { totalCourts, available, booked, playing, maintenance };
  };

  const handleCreateBooking = async () => {
    if (!bookingModal) return;
    setErrorMsg('');

    const additionalPlayers = inviteRows
      .map(r => ({ employeeId: r.employeeId.trim().toUpperCase(), name: r.name.trim() }))
      .filter(r => r.employeeId);

    for (const p of additionalPlayers) {
      if (!p.name) {
        setErrorMsg(`Enter the registered name for Employee ID ${p.employeeId}.`);
        return;
      }
    }

    const res = await db.createBooking({
      employeeId: user.employeeId,
      email: user.email,
      facilityId: bookingModal.facility.facilityId,
      slotTime: bookingModal.slot,
      bookingSource: 'online',
      additionalPlayers
    });

    if (res.success) {
      setBookingModal(null);
      if (res.invitesSent && res.invitesSent > 0) {
        showAppToast(
          `Booking confirmed. ${res.invitesSent} invite(s) sent. Invitees have 5 minutes to Accept.`,
          'success'
        );
      } else {
        showAppToast('Booking confirmed. Your seat is reserved.', 'success');
      }
      refreshData();
    } else {
      setErrorMsg(res.error || 'Failed to complete booking.');
    }
  };

  const handleCancelBooking = (bookingId: string) => {
    setPendingConfirm({
      title: 'Cancel this booking?',
      message: 'This slot will immediately become available to others.',
      confirmLabel: 'Cancel booking',
      danger: true,
      onConfirm: async () => {
        const res = await db.cancelBooking(bookingId);
        setPendingConfirm(null);
        if (res.success) {
          showAppToast('Booking cancelled.', 'info');
          refreshData();
        } else {
          showAppToast(res.error || 'Failed to cancel booking.', 'error');
        }
      }
    });
  };

  const handleJoinWaitlist = async (facility: Facility, slot: SlotTime) => {
    setErrorMsg('');
    const res = await db.joinWaitlist(user.employeeId, facility.facilityId, slot);
    if (res.success) {
      setBookingModal(null);
      refreshData();
    } else {
      setErrorMsg(res.error || 'Failed to join waitlist.');
    }
  };

  const handleLeaveWaitlist = (waitlistId: string) => {
    setPendingConfirm({
      title: 'Leave waitlist?',
      message: 'You will lose your place in line for this slot.',
      confirmLabel: 'Leave waitlist',
      danger: true,
      onConfirm: async () => {
        const res = await db.leaveWaitlist(waitlistId);
        setPendingConfirm(null);
        if (res.success) {
          showAppToast('You left the waitlist.', 'info');
          refreshData();
        } else {
          showAppToast('Failed to leave waitlist.', 'error');
        }
      }
    });
  };

  const isWaitlisted = (facilityId: string, slot: SlotTime): boolean => {
    return waitlist.some(w => w.employeeId === user.employeeId && w.facilityId === facilityId && w.slotTime === slot);
  };

  const getWaitlistCount = (facilityId: string, slot: SlotTime): number => {
    return waitlist.filter(w => w.facilityId === facilityId && w.slotTime === slot).length;
  };

  const myActiveBookings = bookings.filter(b => 
    b.employeeId === user.employeeId && 
    b.status !== 'cancelled'
  );
  const myBookingHistory = bookings.filter(b => 
    b.employeeId === user.employeeId
  );
  const myActiveWaitlist = waitlist.filter(w => w.employeeId === user.employeeId);

  // Quick check-in is security-only — employees only show the PlayPass at the gate

  const isOnlineBookingOpen = isEmployeeOnlineBookingOpen(simTime);
  // Morning / evening: employees cannot self-book, but security desk can assist while facilities are open
  const isSecurityBookingOnly = isFacilitiesOpen(simTime) && !isOnlineBookingOpen;

  return (
    <div id="employee_dashboard" className="min-h-screen tcs-campus-bg text-slate-800 flex flex-col">
      {/* Top Corporate Nav */}
      <nav className={`${THEMES[theme]?.navBg || 'bg-[#003366]'} text-white py-3 px-3 sm:px-6 lg:px-8 shadow-sm transition-all duration-300`}>
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <img src="/tcs_logo.png" className="h-7 sm:h-8 w-auto shrink-0 object-contain bg-white/95 rounded px-1.5 py-0.5" alt="TCS" />
            <div className="min-w-0">
              <span className="font-display font-bold text-sm sm:text-lg text-white block leading-tight truncate">
                TCS Play-Smart
              </span>
              <span className="text-[10px] text-blue-200 font-semibold uppercase tracking-wider block truncate">
                Employee · {user.businessUnit || 'Campus'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            {/* Real-time sync notifications */}
            <NotificationBell employeeId={user.employeeId} variant="onDark" />

            <div className="flex items-center gap-2 text-right">
              {user.avatar ? (
                <img src={user.avatar} className="w-7 h-7 rounded-full object-cover border border-white/25 shadow-sm" alt="Avatar" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center font-bold text-xs text-white border border-white/25 shadow-sm">
                  {user.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="hidden sm:block">
                <span className="text-xs font-semibold text-white block text-left">{user.name}</span>
                <span className="text-[10px] text-blue-200/80 font-mono block text-left">
                  Emp ID: {user.employeeId}
                  {user.phoneNumber ? ` · ${user.phoneNumber}` : ''}
                </span>
              </div>
            </div>

            <button
              id="emp_logout_btn"
              onClick={onLogout}
              className="px-2.5 sm:px-3 py-1.5 text-xs font-bold text-rose-300 hover:text-white hover:bg-rose-600 rounded-lg border border-rose-500/20 transition-colors cursor-pointer"
            >
              <span className="sm:hidden">Out</span>
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </nav>

      <main className="grow max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8">
        {/* Welcome Block */}
        <div className={`${THEMES[theme]?.navBg || 'bg-[#003366]'} text-white rounded-2xl p-4 sm:p-6 shadow-sm mb-4 sm:mb-6 border border-black/10 transition-all duration-300`}>
          <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight">Welcome back, {user.name}!</h1>
          <p className="text-blue-100/90 text-xs sm:text-sm mt-1 max-w-2xl font-sans">
            TCS Play-Smart employee hub for{' '}
            <span className="font-semibold text-white">{user.businessUnit || 'your location'}</span>.
            Book courts, manage invites, and track your slots at this campus only.
          </p>
        </div>

        {/* Pending match invites — Accept / Reject within 5 minutes */}
        {(() => {
          const pendingMine = myInvites.filter(i => i.status === 'pending' && new Date(i.expiresAt).getTime() > nowTs);
          if (pendingMine.length === 0) return null;
          return (
            <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 mb-6 shadow-md space-y-3 ring-2 ring-amber-200/60">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <p className="font-bold text-sm uppercase tracking-wider text-amber-950">Action needed · Match invites</p>
                  <p className="text-[11px] text-amber-800 mt-0.5">Accept within 5 minutes or your reserved seat is released.</p>
                </div>
                {inviteActionMsg && <p className="text-[11px] text-amber-900 font-semibold bg-white/70 px-2 py-1 rounded-lg">{inviteActionMsg}</p>}
              </div>
              {pendingMine.map(inv => {
                const remainingMs = getInviteRemainingMs(inv.expiresAt);
                const urgent = remainingMs <= 60000;
                return (
                  <div
                    key={inv.inviteId}
                    className={`bg-white rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-2 ${
                      urgent ? 'border-rose-400 animate-pulse' : 'border-amber-200'
                    }`}
                  >
                    <div className="text-sm text-slate-700 min-w-0">
                      <p className="font-bold text-slate-900 text-base">{inv.sport} · {inv.courtName}</p>
                      <p className="text-slate-600 text-xs mt-0.5 font-mono">{inv.slotTime}</p>
                      <p className="text-slate-500 text-xs mt-1">
                        From organizer <span className="font-mono font-semibold">{inv.organizerEmployeeId}</span>
                      </p>
                      <div className={`mt-2 inline-flex items-baseline gap-2 rounded-xl px-3 py-1.5 ${
                        urgent ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-900'
                      }`}>
                        <span className="text-[10px] font-bold uppercase tracking-wider">Expires in</span>
                        <span className="font-mono font-black text-2xl tabular-nums leading-none">
                          {formatInviteCountdown(inv.expiresAt)}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={() => handleAcceptInvite(inv.inviteId)}
                        className="flex-1 sm:flex-none px-5 py-3 text-sm font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer shadow-md"
                      >
                        Accept invite
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRejectInvite(inv.inviteId)}
                        className="flex-1 sm:flex-none px-4 py-3 text-sm font-bold rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* Dynamic Warning Banners (Section 3.1 Banners) */}
        {isSecurityBookingOnly && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-2xl mb-6 flex items-start gap-3 shadow-sm animate-fade-in">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-xs uppercase tracking-wider">Direct Online Booking is Locked</p>
              <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
                Online self-booking is frozen right now — self-service is 10:00 AM – 8:00 PM.
                Visit the Security desk for assisted booking anytime facilities are open (5:00 AM – 8:00 PM). 
                You can still browse current court grids, but bookings can only be placed on your behalf by physical walk-in at the security gate desk.
              </p>
            </div>
          </div>
        )}

        {(simTime.hour < 6 || simTime.hour >= 20) && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-2xl mb-6 flex items-start gap-3 shadow-sm animate-fade-in">
            <XCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-xs uppercase tracking-wider">Sports Facilities Closed</p>
              <p className="text-xs text-rose-700 mt-0.5 leading-relaxed">
                The campus sports facilities are closed. System slot reservations are locked outside operating hours (6:00 AM – 8:00 PM).
              </p>
            </div>
          </div>
        )}

        {isOnlineBookingOpen && (
          <div className="bg-emerald-50 border border-emerald-250 text-emerald-800 p-4 rounded-2xl mb-6 flex items-start gap-3 shadow-sm animate-fade-in">
            <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-xs uppercase tracking-wider">Employee Self Booking Active</p>
              <p className="text-xs text-emerald-700 mt-0.5 leading-relaxed">
                Direct online self-service booking is active until 8:00 PM. Past time slots are locked; only future open cells can be booked.
              </p>
            </div>
          </div>
        )}

        {/* Navigation Tabs — horizontal scroll on small screens */}
        <div className="flex border-b border-slate-200 mb-6 gap-1 overflow-x-auto scrollbar-thin -mx-1 px-1">
          <button
            id="tab_availability_btn"
            onClick={() => setActiveTab('availability')}
            className={`pb-3 px-3 sm:px-4 font-display font-semibold text-sm border-b-2 cursor-pointer transition-all whitespace-nowrap shrink-0 ${
              activeTab === 'availability' ? `${THEMES[theme]?.text || 'text-[#003366]'} border-current` : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Today's Availability
          </button>
          <button
            id="tab_my_bookings_btn"
            onClick={() => setActiveTab('my_bookings')}
            className={`pb-3 px-3 sm:px-4 font-display font-semibold text-sm border-b-2 cursor-pointer transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              activeTab === 'my_bookings' ? `${THEMES[theme]?.text || 'text-[#003366]'} border-current` : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            My Bookings & History
            {(myActiveBookings.length > 0 || myInvites.some(i => i.status === 'pending')) && (
              <span className={`text-white font-mono text-[10px] px-1.5 py-0.5 rounded-full font-bold ${THEMES[theme]?.navBg || 'bg-[#003366]'}`}>
                {myActiveBookings.length + myInvites.filter(i => i.status === 'pending').length}
              </span>
            )}
          </button>
          <button
            id="tab_profile_btn"
            onClick={() => setActiveTab('profile')}
            className={`pb-3 px-3 sm:px-4 font-display font-semibold text-sm border-b-2 cursor-pointer transition-all whitespace-nowrap shrink-0 ${
              activeTab === 'profile' ? `${THEMES[theme]?.text || 'text-[#003366]'} border-current` : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            My Profile & Settings
          </button>
          <button
            id="tab_concerns_btn"
            onClick={() => setActiveTab('concerns')}
            className={`pb-3 px-3 sm:px-4 font-display font-semibold text-sm border-b-2 cursor-pointer transition-all whitespace-nowrap shrink-0 ${
              activeTab === 'concerns' ? `${THEMES[theme]?.text || 'text-[#003366]'} border-current` : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Raise Concern
          </button>
        </div>

        {activeTab === 'availability' && (
          <div className="space-y-8">
            {/* Dynamic Live Summary Cards (Section 10) */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display font-bold text-lg text-slate-800">
                  Live Sport Court Status <span className="text-xs text-slate-400 font-mono">(Current Hour Slot: {currentSlot !== 'none' ? currentSlot : 'Facilities Closed'})</span>
                </h2>
                <button
                  id="refresh_grid_btn"
                  onClick={refreshData}
                  className="flex items-center gap-1.5 text-xs text-blue-600 font-bold hover:bg-blue-50 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Refresh Live
                </button>
              </div>

              {facilities.length === 0 ? (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center">
                  <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-amber-900">
                    Admin hasn’t configured courts for {user.businessUnit || 'your campus'} yet
                  </p>
                  <p className="text-xs text-amber-800/80 mt-1 max-w-md mx-auto">
                    Ask your location admin to add sports and courts under Facilities &amp; Maintenance.
                    This page updates automatically when they publish changes.
                  </p>
                </div>
              ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {displaySports.map(sport => {
                  const stats = getSportStats(sport);
                  const icons: Record<string, string> = {
                    'Badminton': '🏸',
                    'Basketball': '🏀',
                    'Volleyball': '🏐',
                    'Table Tennis': '🏓',
                    'Carrom': '🎯',
                    'Box Cricket': '🏏',
                  };
                  return (
                    <div key={sport} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg hover:scale-[1.03] hover:border-blue-200 active:scale-[0.99] transition-all duration-300 ease-out cursor-default">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl" role="img" aria-label={sport}>{icons[sport] || '🏟️'}</span>
                          <h3 className="font-display font-bold text-slate-900">{sport}</h3>
                        </div>
                        <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-mono font-bold">
                          {stats.totalCourts} {stats.totalCourts > 1 ? 'Courts' : 'Court'}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 pt-2">
                        <div className="bg-emerald-50 border border-emerald-100 p-2.5 rounded-xl text-center">
                          <p className="text-[10px] text-emerald-700 uppercase tracking-wider font-bold">Available</p>
                          <p className="text-lg font-bold text-emerald-800 font-display mt-0.5">{stats.available}</p>
                        </div>
                        <div className="bg-rose-50 border border-rose-100 p-2.5 rounded-xl text-center">
                          <p className="text-[10px] text-rose-700 uppercase tracking-wider font-bold">Booked</p>
                          <p className="text-lg font-bold text-rose-800 font-display mt-0.5">{stats.booked}</p>
                        </div>
                        <div className="bg-amber-50 border border-amber-100 p-2.5 rounded-xl text-center">
                          <p className="text-[10px] text-amber-700 uppercase tracking-wider font-bold">Playing</p>
                          <p className="text-lg font-bold text-amber-800 font-display mt-0.5">{stats.playing}</p>
                        </div>
                        <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-center">
                          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Maintenance</p>
                          <p className="text-lg font-bold text-slate-700 font-display mt-0.5">{stats.maintenance}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              )}
            </div>

            {/* Timeline Slot Matrix (Section 12 & 13) */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h3 className="font-display font-bold text-slate-900 text-lg">Timeline Slot Matrix</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Explore the full operating window grid (6:00 AM – 8:00 PM). Slots at or before the current campus time are frozen.
                  </p>
                  <p className="text-[11px] font-mono font-bold text-[#003366] mt-1">
                    Campus clock: {formatCampusTime(simTime)}
                    {isDemoSimulatedTimeEnabled() ? ' (demo)' : ''}
                  </p>
                </div>

                {/* Sport Selector — location-specific categories */}
                <div className="flex flex-wrap gap-1.5">
                  {displaySports.map(sport => (
                    <button
                      key={sport}
                      id={`sport_select_${sport.toLowerCase().replace(/\s+/g, '_')}`}
                      onClick={() => setSelectedSport(sport)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        sameSport(selectedSport, sport)
                          ? 'bg-[#003366] text-white shadow-sm'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {sport}
                    </button>
                  ))}
                </div>
              </div>

              {/* Grid instructions — text + color (not color-only) */}
              <div className="flex flex-wrap gap-4 text-[11px] font-bold text-slate-600 mb-3 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 block" aria-hidden />
                  <span>Available — select to book</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 block" aria-hidden />
                  <span>Full — join waitlist</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 block" aria-hidden />
                  <span>Playing — in progress</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-300 block" aria-hidden />
                  <span>Offline — maintenance</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-400 block" aria-hidden />
                  <span>Past — time passed</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-orange-400 block" aria-hidden />
                  <span>Locked — booking window closed</span>
                </div>
              </div>
              <p className="sm:hidden text-[11px] text-slate-500 font-semibold mb-3">
                Swipe sideways to see more time slots →
              </p>

              {/* Responsive Horizontal Scroll Grid */}
              <div className="scroll-x-touch -mx-2 px-2">
                <table className="w-full min-w-[720px] sm:min-w-[1000px] border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="sticky left-0 z-20 bg-white text-left py-3 px-4 font-display font-semibold text-xs text-slate-400 uppercase tracking-wider w-40 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.08)]">
                        Court/Table
                      </th>
                      {slotTimes.map(slot => (
                        <th key={slot} className="text-center py-3 px-2 font-mono text-[10px] text-slate-400 uppercase font-semibold">
                          {slot}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {facilities.filter(f => sameSport(f.sport, selectedSport)).length === 0 && (
                      <tr>
                        <td
                          colSpan={slotTimes.length + 1}
                          className="py-10 px-4 text-center text-xs text-slate-500"
                        >
                          No {selectedSport} courts at {user.businessUnit || 'this campus'} yet.
                          Ask your location admin to add them under Facilities &amp; Maintenance.
                        </td>
                      </tr>
                    )}
                    {facilities
                      .filter(f => sameSport(f.sport, selectedSport))
                      .map(court => (
                        <tr key={court.facilityId} className="hover:bg-slate-50/50 transition-colors">
                          <td className="sticky left-0 z-10 bg-white py-4 px-4 font-display font-bold text-slate-800 text-sm shadow-[2px_0_6px_-2px_rgba(0,0,0,0.08)]">
                            {court.courtName}
                            {court.status === 'maintenance' && (
                              <span className="block text-[10px] text-rose-500 font-normal">Under Maintenance</span>
                            )}
                          </td>
                          {slotTimes.map(slot => {
                            const status = getSlotStatus(court.facilityId, slot);
                            const slotBookings = bookings.filter(b => b.facilityId === court.facilityId && sameSlot(b.slotTime, slot) && b.status !== 'cancelled');
                            const capacity = getCourtCapacity(court);
                            const occupied = getOccupiedCount(court.facilityId, slot);
                            const isRegisteredInSlot = slotBookings.some(b => b.employeeId === user.employeeId);
                            const userWaitlisted = isWaitlisted(court.facilityId, slot);
                            const waitlistCount = getWaitlistCount(court.facilityId, slot);

                            let btnStyle = '';
                            let label = '';
                            // Joined bookings stay openable; past/maintenance/locked empty cells stay frozen
                            const isFrozen =
                              status === 'maintenance' ||
                              status === 'past' ||
                              (status === 'locked' && !isRegisteredInSlot);
                            if (status === 'maintenance') {
                              btnStyle = 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed';
                              label = 'Offline';
                            } else if (status === 'past' && !isRegisteredInSlot) {
                              btnStyle = 'bg-slate-200 text-slate-500 border-slate-300 cursor-not-allowed';
                              label = 'Past';
                            } else if (isRegisteredInSlot) {
                              btnStyle = 'bg-blue-50 border-blue-200 text-blue-700 font-bold hover:bg-blue-100/70 cursor-pointer';
                              label = `Joined (${occupied}/${capacity})`;
                            } else if (status === 'locked') {
                              btnStyle = 'bg-orange-50 text-orange-700 border-orange-200 cursor-not-allowed';
                              label = isSecurityBookingOnly ? 'Desk only' : 'Locked';
                            } else if (status === 'booked') {
                              if (userWaitlisted) {
                                btnStyle = 'bg-amber-50 border-amber-200 text-amber-700 font-bold hover:bg-amber-100 cursor-pointer';
                                label = `Waitlisted (${waitlistCount})`;
                              } else {
                                btnStyle = 'bg-rose-50 border-rose-100 text-rose-600 hover:bg-rose-100/50 cursor-pointer';
                                label = waitlistCount > 0 ? `Waitlist (${waitlistCount})` : 'Join Waitlist';
                              }
                            } else if (status === 'playing') {
                              if (userWaitlisted) {
                                btnStyle = 'bg-amber-50 border-amber-200 text-amber-700 font-bold hover:bg-amber-100 cursor-pointer';
                                label = `Waitlisted (${waitlistCount})`;
                              } else {
                                btnStyle = 'bg-amber-50 border-amber-100 text-amber-600 hover:bg-amber-100/50 cursor-pointer';
                                label = waitlistCount > 0 ? `Waitlist (${waitlistCount})` : 'Join Waitlist';
                              }
                            } else {
                              btnStyle = 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-300 font-bold cursor-pointer';
                              label = `Book (${occupied}/${capacity})`;
                            }

                            return (
                              <td key={slot} className="p-2 text-center">
                                <button
                                  id={`slot_btn_${court.facilityId}_${slot.replace(/[\s-]/g, '_')}`}
                                  disabled={isFrozen}
                                  onClick={() => {
                                    if (isFrozen) return;
                                    setBookingModal({ facility: court, slot });
                                  }}
                                  aria-label={`${court.courtName} ${slot}: ${label}`}
                                  className={`w-full py-2.5 px-1 rounded-xl text-[11px] border transition-all ${btnStyle}`}
                                >
                                  {label}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'my_bookings' && (
          /* My Bookings Tab (Section 10) */
          <div className="space-y-6">
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
              <h3 className="font-display font-bold text-slate-900 text-lg mb-4">Active Reservations</h3>

              {myActiveBookings.length === 0 ? (
                <div className="p-12 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <Calendar className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-slate-700">No Active Bookings Today</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">Explore available time slots in the timeline matrix to secure your court booking.</p>
                  <button
                    onClick={() => setActiveTab('availability')}
                    className="mt-4 px-4 py-2 bg-blue-600 text-white font-bold text-xs rounded-xl hover:bg-blue-700 cursor-pointer"
                  >
                    View Slots Grid
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {myActiveBookings.map(b => (
                    <div key={b.bookingId} className="border border-slate-200 p-5 rounded-2xl hover:border-blue-300 transition-all bg-white relative overflow-hidden flex flex-col justify-between">
                      <div className="absolute top-0 right-0 p-3">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${
                          b.status === 'checked_in' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                        }`}>
                          {b.status === 'checked_in' ? 'Playing' : 'Confirmed'}
                        </span>
                      </div>

                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-2xl">🏸</span>
                          <h4 className="font-display font-bold text-slate-900 text-base">{b.sport}</h4>
                        </div>
                        <p className="text-xs text-slate-500 font-semibold mb-1">
                          Court: <span className="text-slate-800 font-bold">{b.courtName}</span>
                        </p>
                        <p className="text-xs text-slate-500 font-semibold mb-1">
                          Time Slot: <span className="text-slate-800 font-bold font-mono">{b.slotTime}</span>
                        </p>
                        <p className="text-[10px] text-slate-400 mt-2">
                          Source: <span className="capitalize font-mono">{b.bookingSource} Booking</span>
                        </p>
                        {(() => {
                          const matchPlayers = bookings.filter(m => m.facilityId === b.facilityId && m.slotTime === b.slotTime && m.status !== 'cancelled');
                          return (
                            <div className="mt-2.5 p-2.5 bg-slate-50 border border-slate-100 rounded-xl text-[10.5px]">
                              <span className="font-bold text-slate-500 block uppercase tracking-wider mb-1">Players in Match ({matchPlayers.length}):</span>
                              <div className="space-y-0.5 text-slate-800 font-medium font-mono">
                                {matchPlayers.map((player) => (
                                  <div key={player.bookingId}>
                                    • {player.employeeName} {player.employeeId === user.employeeId ? '(You)' : `(${player.employeeId})`}
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })()}
                      </div>

                      <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
                        {b.status !== 'checked_in' && (
                          <button
                            id={`cancel_my_booking_${b.bookingId}`}
                            onClick={() => handleCancelBooking(b.bookingId)}
                            className="flex items-center gap-1 text-xs font-bold text-rose-600 hover:bg-rose-50 px-3 py-2 rounded-xl border border-rose-100 cursor-pointer"
                          >
                            <XCircle className="w-4 h-4" /> Cancel Booking
                          </button>
                        )}
                        <button
                          id={`show_qr_${b.bookingId}`}
                          onClick={() => setQrModal(b)}
                          className="flex items-center gap-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-xl ml-auto cursor-pointer"
                        >
                          <QrCode className="w-4 h-4" /> Check-In QR Pass
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Active Waitlist Requests Card */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
              <h3 className="font-display font-bold text-slate-900 text-lg mb-1 flex items-center gap-2">
                Active Waitlist Requests <span className="bg-amber-100 text-amber-800 font-mono text-[10px] px-2 py-0.5 rounded-full font-bold">⏳ {myActiveWaitlist.length}</span>
              </h3>
              <p className="text-xs text-slate-500 mb-4">If another employee cancels their booking for that specific slot, you will be automatically promoted and notified.</p>

              {myActiveWaitlist.length === 0 ? (
                <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <p className="text-sm font-semibold text-slate-700">No Active Waitlists</p>
                  <p className="text-xs text-slate-400 mt-1">Join a waitlist from the timeline slot matrix for fully booked courts.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {myActiveWaitlist.map(w => (
                    <div key={w.waitlistId} className="border border-slate-200 p-5 rounded-2xl hover:border-amber-300 transition-all bg-white relative overflow-hidden flex flex-col justify-between border-l-4 border-l-amber-500 shadow-sm">
                      <div className="absolute top-0 right-0 p-3">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse"></span>
                          Waitlisted
                        </span>
                      </div>

                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-2xl">⏳</span>
                          <h4 className="font-display font-bold text-slate-900 text-base">{w.sport}</h4>
                        </div>
                        <p className="text-xs text-slate-500 font-semibold mb-1">
                          Court: <span className="text-slate-800 font-bold">{w.courtName}</span>
                        </p>
                        <p className="text-xs text-slate-500 font-semibold mb-1">
                          Time Slot: <span className="text-slate-800 font-bold font-mono">{w.slotTime}</span>
                        </p>
                        <p className="text-[10px] text-slate-400 mt-2">
                          Joined Waitlist: {new Date(w.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>

                      <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
                        <button
                          id={`leave_waitlist_btn_${w.waitlistId}`}
                          onClick={() => handleLeaveWaitlist(w.waitlistId)}
                          className="flex items-center gap-1 text-xs font-bold text-rose-600 hover:bg-rose-50 px-3 py-2 rounded-xl border border-rose-100 cursor-pointer"
                        >
                          <XCircle className="w-4 h-4" /> Leave Waitlist
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Booking History logs */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
              <h3 className="font-display font-bold text-slate-900 text-lg mb-4">Your Booking History</h3>
              {myBookingHistory.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">No booking history available.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-500">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-400 font-semibold uppercase tracking-wider">
                        <th className="py-2 px-3">Sport</th>
                        <th className="py-2 px-3">Location</th>
                        <th className="py-2 px-3">Slot Time</th>
                        <th className="py-2 px-3">Channel</th>
                        <th className="py-2 px-3">Status</th>
                        <th className="py-2 px-3">Created</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {myBookingHistory.map(b => (
                        <tr key={b.bookingId} className="hover:bg-slate-50/30">
                          <td className="py-2.5 px-3 font-semibold text-slate-800">{b.sport}</td>
                          <td className="py-2.5 px-3 font-medium text-slate-700">{b.courtName}</td>
                          <td className="py-2.5 px-3 font-mono font-bold text-slate-700">{b.slotTime}</td>
                          <td className="py-2.5 px-3 capitalize font-mono text-[10px]">{b.bookingSource}</td>
                          <td className="py-2.5 px-3">
                            <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              b.status === 'checked_in' ? 'bg-amber-100 text-amber-800' :
                              b.status === 'no_show' ? 'bg-rose-100 text-rose-800' :
                              b.status === 'cancelled' ? 'bg-slate-100 text-slate-500' :
                              'bg-emerald-100 text-emerald-800'
                            }`}>
                              {b.status.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-[10px] font-mono text-slate-400">
                            {new Date(b.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'profile' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Left 2 Columns: Profile Details */}
            <div className="lg:col-span-2 bg-white rounded-3xl p-8 border border-slate-200 shadow-sm">
              <h3 className="font-display font-bold text-slate-900 text-lg mb-1">My Profile</h3>
              <p className="text-xs text-slate-500 mb-6">Manage your personal details, profile picture, and corporate department settings.</p>

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

              <form onSubmit={handleProfileUpdate} className="space-y-6">
                {/* Profile Picture Upload */}
                <div className="flex flex-col sm:flex-row items-center gap-6 pb-6 border-b border-slate-100">
                  <div className="relative">
                    {profileAvatar ? (
                      <img src={profileAvatar} className="w-24 h-24 rounded-full object-cover border-4 border-slate-100 shadow-md" alt="Profile" />
                    ) : (
                      <div className="w-24 h-24 rounded-full bg-blue-100 text-[#003366] flex items-center justify-center font-bold text-3xl border-4 border-slate-100 shadow-md">
                        {profileName.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <label className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center cursor-pointer shadow-md hover:bg-slate-700 transition-colors">
                      <Download className="w-4 h-4 rotate-180" />
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleAvatarChange}
                        className="hidden"
                      />
                    </label>
                  </div>
                  <div className="text-center sm:text-left">
                    <h4 className="font-bold text-slate-800 text-sm">Profile Picture</h4>
                    <p className="text-xs text-slate-400 mt-1">PNG, JPG, or GIF. Max 250KB size limit.</p>
                    {profileAvatar && (
                      <button
                        type="button"
                        onClick={() => setProfileAvatar('')}
                        className="mt-2 text-xs font-bold text-rose-600 hover:text-rose-700 cursor-pointer"
                      >
                        Remove Picture
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                      Full Name
                    </label>
                    <input
                      type="text"
                      required
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      className="block w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-950 font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                      Email Address
                    </label>
                    <input
                      type="email"
                      required
                      value={profileEmail}
                      onChange={(e) => setProfileEmail(e.target.value)}
                      className="block w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-950 font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                      Mobile Number
                    </label>
                    <input
                      type="text"
                      value={profilePhone}
                      onChange={(e) => setProfilePhone(e.target.value)}
                      className="block w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-950 font-medium"
                      placeholder="Optional"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                      TCS Employee ID (Read-only)
                    </label>
                    <input
                      type="text"
                      disabled
                      value={user.employeeId}
                      className="block w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-sm text-slate-400 font-mono font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                      Corporate Department (Read-only)
                    </label>
                    <input
                      type="text"
                      disabled
                      value={user.department}
                      className="block w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-sm text-slate-400 font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                      Location (Read-only)
                    </label>
                    <input
                      type="text"
                      disabled
                      value={user.businessUnit}
                      className="block w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-sm text-slate-400 font-bold"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    className={`px-6 py-2.5 ${THEMES[theme]?.primaryBtn || 'bg-[#003366] hover:bg-blue-900'} text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-sm uppercase tracking-wider`}
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </div>

            {/* Right Column: Security & Preferences */}
            <div className="space-y-8">
              
              {/* Security/Password Change Card */}
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
                <h3 className="font-display font-bold text-slate-900 text-sm mb-1">Change Password</h3>
                <p className="text-[11px] text-slate-500 mb-4">Ensure your account uses a secure password phrase.</p>

                {passwordError && (
                  <div className="mb-3 p-2 bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-semibold rounded-lg">
                    {passwordError}
                  </div>
                )}

                {passwordSuccess && (
                  <div className="mb-3 p-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-semibold rounded-lg">
                    {passwordSuccess}
                  </div>
                )}

                <form onSubmit={handlePasswordChange} className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-600 uppercase tracking-wider mb-1">
                      Current Password
                    </label>
                    <input
                      type="password"
                      required
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="block w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-950"
                      placeholder="Enter current password"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold text-slate-600 uppercase tracking-wider mb-1">
                      New Password
                    </label>
                    <input
                      type="password"
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="block w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-950"
                      placeholder="At least 6 characters"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold text-slate-600 uppercase tracking-wider mb-1">
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="block w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-950"
                      placeholder="Repeat new password"
                    />
                  </div>

                  <button
                    type="submit"
                    className={`w-full mt-1 py-2 ${THEMES[theme]?.primaryBtn || 'bg-[#003366] hover:bg-blue-900'} text-white text-[10px] font-bold rounded-lg transition-colors cursor-pointer shadow-sm uppercase tracking-wider`}
                  >
                    Update Password
                  </button>
                </form>
              </div>

              {/* Theme Preferences Card */}
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
                <h3 className="font-display font-bold text-slate-900 text-sm mb-1">Portal Theme Preferences</h3>
                <p className="text-[11px] text-slate-500 mb-4">TCS Blue is the default campus look. Midnight is optional for the header only.</p>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleThemeChange('blue')}
                    className={`p-3 rounded-2xl border text-center flex flex-col items-center gap-1.5 cursor-pointer transition-all ${
                      theme === 'blue' ? 'border-[#003366] bg-blue-50/40 text-[#003366] font-bold' : 'border-slate-200 hover:border-slate-300 text-slate-600'
                    }`}
                  >
                    <div className="w-6 h-6 rounded-full bg-[#003366] border border-white/20 shadow-sm"></div>
                    <span className="text-[10px]">TCS Blue</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleThemeChange('dark')}
                    className={`p-3 rounded-2xl border text-center flex flex-col items-center gap-1.5 cursor-pointer transition-all ${
                      theme === 'dark' ? 'border-slate-800 bg-slate-50 text-slate-950 font-bold' : 'border-slate-200 hover:border-slate-300 text-slate-600'
                    }`}
                  >
                    <div className="w-6 h-6 rounded-full bg-[#0f172a] border border-white/20 shadow-sm"></div>
                    <span className="text-[10px]">Midnight</span>
                  </button>
                </div>
              </div>

            </div>

          </div>
        )}

        {activeTab === 'concerns' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm">
              <div className="mb-6">
                <h3 className="font-display font-bold text-slate-900 text-lg">Raise a Concern</h3>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  File a ticket for court problems, app issues, or general process concerns.
                  Court → Security, Application → IT, General → Admin. Unactioned tickets escalate after 10 minutes.
                </p>
              </div>
              <RaiseConcernForm user={user} />
            </div>
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm">
              <TicketInbox user={user} showMine title="My submitted tickets" />
            </div>
          </div>
        )}
      </main>

      <footer className="h-10 bg-white/70 border-t border-slate-200 px-6 flex items-center justify-between text-[11px] font-medium text-slate-500 shrink-0">
        <span className="truncate">{user.businessUnit || 'TCS Campus'} · Employee Hub</span>
        <div className="flex gap-2 items-center shrink-0">
          <span className="w-2 h-2 bg-[#003366] rounded-full animate-pulse" />
          <span>TCS Play-Smart Employee</span>
        </div>
      </footer>

      {/* Booking Confirmation Dialog Modal */}
      {bookingModal && (() => {
        const slotBookings = bookings.filter(b => b.facilityId === bookingModal.facility.facilityId && sameSlot(b.slotTime, bookingModal.slot) && b.status !== 'cancelled');
        const slotPending = pendingInvites.filter(i => i.facilityId === bookingModal.facility.facilityId && sameSlot(i.slotTime, bookingModal.slot));
        const myBooking = slotBookings.find(b => b.employeeId === user.employeeId);
        const isJoined = !!myBooking;
        const capacity = getCourtCapacity(bookingModal.facility);
        const occupied = getOccupiedCount(bookingModal.facility.facilityId, bookingModal.slot);
        const isFull = occupied >= capacity;
        const seatsLeft = Math.max(0, capacity - occupied);
        const slotStatus = getSlotStatus(bookingModal.facility.facilityId, bookingModal.slot);
        const isBookedOrPlaying = slotStatus === 'booked' || slotStatus === 'playing';
        const userIsWaitlisted = isWaitlisted(bookingModal.facility.facilityId, bookingModal.slot);
        const wEntry = waitlist.find(w => w.employeeId === user.employeeId && w.facilityId === bookingModal.facility.facilityId && w.slotTime === bookingModal.slot);

        const modalTitle = isJoined
          ? 'Manage Reservation'
          : (isFull ? 'Waitlist for Sport Slot' : 'Confirm booking');

        return (
          <Modal
            isOpen
            onClose={() => {
              setBookingModal(null);
              setErrorMsg('');
            }}
            title={modalTitle}
            maxWidthClass="max-w-lg"
          >
                <p className="text-xs text-slate-500 -mt-1 mb-1">
                  {isJoined 
                    ? 'You are registered for this match slot. You can cancel below.' 
                    : (isFull 
                        ? 'This slot is fully booked (including pending invites). You can join the waitlist.' 
                        : 'Your seat confirms immediately. Inviting teammates is optional.')}
                </p>

                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 my-5 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-semibold">TCS Player Name:</span>
                    <span className="text-slate-800 font-bold">{user.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-semibold">Employee ID:</span>
                    <span className="text-slate-800 font-bold font-mono">{user.employeeId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-semibold">Activity Sport:</span>
                    <span className="text-blue-700 font-bold">{bookingModal.facility.sport}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-semibold">Facility Court:</span>
                    <span className="text-slate-800 font-bold">{bookingModal.facility.courtName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-semibold">Reserved Slot:</span>
                    <span className="text-amber-600 font-bold font-mono">{bookingModal.slot}</span>
                  </div>
                  {isBookedOrPlaying && (
                    <div className="flex justify-between border-t border-slate-200 pt-2 mt-2">
                      <span className="text-slate-400 font-semibold">Current Waitlist:</span>
                      <span className="text-amber-700 font-bold font-mono">{getWaitlistCount(bookingModal.facility.facilityId, bookingModal.slot)} Employees</span>
                    </div>
                  )}
                </div>

                {isBookedOrPlaying && !isJoined ? (
                  userIsWaitlisted ? (
                    <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs p-3 rounded-xl flex items-start gap-2 mb-4">
                      <Clock className="w-4 h-4 shrink-0 text-amber-600" />
                      <div>
                        <span className="font-bold">You are already on the waitlist!</span>
                        <p className="mt-0.5 leading-relaxed text-amber-700">
                          We will automatically register your booking and notify you immediately if any player cancels.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-blue-50 border border-blue-100 text-blue-800 text-xs p-3 rounded-xl flex items-start gap-2 mb-4">
                      <Info className="w-4 h-4 shrink-0 text-blue-500" />
                      <div>
                        <span className="font-bold">Waitlist Auto-Promotion</span>
                        <p className="mt-0.5 leading-relaxed text-blue-700">
                          If a player cancels, the next player on the waitlist is instantly confirmed. First-come, first-served.
                        </p>
                      </div>
                    </div>
                  )
                ) : isSecurityBookingOnly ? (
                  <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs p-3 rounded-xl flex items-start gap-2 mb-4">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                    <div>
                      <span className="font-bold">Employee online booking closed</span>
                      <p className="mt-0.5 leading-relaxed text-amber-700">
                        Self-service is available 10:00 AM – 8:00 PM. Ask the Security desk for assisted booking anytime facilities are open (5:00 AM – 8:00 PM).
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="mb-4 bg-slate-50 border border-slate-200 p-4 rounded-2xl space-y-3">
                      <span className="text-xs font-bold text-slate-850 uppercase tracking-wide block">
                        Your Player Details
                      </span>
                      <div className="grid grid-cols-2 gap-4 text-xs">
                        <div>
                          <span className="text-slate-400 block font-semibold">Name</span>
                          <span className="text-slate-850 font-bold">{user.name}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block font-semibold">Employee ID</span>
                          <span className="text-slate-850 font-bold font-mono">{user.employeeId}</span>
                        </div>
                      </div>
                    </div>

                    <div className="mb-4 border-t border-slate-200 pt-4">
                      <span className="text-xs font-bold text-slate-700 uppercase tracking-wide block mb-2">
                        Seats ({occupied} / {capacity}) — {seatsLeft} free
                      </span>
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 divide-y divide-slate-100 max-h-36 overflow-y-auto">
                        {slotBookings.map((player, idx) => (
                          <div key={player.bookingId} className="py-1.5 flex justify-between text-xs text-slate-700">
                            <span className="font-semibold">{idx + 1}. {player.employeeName} {player.employeeId === user.employeeId && <span className="text-blue-600 font-bold">(You)</span>}</span>
                            <span className="font-mono text-emerald-600">Confirmed</span>
                          </div>
                        ))}
                        {slotPending.map((inv, idx) => (
                          <div key={inv.inviteId} className="py-1.5 flex justify-between text-xs text-slate-700">
                            <span className="font-semibold">{slotBookings.length + idx + 1}. {inv.inviteeName}</span>
                            <span className="font-mono text-amber-600">Pending {formatInviteCountdown(inv.expiresAt)}</span>
                          </div>
                        ))}
                        {slotBookings.length === 0 && slotPending.length === 0 && (
                          <div className="py-2 text-center text-xs text-slate-400 italic">No players yet. Book and invite teammates.</div>
                        )}
                      </div>
                    </div>

                    {!isJoined && !isFull && (
                      <div className="mb-4 border border-slate-200 rounded-2xl p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <UserPlus className="w-4 h-4 text-[#003366]" />
                          <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                            Invite players (optional)
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 leading-relaxed">
                          Leave blank to book alone. Unregistered IDs cannot be invited. Each invite reserves a seat for 5 minutes.
                        </p>
                        {inviteRows.map((row, idx) => (
                          <div key={idx} className="grid grid-cols-2 gap-2">
                            <div>
                              <label htmlFor={`invite_emp_${idx}`} className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                                Employee ID
                              </label>
                              <input
                                id={`invite_emp_${idx}`}
                                value={row.employeeId}
                                onChange={(e) => {
                                  const next = [...inviteRows];
                                  next[idx] = { ...next[idx], employeeId: e.target.value };
                                  setInviteRows(next);
                                }}
                                placeholder="e.g. EMP123"
                                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl font-mono"
                              />
                            </div>
                            <div>
                              <label htmlFor={`invite_name_${idx}`} className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                                Registered name
                              </label>
                              <input
                                id={`invite_name_${idx}`}
                                value={row.name}
                                onChange={(e) => {
                                  const next = [...inviteRows];
                                  next[idx] = { ...next[idx], name: e.target.value };
                                  setInviteRows(next);
                                }}
                                placeholder="Exact registered name"
                                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl"
                              />
                            </div>
                          </div>
                        ))}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={inviteRows.length >= seatsLeft - 1}
                            onClick={() => setInviteRows([...inviteRows, { employeeId: '', name: '' }])}
                            className="text-[11px] font-bold text-[#003366] hover:underline disabled:text-slate-400 disabled:no-underline cursor-pointer"
                          >
                            + Add another player
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
                    )}

                    {!isJoined && !isFull && (
                      <div className="bg-blue-50 border border-blue-100 text-blue-800 text-xs p-3 rounded-xl flex items-start gap-2 mb-4">
                        <Info className="w-4 h-4 shrink-0 text-blue-500" />
                        <div>
                          <span className="font-bold">Invite rules</span>
                          <p className="mt-0.5 leading-relaxed text-blue-700">
                            Your seat confirms now. Invitees get in-app + email notice and must Accept within 5 minutes or the invite expires.
                          </p>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {errorMsg && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs p-3 rounded-xl mb-4">
                    {errorMsg}
                  </div>
                )}

                <div className="flex gap-3 mt-6">
                  <button
                    id="cancel_booking_confirm_modal"
                    onClick={() => {
                      setBookingModal(null);
                      setErrorMsg('');
                    }}
                    className="flex-1 py-3 border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                  >
                    Close
                  </button>
                  {isJoined ? (
                    <button
                      id="leave_match_modal_btn"
                      onClick={() => {
                        handleCancelBooking(myBooking.bookingId);
                        setBookingModal(null);
                      }}
                      className="flex-1 py-3 text-xs font-bold rounded-xl text-white bg-rose-600 hover:bg-rose-700 shadow-md cursor-pointer transition-colors"
                    >
                      Leave Match
                    </button>
                  ) : isBookedOrPlaying ? (
                    userIsWaitlisted ? (
                      <button
                        id="leave_waitlist_modal_btn"
                        onClick={() => {
                          if (wEntry) handleLeaveWaitlist(wEntry.waitlistId);
                          setBookingModal(null);
                        }}
                        className="flex-1 py-3 text-xs font-bold rounded-xl text-white bg-rose-600 hover:bg-rose-700 shadow-md cursor-pointer transition-colors"
                      >
                        Leave Waitlist
                      </button>
                    ) : (
                      <button
                        id="join_waitlist_modal_btn"
                        onClick={() => handleJoinWaitlist(bookingModal.facility, bookingModal.slot)}
                        className="flex-1 py-3 text-xs font-bold rounded-xl text-white bg-amber-600 hover:bg-amber-700 shadow-md cursor-pointer transition-colors"
                      >
                        Join Waitlist
                      </button>
                    )
                  ) : (
                    <button
                      id="submit_booking_confirm_modal"
                      disabled={isSecurityBookingOnly || !isOnlineBookingOpen || slotStatus === 'past'}
                      onClick={handleCreateBooking}
                      className={`flex-1 py-3 text-xs font-bold rounded-xl text-white transition-all cursor-pointer ${
                        isSecurityBookingOnly || !isOnlineBookingOpen || slotStatus === 'past'
                          ? 'bg-slate-400 cursor-not-allowed shadow-none'
                          : 'bg-[#003366] hover:bg-[#002244] shadow-md'
                      }`}
                    >
                      {slotStatus === 'past'
                        ? 'Slot time passed'
                        : !isOnlineBookingOpen
                          ? 'Booking frozen now'
                          : 'Confirm booking'}
                    </button>
                  )}
                </div>
          </Modal>
        );
      })()}

      {/* QR Code Pass Simulator Modal */}
      {qrModal && (
        <Modal isOpen onClose={() => setQrModal(null)} title="TCS PlayPass" maxWidthClass="max-w-sm">
              <div className="text-center">
              <h4 className="font-display font-bold text-slate-800 text-base">{qrModal.sport} Check-In</h4>
              <p className="text-[10px] text-slate-400 font-mono mt-0.5">{qrModal.courtName} | {qrModal.slotTime}</p>

              {(() => {
                const matchPlayers = bookings.filter(b => b.facilityId === qrModal.facilityId && sameSlot(b.slotTime, qrModal.slotTime) && b.status !== 'cancelled');
                return (
                  <div className="mt-2.5 p-2.5 bg-slate-50 border border-slate-100 rounded-xl text-[10px] max-w-[240px] mx-auto text-left">
                    <span className="font-bold text-slate-500 block uppercase tracking-wider mb-1 text-center text-[9px]">Players Joined:</span>
                    <div className="space-y-0.5 text-slate-800 font-medium font-mono text-center leading-tight">
                      {matchPlayers.map((player) => (
                        <div key={player.bookingId}>
                          • {player.employeeName} ({player.employeeId})
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Simulated QR block */}
              <div className="my-5 flex flex-col items-center gap-2">
                <QRCodeSVG value={qrModal.bookingId} size={150} />
                <div className="text-[10px] font-mono text-slate-400 uppercase tracking-widest mt-1">
                  PASS_ID: {qrModal.bookingId}
                </div>
              </div>

              <p className="text-[11px] text-slate-500 max-w-xs mx-auto mb-4 px-2">
                Present this digital QR ticket at the security gate of {qrModal.courtName}. Attendance is marked only after Security scans your pass and confirms you are present.
              </p>

              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-left">
                <span className="font-bold text-amber-900 block mb-1">Attendance rule</span>
                <p className="text-amber-800/90 leading-relaxed text-[11px]">
                  You cannot self-check-in. Security must scan this QR (or enter your Pass ID) and confirm your presence at the gate before status becomes <strong>Checked in</strong>.
                </p>
              </div>
              </div>
        </Modal>
      )}

      <Modal
        isOpen={!!pendingConfirm}
        onClose={() => setPendingConfirm(null)}
        title={pendingConfirm?.title || 'Confirm'}
        maxWidthClass="max-w-md"
      >
        <p className="text-sm text-slate-600 leading-relaxed">{pendingConfirm?.message}</p>
        <div className="flex gap-3 mt-6">
          <button
            type="button"
            onClick={() => setPendingConfirm(null)}
            className="flex-1 py-2.5 border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
          >
            Keep
          </button>
          <button
            type="button"
            onClick={() => pendingConfirm?.onConfirm()}
            className={`flex-1 py-2.5 text-xs font-bold rounded-xl text-white cursor-pointer ${
              pendingConfirm?.danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-[#003366] hover:bg-[#002244]'
            }`}
          >
            {pendingConfirm?.confirmLabel || 'Confirm'}
          </button>
        </div>
      </Modal>

      <AIChatAssistant user={user} />
    </div>
  );
}
